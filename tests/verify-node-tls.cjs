const https = require("node:https");

// Use no application credentials. A transport failure is inconclusive; only
// certificate-verification failures count as rejecting an affected chain.
const hosts = ["dv-g3b", "dv-g3c", "ev-g3b", "ev-g3c", "ov-g3b", "ov-g3c"].flatMap(
  (name) => [
    `${name}-emudhra.we-have-a-problem.com`,
    `${name}-aaa-emudhra.we-have-a-problem.com`,
  ],
);

function request(host, shouldReject) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://${host}/`, (response) => {
      response.resume();
      if (shouldReject) {
        reject(new Error(`Unsafe Node trust: accepted ${host}`));
      } else {
        resolve({ host, status: response.statusCode });
      }
    });
    req.setTimeout(15000, () => req.destroy(new Error(`Timeout: ${host}`)));
    req.on("error", (error) => {
      if (shouldReject && /CERT|ISSUER|SELF_SIGNED/.test(error.code)) {
        resolve({ host, code: error.code });
      } else {
        reject(error);
      }
    });
  });
}

(async () => {
  for (const host of hosts) {
    console.log(JSON.stringify(await request(host, true)));
  }
  console.log(JSON.stringify(await request("example.com", false)));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
