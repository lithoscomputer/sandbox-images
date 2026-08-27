#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";

const canonicalImage = "test/canonical";
const aliases = ["test/alias-one", "test/alias-two"];
const sourceTag = "runner-version";
const tags = ["latest", sourceTag];
const digests = [`sha256:${"a".repeat(64)}`, `sha256:${"b".repeat(64)}`];
const manifest = Buffer.from(JSON.stringify({
  schemaVersion: 2,
  mediaType: "application/vnd.oci.image.manifest.v1+json",
  config: {
    mediaType: "application/vnd.oci.image.config.v1+json",
    size: 10,
    digest: digests[0],
  },
  layers: [{
    mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
    size: 20,
    digest: digests[1],
  }],
}));
const mounted = [];
const published = [];
const tokenScopes = [];

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET" && url.pathname === "/token") {
    tokenScopes.push(url.searchParams.getAll("scope"));
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ token: "test-token", expires_in: 300 }));
    return;
  }

  assert.equal(request.headers.authorization, "Bearer test-token");
  if (
    request.method === "GET"
    && url.pathname === `/v2/${canonicalImage}/manifests/${sourceTag}`
  ) {
    response.writeHead(200, {
      "Content-Type": "application/vnd.oci.image.manifest.v1+json",
    });
    response.end(manifest);
    return;
  }

  const mountMatch = /^\/v2\/(.+)\/blobs\/uploads\/$/.exec(url.pathname);
  if (request.method === "POST" && mountMatch) {
    assert.ok(aliases.includes(mountMatch[1]));
    assert.equal(url.searchParams.get("from"), canonicalImage);
    assert.ok(digests.includes(url.searchParams.get("mount")));
    mounted.push(`${mountMatch[1]}:${url.searchParams.get("mount")}`);
    response.writeHead(201);
    response.end();
    return;
  }

  const manifestMatch = /^\/v2\/(.+)\/manifests\/(.+)$/.exec(url.pathname);
  if (request.method === "PUT" && manifestMatch) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), manifest);
    assert.ok(aliases.includes(manifestMatch[1]));
    assert.ok(tags.includes(manifestMatch[2]));
    published.push(`${manifestMatch[1]}:${manifestMatch[2]}`);
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
      "publish-aliases",
      "--source-tag",
      sourceTag,
      "--tags",
      tags.join(","),
    ],
    {
      env: {
        ...process.env,
        GITHUB_ACTOR: "test-actor",
        GITHUB_TOKEN: "test-token",
        IMAGE: canonicalImage,
        IMAGE_ALIASES: aliases.join("\n"),
        REGISTRY: `http://127.0.0.1:${address.port}`,
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
  assert.equal(mounted.length, aliases.length * digests.length);
  assert.equal(published.length, aliases.length * tags.length);
  assert.equal(tokenScopes.length, aliases.length + 1);
  for (const alias of aliases) {
    assert.ok(tokenScopes.some((scopes) => (
      scopes.includes(`repository:${alias}:pull,push`)
      && scopes.includes(`repository:${canonicalImage}:pull`)
    )));
  }
} finally {
  server.close();
}
