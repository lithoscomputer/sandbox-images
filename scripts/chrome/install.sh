#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${TARGETARCH:-amd64}" != "amd64" ]]; then
  echo "Only linux/amd64 is supported" >&2
  exit 1
fi

if [[ "${UBUNTU_VERSION:?UBUNTU_VERSION is required}" != "24.04" ]]; then
  echo "The chrome flavor supports only Ubuntu 24.04" >&2
  exit 1
fi

packages=(
  ffmpeg
  fontconfig
  fonts-freefont-ttf
  fonts-liberation2
  fonts-noto-cjk
  fonts-noto-color-emoji
  fonts-noto-core
  fonts-noto-mono
  libasound2t64
  libatk-bridge2.0-0t64
  libatk1.0-0t64
  libatspi2.0-0t64
  libcairo-gobject2
  libcairo2
  libcups2t64
  libdbus-1-3
  libdrm2
  libfontconfig1
  libfreetype6
  libgbm1
  libgdk-pixbuf-2.0-0
  libgtk-3-0t64
  libnspr4
  libnss3
  libpango-1.0-0
  libpangocairo-1.0-0
  libx11-6
  libx11-xcb1
  libxcb-shm0
  libxcb1
  libxcomposite1
  libxcursor1
  libxdamage1
  libxext6
  libxfixes3
  libxi6
  libxkbcommon0
  libxrandr2
  libxrender1
  libxshmfence1
)

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${packages[@]}"

npm install --global --prefix /usr/local --allow-scripts=agent-browser \
  "agent-browser@${AGENT_BROWSER_VERSION:?AGENT_BROWSER_VERSION is required}" \
  "@playwright/mcp@${PLAYWRIGHT_MCP_VERSION:?PLAYWRIGHT_MCP_VERSION is required}"

chrome_archive=/tmp/chrome-for-testing.zip
curl --fail --location --silent --show-error --retry 3 \
  "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_FOR_TESTING_VERSION:?CHROME_FOR_TESTING_VERSION is required}/linux64/chrome-linux64.zip" \
  --output "$chrome_archive"
echo "${CHROME_FOR_TESTING_SHA256:?CHROME_FOR_TESTING_SHA256 is required}  $chrome_archive" \
  | sha256sum --check --strict
unzip -q "$chrome_archive" -d /opt/chrome-for-testing
ln -s /opt/chrome-for-testing/chrome-linux64/chrome /usr/local/bin/chrome
ln -s /usr/local/bin/chrome /usr/local/bin/google-chrome
ln -s /usr/local/bin/chrome /usr/local/bin/google-chrome-stable

sans_family=$(fc-match -f '%{family}' system-ui)
generic_mono_family=$(fc-match -f '%{family}' monospace)
named_mono_family=$(fc-match -f '%{family}' 'Liberation Mono')
printf 'Font baseline: system-ui=%s; monospace=%s; Liberation Mono=%s\n' \
  "$sans_family" "$generic_mono_family" "$named_mono_family"
test "$sans_family" = 'Noto Sans'
test "$generic_mono_family" = 'Noto Mono'
test "$named_mono_family" = 'Liberation Mono'

rm -f "$chrome_archive"
npm cache clean --force
apt-get clean
rm -rf /var/lib/apt/lists/* /var/cache/apt/* /tmp/*

chrome --version
agent-browser --version
playwright-mcp --help >/dev/null
ffmpeg -version | head -n 1
