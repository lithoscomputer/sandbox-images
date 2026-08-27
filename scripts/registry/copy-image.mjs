#!/usr/bin/env node

import { createHash } from "node:crypto";
import process from "node:process";

const registry = process.env.REGISTRY || "https://ghcr.io";
const actor = requiredEnv("GITHUB_ACTOR");
const githubToken = requiredEnv("GITHUB_TOKEN");
const manifestAccept = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.oci.artifact.manifest.v1+json",
].join(", ");
const indexMediaTypes = new Set([
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
]);
const manifestMediaTypes = new Set([
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.oci.artifact.manifest.v1+json",
]);

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

function parseReference(value) {
  const registryPrefix = `${new URL(registry).host}/`;
  const normalized = value.startsWith(registryPrefix) ? value.slice(registryPrefix.length) : value;
  const separator = normalized.lastIndexOf(":");
  const slash = normalized.lastIndexOf("/");
  if (separator <= slash || separator === normalized.length - 1) {
    throw new Error(`Image reference must include a tag: ${value}`);
  }
  return {
    repository: normalized.slice(0, separator).toLowerCase(),
    reference: normalized.slice(separator + 1),
  };
}

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function token(scopes, forceRefresh = false) {
  if (!forceRefresh && cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;
  const basic = Buffer.from(`${actor}:${githubToken}`).toString("base64");
  const tokenUrl = new URL(`${registry}/token`);
  tokenUrl.searchParams.set("service", new URL(registry).host);
  for (const scope of scopes) tokenUrl.searchParams.append("scope", scope);
  const response = await fetch(tokenUrl, {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!response.ok) throw new Error(`Registry authentication failed: ${response.status}`);
  const credentials = await response.json();
  cachedToken = credentials.token;
  const expiresIn = Number(credentials.expires_in);
  cachedTokenExpiresAt = Date.now()
    + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 60_000)
    - 30_000;
  return cachedToken;
}

async function request(scopes, url, options = {}) {
  const send = async (forceRefresh = false) => fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${await token(scopes, forceRefresh)}`,
    },
  });
  let response = await send();
  if (response.status === 401) response = await send(true);
  return response;
}

function manifestUrl(repository, reference) {
  return `${registry}/v2/${repository}/manifests/${encodeURIComponent(reference)}`;
}

async function readManifest(repository, reference, scopes) {
  const response = await request(scopes, manifestUrl(repository, reference), {
    headers: { Accept: manifestAccept },
  });
  if (!response.ok) {
    throw new Error(`Read manifest ${repository}:${reference}: ${response.status} ${await response.text()}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = (response.headers.get("content-type") || "").split(";")[0];
  const calculatedDigest = digest(bytes);
  const registryDigest = response.headers.get("docker-content-digest") || calculatedDigest;
  if (registryDigest !== calculatedDigest) {
    throw new Error(`Manifest digest mismatch for ${repository}:${reference}`);
  }
  return {
    bytes,
    contentType,
    digest: calculatedDigest,
    document: JSON.parse(bytes),
  };
}

async function manifestExists(repository, reference, scopes) {
  const response = await request(scopes, manifestUrl(repository, reference), {
    method: "HEAD",
    headers: { Accept: manifestAccept },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Check manifest ${repository}:${reference}: ${response.status} ${await response.text()}`);
  }
  return true;
}

async function mountBlob(sourceRepository, targetRepository, blobDigest, scopes) {
  if (sourceRepository === targetRepository) return;
  const uploadUrl = new URL(`${registry}/v2/${targetRepository}/blobs/uploads/`);
  uploadUrl.searchParams.set("mount", blobDigest);
  uploadUrl.searchParams.set("from", sourceRepository);
  const response = await request(scopes, uploadUrl, { method: "POST" });
  if (response.status !== 201) {
    throw new Error(
      `Mount ${blobDigest} from ${sourceRepository} into ${targetRepository}: ${response.status} ${await response.text()}`,
    );
  }
}

async function writeManifest(repository, reference, manifest, scopes) {
  const response = await request(scopes, manifestUrl(repository, reference), {
    method: "PUT",
    body: manifest.bytes,
    duplex: "half",
    headers: { "Content-Type": manifest.contentType },
  });
  if (!response.ok) {
    throw new Error(`Write manifest ${repository}:${reference}: ${response.status} ${await response.text()}`);
  }
}

function isManifestDescriptor(descriptor) {
  return descriptor?.digest
    && (indexMediaTypes.has(descriptor.mediaType) || manifestMediaTypes.has(descriptor.mediaType));
}

async function copyGraph(sourceRepository, targetRepository, reference, scopes, copied) {
  const manifest = await readManifest(sourceRepository, reference, scopes);
  if (copied.has(manifest.digest)) return manifest;

  if (indexMediaTypes.has(manifest.contentType)) {
    for (const descriptor of manifest.document.manifests || []) {
      if (!isManifestDescriptor(descriptor)) {
        throw new Error(`Image index contains an unsupported descriptor: ${descriptor?.mediaType || "unknown"}`);
      }
      await copyGraph(sourceRepository, targetRepository, descriptor.digest, scopes, copied);
    }
  } else if (manifestMediaTypes.has(manifest.contentType)) {
    if (isManifestDescriptor(manifest.document.subject)) {
      await copyGraph(
        sourceRepository,
        targetRepository,
        manifest.document.subject.digest,
        scopes,
        copied,
      );
    }
    const blobs = [
      manifest.document.config,
      ...(manifest.document.layers || []),
      ...(manifest.document.blobs || []),
    ].filter(Boolean);
    for (const descriptor of blobs) {
      if (!descriptor.digest) throw new Error("Manifest contains a blob without a digest");
      await mountBlob(sourceRepository, targetRepository, descriptor.digest, scopes);
    }
  } else {
    throw new Error(`Unsupported manifest media type: ${manifest.contentType || "unknown"}`);
  }

  if (sourceRepository !== targetRepository) {
    await writeManifest(targetRepository, manifest.digest, manifest, scopes);
  }
  copied.add(manifest.digest);
  return manifest;
}

async function copy() {
  const source = parseReference(option("--source"));
  const target = parseReference(option("--target"));
  const ifAbsent = process.argv.includes("--if-absent");
  const scopes = [
    `repository:${source.repository}:pull`,
    `repository:${target.repository}:pull,push`,
  ];

  if (ifAbsent && await manifestExists(target.repository, target.reference, scopes)) {
    console.log(`Target already exists; kept ${target.repository}:${target.reference}`);
    return;
  }

  const manifest = await copyGraph(
    source.repository,
    target.repository,
    source.reference,
    scopes,
    new Set(),
  );
  await writeManifest(target.repository, target.reference, manifest, scopes);
  const targetManifest = await readManifest(target.repository, target.reference, scopes);
  if (targetManifest.digest !== manifest.digest) {
    throw new Error(
      `Copied manifest digest changed: source ${manifest.digest}; target ${targetManifest.digest}`,
    );
  }
  console.log(
    `Copied ${source.repository}:${source.reference} to ${target.repository}:${target.reference} (${manifest.digest})`,
  );
}

const command = process.argv[2];
if (command === "copy") await copy();
else throw new Error(`Unknown command: ${command}`);
