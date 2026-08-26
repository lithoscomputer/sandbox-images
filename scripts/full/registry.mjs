#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { Transform } from "node:stream";

const registry = "https://ghcr.io";
const image = requiredEnv("IMAGE").toLowerCase();
const actor = requiredEnv("GITHUB_ACTOR");
const githubToken = requiredEnv("GITHUB_TOKEN");

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

async function token() {
  const basic = Buffer.from(`${actor}:${githubToken}`).toString("base64");
  const response = await fetch(
    `${registry}/token?service=ghcr.io&scope=repository:${image}:pull,push`,
    { headers: { Authorization: `Basic ${basic}` } },
  );
  if (!response.ok) throw new Error(`GHCR authentication failed: ${response.status}`);
  return (await response.json()).token;
}

function absoluteLocation(location) {
  if (!location) throw new Error("GHCR did not return an upload location");
  return location.startsWith("http") ? location : `${registry}${location}`;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${await token()}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method || "GET"} ${url}: ${response.status} ${body}`);
  }
  return response;
}

async function beginUpload() {
  return request(`${registry}/v2/${image}/blobs/uploads/`, { method: "POST" });
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
  response = await request(absoluteLocation(response.headers.get("location")), {
    method: "PATCH",
    body: bytes,
    duplex: "half",
    headers: { "Content-Type": "application/octet-stream" },
  });
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

  let bytesRead = 0;
  const counter = new Transform({
    transform(chunk, encoding, callback) {
      bytesRead += chunk.length;
      if (bytesRead % (512 * 1024 * 1024) < chunk.length) {
        console.log(`Uploaded ${Math.round(bytesRead / 1024 / 1024)} MiB`);
      }
      callback(null, chunk);
    },
  });

  // The digest files are completed by the two tee processes when stdin closes.
  let response = await beginUpload();
  process.stdin.pipe(counter);
  try {
    response = await request(absoluteLocation(response.headers.get("location")), {
      method: "PATCH",
      body: counter,
      duplex: "half",
      headers: { "Content-Type": "application/octet-stream" },
    });
  } catch (error) {
    process.stdin.unpipe(counter);
    counter.destroy();
    process.stdin.destroy();
    throw error;
  }

  const digest = `sha256:${await readCompletedDigest(digestFile)}`;
  const diffId = `sha256:${await readCompletedDigest(diffIdFile)}`;
  const location = new URL(absoluteLocation(response.headers.get("location")));
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
  const files = (await readdir(metadataDir)).filter((name) => name.endsWith(".json")).sort();
  const metadata = await Promise.all(
    files.map(async (name) => JSON.parse(await readFile(`${metadataDir}/${name}`, "utf8"))),
  );
  if (metadata.length === 0) throw new Error("No layer metadata was found");

  const environment = readRunnerEnvironment(await readFile("/etc/environment", "utf8"));
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
    "io.lithos.image.ubuntu-version": requiredEnv("UBUNTU_VERSION"),
  };
  const config = Buffer.from(JSON.stringify({
    created,
    architecture: "amd64",
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

  const tags = ["latest", version];
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
