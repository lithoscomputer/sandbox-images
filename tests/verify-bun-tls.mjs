// Exercise both Bun's native fetch and node:https compatibility paths. Network
// failures do not count as proof that an affected certificate was rejected.
import https from "node:https";

const hosts = ["dv-g3b", "dv-g3c", "ev-g3b", "ev-g3c", "ov-g3b", "ov-g3c"].flatMap(
  (name) => [
    `${name}-emudhra.we-have-a-problem.com`,
    `${name}-aaa-emudhra.we-have-a-problem.com`,
  ],
);

function certificateFailure(error) {
  return /CERT_REVOKED|CERTIFICATE_VERIFY_FAILED|UNABLE_TO_GET_ISSUER_CERT|SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE/.test(
    [error?.code, error?.message, error?.cause?.code, error?.cause?.message].join(" "),
  );
}

async function fetchHost(host, shouldReject) {
  try {
    const response = await fetch(`https://${host}/`, {
      signal: AbortSignal.timeout(15000),
    });
    await response.arrayBuffer();
    if (shouldReject) throw new Error(`Unsafe Bun fetch trust: accepted ${host}`);
  } catch (error) {
    if (!shouldReject || !certificateFailure(error)) throw error;
  }
}

function httpsHost(host, shouldReject) {
  return new Promise((resolve, reject) => {
    const request = https.get(`https://${host}/`, (response) => {
      response.resume();
      if (shouldReject) reject(new Error(`Unsafe Bun https trust: accepted ${host}`));
      else resolve();
    });
    request.setTimeout(15000, () => request.destroy(new Error(`Timeout: ${host}`)));
    request.on("error", (error) => {
      if (shouldReject && certificateFailure(error)) resolve();
      else reject(error);
    });
  });
}

for (const probe of [fetchHost, httpsHost]) {
  for (const host of hosts) await probe(host, true);
  await probe("example.com", false);
}
console.log(`Bun ${Bun.version}: fetch and https reject all 12 chains; valid HTTPS passes.`);
