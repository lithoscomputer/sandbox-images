#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "registry-upload-"));
const diffIdFile = join(temporaryDirectory, "diff-id");
const digestFile = join(temporaryDirectory, "digest");
const metadataFile = join(temporaryDirectory, "metadata.json");
const input = Buffer.alloc(2560, "a");
const digest = createHash("sha256").update(input).digest("hex");
const uploadedChunks = [];

await writeFile(diffIdFile, `${digest}\n`);
await writeFile(digestFile, `${digest}\n`);

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET" && url.pathname === "/token") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ token: "test-token" }));
    return;
  }
  if (request.method === "POST" && url.pathname.endsWith("/blobs/uploads/")) {
    response.writeHead(202, { Location: `http://${request.headers.host}/upload/1` });
    response.end();
    return;
  }
  if (request.method === "PATCH" && url.pathname === "/upload/1") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    assert.equal(Number(request.headers["content-length"]), bytes.length);
    const offset = uploadedChunks.reduce((total, chunk) => total + chunk.length, 0);
    assert.equal(request.headers["content-range"], `${offset}-${offset + bytes.length - 1}`);
    uploadedChunks.push(bytes);
    const uploadedSize = offset + bytes.length;
    response.writeHead(202, {
      Location: `http://${request.headers.host}/upload/1?offset=${uploadedChunks.length}`,
      Range: `bytes=0-${uploadedSize - 1}`,
    });
    response.end();
    return;
  }
  if (request.method === "PUT" && url.pathname === "/upload/1") {
    assert.equal(url.searchParams.get("digest"), `sha256:${digest}`);
    assert.deepEqual(Buffer.concat(uploadedChunks), input);
    response.writeHead(201);
    response.end();
    return;
  }
  response.writeHead(404);
  response.end();
});

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const child = spawn(
    process.execPath,
    [
      "scripts/full/registry.mjs",
      "upload-layer",
      "--diff-id-file",
      diffIdFile,
      "--digest-file",
      digestFile,
      "--output",
      metadataFile,
    ],
    {
      env: {
        ...process.env,
        GITHUB_ACTOR: "test-actor",
        GITHUB_TOKEN: "test-token",
        IMAGE: "test/image",
        REGISTRY: `http://127.0.0.1:${address.port}`,
        UPLOAD_CHUNK_SIZE: "1024",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(input);
  const [exitCode] = await once(child, "exit");
  assert.equal(exitCode, 0, stderr);
  assert.equal(uploadedChunks.length, 3);
  const metadata = JSON.parse(await readFile(metadataFile, "utf8"));
  assert.equal(metadata.diffId, `sha256:${digest}`);
  assert.equal(metadata.layer.digest, `sha256:${digest}`);
  assert.equal(metadata.layer.size, input.length);
} finally {
  server.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
}
