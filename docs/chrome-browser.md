# Chrome browser images

The `chrome` and `dind-chrome` flavors add a maintained browser-testing environment to the Ubuntu 24.04 slim image.

## Installed software

The images add:

- Chrome for Testing.
- `agent-browser`.
- Playwright MCP.
- FFmpeg and FFprobe.
- Browser libraries.
- A stable font set for screenshots and recordings.

See [`Dockerfile.slim`](../Dockerfile.slim) for the pinned versions.

## Chrome paths

Chrome is available through all of these command names:

```text
/usr/local/bin/chrome
/usr/local/bin/google-chrome
/usr/local/bin/google-chrome-stable
```

The original installation is under `/opt/chrome-for-testing`.

## Environment variables

Chrome images set:

| Variable | Value |
| --- | --- |
| `CHROME_BIN` | `/usr/local/bin/chrome` |
| `AGENT_BROWSER_ENGINE` | `chrome` |
| `AGENT_BROWSER_EXECUTABLE_PATH` | `/usr/local/bin/chrome` |
| `AGENT_BROWSER_CONTENT_BOUNDARIES` | `1` |
| `AGENT_BROWSER_MAX_OUTPUT` | `50000` |

The images do not set a browser namespace, session, extra Chrome arguments, display, or fixed port. The workflow or runtime controls those choices.

## Use agent-browser

Start a headless browser:

```bash
agent-browser open about:blank
agent-browser get url
```

Get its Chrome DevTools Protocol endpoint:

```bash
agent-browser get cdp-url
```

Close the browser when the job finishes:

```bash
agent-browser close
```

Set `AGENT_BROWSER_NAMESPACE` and `AGENT_BROWSER_SESSION` when concurrent jobs share a host or when a job needs explicit browser isolation.

## Use Playwright MCP

Playwright MCP can attach to the browser through its Chrome DevTools Protocol endpoint:

```bash
cdp_url="$(agent-browser get cdp-url)"
playwright-mcp \
  --host 127.0.0.1 \
  --port 3100 \
  --cdp-endpoint "$cdp_url"
```

The image does not set `PLAYWRIGHT_BROWSERS_PATH`. It does not download a second Playwright-managed Chromium build. A project can install its own Playwright browsers when it needs a different browser version.

## Container settings

Give Chrome enough shared memory for the workload. A direct Docker example uses a 1 GiB shared-memory segment:

```bash
docker run --rm -it --shm-size=1g \
  ghcr.io/lithoscomputer/ubuntu-24.04:chrome
```

## Automated validation

After publishing a `chrome` image, GitHub Actions starts a container, opens `about:blank` with `agent-browser`, checks the current URL, and closes the browser. The `dind-chrome` flavor runs both the Docker and browser checks.

See [Slim images](slim-images.md#measured-size-and-daytona-validation) for measured filesystem sizes and Daytona startup times.
