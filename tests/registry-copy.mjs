#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";

const sourceRepository = "test/source";
const targetRepository = "test/target";
const sourceTag = "latest";
const targetTag = "slim";
const immutableTag = "slim-abc123def456";
const indexType = "application/vnd.oci.image.index.v1+json";
const manifestType = "application/vnd.oci.image.manifest.v1+json";
const configType = "application/vnd.oci.image.config.v1+json";
const layerType = "application/vnd.oci.image.layer.v1.tar+gzip";

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function document(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  return { bytes, digest: digest(bytes) };
}

const platformConfig = Buffer.from("platform config");
const platformLayer = Buffer.from("platform layer");
const attestationConfig = Buffer.from("attestation config");
const attestationLayer = Buffer.from("attestation layer");
const blobs = new Map([
  [digest(platformConfig), platformConfig],
  [digest(platformLayer), platformLayer],
  [digest(attestationConfig), attestationConfig],
  [digest(attestationLayer), attestationLayer],
]);
const platform = document({
  schemaVersion: 2,
  mediaType: manifestType,
  config: { mediaType: configType, digest: digest(platformConfig), size: platformConfig.length },
  layers: [{ mediaType: layerType, digest: digest(platformLayer), size: platformLayer.length }],
});
const attestation = document({
  schemaVersion: 2,
  mediaType: manifestType,
  subject: { mediaType: manifestType, digest: platform.digest, size: platform.bytes.length },
  config: {
    mediaType: configType,
    digest: digest(attestationConfig),
    size: attestationConfig.length,
  },
  layers: [{
    mediaType: layerType,
    digest: digest(attestationLayer),
    size: attestationLayer.length,
  }],
});
const imageIndex = document({
  schemaVersion: 2,
  mediaType: indexType,
  manifests: [
    {
      mediaType: manifestType,
      digest: platform.digest,
      size: platform.bytes.length,
      platform: { architecture: "amd64", os: "linux" },
    },
    {
      mediaType: manifestType,
      digest: attestation.digest,
      size: attestation.bytes.length,
      platform: { architecture: "unknown", os: "unknown" },
    },
  ],
});
const sourceManifests = new Map([
  [sourceTag, { ...imageIndex, mediaType: indexType }],
  [platform.digest, { ...platform, mediaType: manifestType }],
  [attestation.digest, { ...attestation, mediaType: manifestType }],
]);
const targetManifests = new Map();
const mounts = [];
const writes = [];
const tokenScopes = [];

function manifestRequest(pathname) {
  const match = /^\/v2\/(.+)\/manifests\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  return { repository: match[1], reference: decodeURIComponent(match[2]) };
}

function sendManifest(response, manifest, includeBody) {
  response.writeHead(200, {
    "Content-Type": manifest.mediaType,
    "Docker-Content-Digest": manifest.digest,
  });
  response.end(includeBody ? manifest.bytes : undefined);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET" && url.pathname === "/token") {
    tokenScopes.push(url.searchParams.getAll("scope"));
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ token: "test-token", expires_in: 300 }));
    return;
  }

  assert.equal(request.headers.authorization, "Bearer test-token");

  const requestedManifest = manifestRequest(url.pathname);
  if ((request.method === "GET" || request.method === "HEAD") && requestedManifest) {
    const collection = requestedManifest.repository === sourceRepository
      ? sourceManifests
      : targetManifests;
    const manifest = collection.get(requestedManifest.reference);
    if (!manifest) {
      response.writeHead(404);
      response.end();
      return;
    }
    sendManifest(response, manifest, request.method === "GET");
    return;
  }

  const mountMatch = /^\/v2\/(.+)\/blobs\/uploads\/$/.exec(url.pathname);
  if (request.method === "POST" && mountMatch) {
    assert.equal(mountMatch[1], targetRepository);
    assert.equal(url.searchParams.get("from"), sourceRepository);
    assert.ok(blobs.has(url.searchParams.get("mount")));
    mounts.push(url.searchParams.get("mount"));
    response.writeHead(201);
    response.end();
    return;
  }

  if (request.method === "PUT" && requestedManifest) {
    assert.equal(requestedManifest.repository, targetRepository);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const manifest = {
      bytes,
      digest: digest(bytes),
      mediaType: request.headers["content-type"],
    };
    if (requestedManifest.reference.startsWith("sha256:")) {
      assert.equal(requestedManifest.reference, manifest.digest);
    }
    targetManifests.set(requestedManifest.reference, manifest);
    writes.push(requestedManifest.reference);
    response.writeHead(201, { "Docker-Content-Digest": manifest.digest });
    response.end();
    return;
  }

  response.writeHead(404);
  response.end();
});

async function runCopy(source, target, ifAbsent = false) {
  const args = ["scripts/registry/copy-image.mjs", "copy", "--source", source, "--target", target];
  if (ifAbsent) args.push("--if-absent");
  const child = spawn(process.execPath, args, {
    env: {
      ...process.env,
      GITHUB_ACTOR: "test-actor",
      GITHUB_TOKEN: "test-token",
      REGISTRY: `http://127.0.0.1:${server.address().port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [exitCode] = await once(child, "exit");
  assert.equal(exitCode, 0, stderr);
  return stdout;
}

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const registryHost = `127.0.0.1:${server.address().port}`;

  await runCopy(
    `${registryHost}/${sourceRepository}:${sourceTag}`,
    `${registryHost}/${targetRepository}:${targetTag}`,
    true,
  );
  assert.equal(targetManifests.get(targetTag).digest, imageIndex.digest);
  assert.deepEqual(new Set(mounts), new Set(blobs.keys()));
  assert.ok(writes.includes(platform.digest));
  assert.ok(writes.includes(attestation.digest));
  assert.ok(writes.includes(imageIndex.digest));
  assert.ok(writes.includes(targetTag));
  assert.ok(tokenScopes.some((scopes) => (
    scopes.includes(`repository:${sourceRepository}:pull`)
    && scopes.includes(`repository:${targetRepository}:pull,push`)
  )));

  const writeCount = writes.length;
  const output = await runCopy(
    `${sourceRepository}:${sourceTag}`,
    `${targetRepository}:${targetTag}`,
    true,
  );
  assert.match(output, /Target already exists/);
  assert.equal(writes.length, writeCount);

  await runCopy(
    `${targetRepository}:${targetTag}`,
    `${targetRepository}:${immutableTag}`,
    true,
  );
  assert.equal(targetManifests.get(immutableTag).digest, imageIndex.digest);
  assert.equal(mounts.length, blobs.size);
} finally {
  server.close();
}
