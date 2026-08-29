#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import process from "node:process";

const registry = process.env.REGISTRY || "https://ghcr.io";
const image = requiredEnv("IMAGE").toLowerCase();
const actor = requiredEnv("GITHUB_ACTOR");
const githubToken = requiredEnv("GITHUB_TOKEN");
let cachedToken;
let cachedTokenExpiresAt = 0;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`${name} is required`);
  }
  return process.argv[index + 1];
}

async function token(forceRefresh = false) {
  if (!forceRefresh && cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;
  const basic = Buffer.from(`${actor}:${githubToken}`).toString("base64");
  const response = await fetch(
    `${registry}/token?service=ghcr.io&scope=repository:${image}:pull,push`,
    { headers: { Authorization: `Basic ${basic}` } },
  );
  if (!response.ok) throw new Error(`GHCR authentication failed: ${response.status}`);
  const credentials = await response.json();
  cachedToken = credentials.token;
  const expiresIn = Number(credentials.expires_in);
  cachedTokenExpiresAt = Date.now() + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 60_000) - 30_000;
  return cachedToken;
}

function absoluteLocation(location) {
  if (!location) throw new Error("GHCR did not return an upload location");
  return location.startsWith("http") ? location : `${registry}${location}`;
}

async function request(url, options = {}) {
  const send = async (forceRefresh = false) => fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${await token(forceRefresh)}`,
    },
  });
  let response = await send();
  if (response.status === 401) response = await send(true);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method || "GET"} ${url}: ${response.status} ${body}`);
  }
  return response;
}

async function beginUpload() {
  return request(`${registry}/v2/${image}/blobs/uploads/`, { method: "POST" });
}

async function patchUpload(location, bytes, offset) {
  const end = offset + bytes.length - 1;
  const response = await request(location, {
    method: "PATCH",
    body: bytes,
    duplex: "half",
    headers: {
      "Content-Length": String(bytes.length),
      "Content-Range": `${offset}-${end}`,
      "Content-Type": "application/octet-stream",
    },
  });
  const range = response.headers.get("range");
  if (range) {
    const match = /^(?:bytes=)?0-(\d+)$/.exec(range);
    if (!match || Number(match[1]) !== end) {
      throw new Error(`Registry accepted an unexpected upload range: ${range}; expected 0-${end}`);
    }
  }
  return response;
}

async function manifestExists() {
  const tag = option("--tag");
  const response = await fetch(`${registry}/v2/${image}/manifests/${encodeURIComponent(tag)}`, {
    method: "HEAD",
    headers: {
      Accept: "application/vnd.oci.image.manifest.v1+json",
      Authorization: `Bearer ${await token()}`,
    },
  });
  if (response.status !== 200 && response.status !== 404) {
    throw new Error(`HEAD manifest ${tag}: ${response.status} ${await response.text()}`);
  }
  const exists = response.status === 200;
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `exists=${exists}\n`);
  }
  console.log(exists ? `Image version ${tag} already exists` : `Image version ${tag} is new`);
}

async function uploadBytes(bytes) {
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  let response = await beginUpload();
  response = await patchUpload(absoluteLocation(response.headers.get("location")), bytes, 0);
  const location = new URL(absoluteLocation(response.headers.get("location")));
  location.searchParams.set("digest", digest);
  await request(location, {
    method: "PUT",
    headers: { "Content-Length": "0" },
  });
  return digest;
}

async function uploadLayer() {
  const diffIdFile = option("--diff-id-file");
  const digestFile = option("--digest-file");
  const output = option("--output");

  // GHCR rejects PATCH request bodies larger than 4 MiB.
  const uploadChunkSize = Number(process.env.UPLOAD_CHUNK_SIZE || 4 * 1024 * 1024);
  if (!Number.isSafeInteger(uploadChunkSize) || uploadChunkSize <= 0) {
    throw new Error("UPLOAD_CHUNK_SIZE must be a positive integer");
  }
  const progressInterval = 512 * 1024 * 1024;
  let bytesRead = 0;
  let pendingChunks = [];
  let pendingSize = 0;
  let response = await beginUpload();
  let uploadLocation = absoluteLocation(response.headers.get("location"));

  async function flushChunk() {
    if (pendingSize === 0) return;
    const bytes = Buffer.concat(pendingChunks, pendingSize);
    const previousBytes = bytesRead;
    response = await patchUpload(uploadLocation, bytes, bytesRead);
    uploadLocation = absoluteLocation(response.headers.get("location"));
    bytesRead += bytes.length;
    pendingChunks = [];
    pendingSize = 0;
    if (Math.floor(previousBytes / progressInterval) < Math.floor(bytesRead / progressInterval)) {
      console.log(`Uploaded ${Math.round(bytesRead / 1024 / 1024)} MiB`);
    }
  }

  try {
    for await (const chunk of process.stdin) {
      let offset = 0;
      while (offset < chunk.length) {
        const length = Math.min(uploadChunkSize - pendingSize, chunk.length - offset);
        pendingChunks.push(chunk.subarray(offset, offset + length));
        pendingSize += length;
        offset += length;
        if (pendingSize === uploadChunkSize) await flushChunk();
      }
    }
    await flushChunk();
  } catch (error) {
    process.stdin.destroy();
    throw error;
  }

  // The digest files are completed by the two tee processes when stdin closes.
  const digest = `sha256:${await readCompletedDigest(digestFile)}`;
  const diffId = `sha256:${await readCompletedDigest(diffIdFile)}`;
  const location = new URL(uploadLocation);
  location.searchParams.set("digest", digest);
  await request(location, {
    method: "PUT",
    headers: { "Content-Length": "0" },
  });

  await writeFile(
    output,
    JSON.stringify({
      diffId,
      layer: {
        mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
        size: bytesRead,
        digest,
      },
    }),
  );
}

async function readCompletedDigest(path) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const value = (await readFile(path, "utf8")).trim();
      if (/^[a-f0-9]{64}$/.test(value)) return value;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Digest was not completed: ${path}`);
}

function readRunnerEnvironment(contents) {
  const entries = [];
  const values = {};
  for (const line of contents.split("\n")) {
    if (!line || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    const value = line.slice(index + 1).replace(/^"|"$/g, "");
    entries.push(`${key}=${value}`);
    values[key] = value;
  }
  return { entries, values };
}

async function publish() {
  const metadataDir = option("--metadata-dir");
  const architecture = requiredEnv("ARCHITECTURE");
  if (!new Set(["amd64", "arm64"]).has(architecture)) {
    throw new Error(`Unsupported architecture: ${architecture}`);
  }
  const files = (await readdir(metadataDir)).filter((name) => name.endsWith(".json")).sort();
  const metadata = await Promise.all(
    files.map(async (name) => JSON.parse(await readFile(`${metadataDir}/${name}`, "utf8"))),
  );
  if (metadata.length === 0) throw new Error("No layer metadata was found");

  const environmentFile = process.env.RUNNER_ENVIRONMENT_FILE || "/etc/environment";
  const environment = readRunnerEnvironment(await readFile(environmentFile, "utf8"));
  environment.entries.push("ACT_TOOLSDIRECTORY=/opt/acttoolcache");
  const created = new Date().toISOString();
  const version = environment.values.ImageVersion || process.env.GITHUB_SHA;
  const source = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`;
  const labels = {
    "org.opencontainers.image.created": created,
    "org.opencontainers.image.description": "Filesystem capture of a GitHub-hosted Ubuntu runner",
    "org.opencontainers.image.revision": process.env.GITHUB_SHA,
    "org.opencontainers.image.source": source,
    "org.opencontainers.image.version": version,
    "io.lithos.image.flavor": "full",
    "io.lithos.image.architecture": architecture,
    "io.lithos.image.ubuntu-version": requiredEnv("UBUNTU_VERSION"),
  };
  const config = Buffer.from(JSON.stringify({
    created,
    architecture,
    os: "linux",
    config: {
      Env: environment.entries,
      Cmd: ["bash"],
      User: "0:0",
      WorkingDir: "/workspace",
      Labels: labels,
    },
    rootfs: { type: "layers", diff_ids: metadata.map((item) => item.diffId) },
    history: metadata.map((_, index) => ({
      created,
      created_by: `GitHub-hosted runner filesystem capture layer ${files[index]}`,
    })),
  }));
  const configDigest = await uploadBytes(config);
  const manifest = Buffer.from(JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      size: config.length,
      digest: configDigest,
    },
    layers: metadata.map((item) => item.layer),
    annotations: labels,
  }));

  const tags = [`latest-${architecture}`, `${version}-${architecture}`];
  for (const tag of tags) {
    await request(`${registry}/v2/${image}/manifests/${tag}`, {
      method: "PUT",
      body: manifest,
      duplex: "half",
      headers: { "Content-Type": "application/vnd.oci.image.manifest.v1+json" },
    });
    console.log(`Published ${registry.slice(8)}/${image}:${tag}`);
  }
}

const command = process.argv[2];
if (command === "upload-layer") await uploadLayer();
else if (command === "publish") await publish();
else if (command === "manifest-exists") await manifestExists();
else throw new Error(`Unknown command: ${command}`);
