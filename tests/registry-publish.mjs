#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "registry-publish-"));
const metadataDirectory = join(temporaryDirectory, "metadata");
const environmentFile = join(temporaryDirectory, "environment");
const layerDigest = `sha256:${"1".repeat(64)}`;
const diffId = `sha256:${"2".repeat(64)}`;
const uploads = [];
const manifests = new Map();
let uploadNumber = 0;

await mkdir(metadataDirectory);
await writeFile(
  join(metadataDirectory, "00-root.json"),
  JSON.stringify({
    diffId,
    layer: {
      mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
      size: 123,
      digest: layerDigest,
    },
  }),
);
await writeFile(environmentFile, "ImageVersion=test-version\nPATH=/usr/bin\n");

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET" && url.pathname === "/token") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ token: "test-token" }));
    return;
  }
  if (request.method === "POST" && url.pathname.endsWith("/blobs/uploads/")) {
    uploadNumber += 1;
    response.writeHead(202, { Location: `http://${request.headers.host}/upload/${uploadNumber}` });
    response.end();
    return;
  }
  if (request.method === "PATCH" && url.pathname.startsWith("/upload/")) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    uploads.push(bytes);
    response.writeHead(202, {
      Location: `http://${request.headers.host}${url.pathname}`,
      Range: `bytes=0-${bytes.length - 1}`,
    });
    response.end();
    return;
  }
  if (request.method === "PUT" && url.pathname.startsWith("/upload/")) {
    const uploaded = uploads.at(-1);
    const digest = `sha256:${createHash("sha256").update(uploaded).digest("hex")}`;
    assert.equal(url.searchParams.get("digest"), digest);
    response.writeHead(201);
    response.end();
    return;
  }
  if (request.method === "PUT" && url.pathname.includes("/manifests/")) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    manifests.set(url.pathname.split("/manifests/")[1], Buffer.concat(chunks));
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
    ["scripts/full/registry.mjs", "publish", "--metadata-dir", metadataDirectory],
    {
      env: {
        ...process.env,
        ARCHITECTURE: "arm64",
        GITHUB_ACTOR: "test-actor",
        GITHUB_REPOSITORY: "test/repository",
        GITHUB_SERVER_URL: "https://github.example",
        GITHUB_SHA: "test-sha",
        GITHUB_TOKEN: "test-token",
        IMAGE: "test/image",
        REGISTRY: `http://127.0.0.1:${address.port}`,
        RUNNER_ENVIRONMENT_FILE: environmentFile,
        UBUNTU_VERSION: "24.04",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const [exitCode] = await once(child, "exit");
  assert.equal(exitCode, 0, stderr);

  assert.deepEqual([...manifests.keys()].sort(), ["latest-arm64", "test-version-arm64"]);
  assert.equal(uploads.length, 1);
  const config = JSON.parse(uploads[0]);
  assert.equal(config.architecture, "arm64");
  assert.equal(config.os, "linux");
  assert.equal(config.config.Labels["io.lithos.image.architecture"], "arm64");
  assert.deepEqual(config.rootfs.diff_ids, [diffId]);

  for (const bytes of manifests.values()) {
    const manifest = JSON.parse(bytes);
    assert.equal(manifest.config.digest, `sha256:${createHash("sha256").update(uploads[0]).digest("hex")}`);
    assert.equal(manifest.layers[0].digest, layerDigest);
  }
} finally {
  server.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
}
