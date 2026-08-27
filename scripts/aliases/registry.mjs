#!/usr/bin/env node

import process from "node:process";

const registry = process.env.REGISTRY || "https://ghcr.io";
const image = requiredEnv("IMAGE").toLowerCase();
const actor = requiredEnv("GITHUB_ACTOR");
const githubToken = requiredEnv("GITHUB_TOKEN");
const aliasImages = [...new Set(
  requiredEnv("IMAGE_ALIASES")
    .split(/\s+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
)];
const tokenCache = new Map();

if (aliasImages.includes(image)) throw new Error("IMAGE_ALIASES must not include IMAGE");

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

function hasOption(name) {
  return process.argv.includes(name);
}

async function token(repository, scopes, forceRefresh = false) {
  const cacheKey = `${repository}\n${scopes.join("\n")}`;
  const cached = tokenCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() < cached.expiresAt) return cached.token;

  const basic = Buffer.from(`${actor}:${githubToken}`).toString("base64");
  const tokenUrl = new URL(`${registry}/token`);
  tokenUrl.searchParams.set("service", "ghcr.io");
  for (const scope of scopes) tokenUrl.searchParams.append("scope", scope);
  const response = await fetch(tokenUrl, {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!response.ok) {
    throw new Error(`GHCR authentication failed for ${repository}: ${response.status}`);
  }
  const credentials = await response.json();
  const expiresIn = Number(credentials.expires_in);
  const expiresAt = Date.now()
    + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 60_000)
    - 30_000;
  tokenCache.set(cacheKey, { token: credentials.token, expiresAt });
  return credentials.token;
}

async function request(repository, scopes, url, options = {}) {
  const send = async (forceRefresh = false) => fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${await token(repository, scopes, forceRefresh)}`,
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

async function mountBlob(aliasImage, digest) {
  const scopes = [
    `repository:${aliasImage}:pull,push`,
    `repository:${image}:pull`,
  ];
  const uploadUrl = new URL(`${registry}/v2/${aliasImage}/blobs/uploads/`);
  uploadUrl.searchParams.set("mount", digest);
  uploadUrl.searchParams.set("from", image);
  const response = await request(aliasImage, scopes, uploadUrl, { method: "POST" });
  if (response.status !== 201) {
    throw new Error(
      `GHCR could not mount ${digest} from ${image} into ${aliasImage}: ${response.status}`,
    );
  }
}

async function publish() {
  const sourceTag = option("--source-tag");
  const tags = new Set(option("--tags").split(",").map((tag) => tag.trim()).filter(Boolean));
  if (tags.size === 0) throw new Error("--tags must contain at least one tag");

  const response = await request(
    image,
    [`repository:${image}:pull`],
    `${registry}/v2/${image}/manifests/${encodeURIComponent(sourceTag)}`,
    {
      headers: {
        Accept: "application/vnd.oci.image.manifest.v1+json",
      },
    },
  );
  const contentType = response.headers.get("content-type")
    || "application/vnd.oci.image.manifest.v1+json";
  const manifest = Buffer.from(await response.arrayBuffer());
  const parsedManifest = JSON.parse(manifest);
  const descriptors = [parsedManifest.config, ...(parsedManifest.layers || [])];
  if (descriptors.some((descriptor) => !descriptor?.digest)) {
    throw new Error("Source manifest contains a descriptor without a digest");
  }
  if (hasOption("--include-version-tag")) {
    const version = parsedManifest.annotations?.["org.opencontainers.image.version"];
    if (!version) throw new Error("Source manifest does not contain an image version annotation");
    tags.add(version);
  }

  for (const aliasImage of aliasImages) {
    const scopes = [
      `repository:${aliasImage}:pull,push`,
      `repository:${image}:pull`,
    ];
    for (const descriptor of descriptors) {
      await mountBlob(aliasImage, descriptor.digest);
    }
    for (const tag of tags) {
      await request(
        aliasImage,
        scopes,
        `${registry}/v2/${aliasImage}/manifests/${encodeURIComponent(tag)}`,
        {
          method: "PUT",
          body: manifest,
          duplex: "half",
          headers: { "Content-Type": contentType },
        },
      );
      const registryName = registry.replace(/^https?:\/\//, "");
      console.log(`Published alias ${registryName}/${aliasImage}:${tag}`);
    }
  }
}

const command = process.argv[2];
if (command === "publish") await publish();
else throw new Error(`Unknown command: ${command}`);
