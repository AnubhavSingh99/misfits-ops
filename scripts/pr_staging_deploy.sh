#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${PR_STAGING_SOURCE_DIR:-}" ]]; then
  ROOT_DIR="$(cd "$PR_STAGING_SOURCE_DIR" && pwd)"
else
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

fail() {
  echo "error: $*" >&2
  exit 1
}

require() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "$name is required"
}

q() {
  printf "%q" "$1"
}

write_nginx_conf() {
  local target="$1"

  if [[ "$PR_STAGING_SCHEME" == "https" ]]; then
    [[ -n "$PR_STAGING_SSL_CERT_PATH" ]] || fail "PR_STAGING_SSL_CERT_PATH is required when PR_STAGING_SCHEME=https"
    [[ -n "$PR_STAGING_SSL_KEY_PATH" ]] || fail "PR_STAGING_SSL_KEY_PATH is required when PR_STAGING_SCHEME=https"

    cat >"$target" <<EOF
server {
  listen 80;
  server_name ${PR_HOSTNAME};
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl http2;
  server_name ${PR_HOSTNAME};

  ssl_certificate ${PR_STAGING_SSL_CERT_PATH};
  ssl_certificate_key ${PR_STAGING_SSL_KEY_PATH};

  root ${WEB_DIR};
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:${API_PORT}/api/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_buffering off;
  }

  location /health {
    proxy_pass http://127.0.0.1:${API_PORT}/health;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location /ws/ {
    proxy_pass http://127.0.0.1:${API_PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
EOF
  else
    cat >"$target" <<EOF
server {
  listen 80;
  server_name ${PR_HOSTNAME};

  root ${WEB_DIR};
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:${API_PORT}/api/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_buffering off;
  }

  location /health {
    proxy_pass http://127.0.0.1:${API_PORT}/health;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location /ws/ {
    proxy_pass http://127.0.0.1:${API_PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
EOF
  fi
}

require PR_NUMBER

DEPLOY_HOST="${DEPLOY_HOST:-3.108.218.47}"
DEPLOY_USER="${DEPLOY_USER:-ec2-user}"
SSH_KEY_PATH="${SSH_KEY_PATH:-}"
STAGING_BASE_DOMAIN="${STAGING_BASE_DOMAIN:-operations-staging.misfits.net.in}"
PR_STAGING_SCHEME="${PR_STAGING_SCHEME:-http}"
PR_STAGING_REMOTE_ROOT="${PR_STAGING_REMOTE_ROOT:-/home/ec2-user/pr-staging}"
PR_STAGING_WEB_ROOT="${PR_STAGING_WEB_ROOT:-/var/www/pr-staging}"
PR_STAGING_ENV_FILE="${PR_STAGING_ENV_FILE:-${PR_STAGING_REMOTE_ROOT}/.env}"
PR_STAGING_PORT_BASE="${PR_STAGING_PORT_BASE:-15000}"
PR_STAGING_SSL_CERT_PATH="${PR_STAGING_SSL_CERT_PATH:-}"
PR_STAGING_SSL_KEY_PATH="${PR_STAGING_SSL_KEY_PATH:-}"
SERVER_NODE_ENV="${SERVER_NODE_ENV:-production}"

PR_SLUG="pr-${PR_NUMBER}"
PR_HOSTNAME="${PR_SLUG}.${STAGING_BASE_DOMAIN}"
API_PORT="$((PR_STAGING_PORT_BASE + PR_NUMBER))"
PUBLIC_URL="${PR_STAGING_SCHEME}://${PR_HOSTNAME}"
if [[ "$PR_STAGING_SCHEME" == "https" ]]; then
  WS_URL="wss://${PR_HOSTNAME}"
else
  WS_URL="ws://${PR_HOSTNAME}"
fi

REMOTE_RELEASE_DIR="${PR_STAGING_REMOTE_ROOT}/${PR_SLUG}"
WEB_DIR="${PR_STAGING_WEB_ROOT}/${PR_SLUG}"
PM2_APP="misfits-ops-${PR_SLUG}"
NGINX_CONF_TARGET="/etc/nginx/conf.d/misfits-ops-${PR_SLUG}.conf"

SAFE_SHA="${PR_SHA:-manual}"
SAFE_SHA="${SAFE_SHA//[^A-Za-z0-9_.-]/-}"
REMOTE_PREFIX="/tmp/misfits-ops-${PR_SLUG}-${SAFE_SHA}"

ssh_base=(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
scp_base=(scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_KEY_PATH" ]]; then
  ssh_base+=(-i "$SSH_KEY_PATH")
  scp_base+=(-i "$SSH_KEY_PATH")
fi

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

SOURCE_ARCHIVE="${TMP_DIR}/source.tgz"
CLIENT_DIST_ARCHIVE="${TMP_DIR}/client-dist.tgz"
REMOTE_SCRIPT="${TMP_DIR}/remote-deploy.sh"
NGINX_CONF="${TMP_DIR}/nginx.conf"

echo "Building server..."
(
  cd "${ROOT_DIR}/server"
  npm ci
  npm run build
)

echo "Building client for ${PUBLIC_URL}..."
(
  cd "${ROOT_DIR}/client"
  npm ci
  VITE_API_URL="${PUBLIC_URL}" VITE_WS_URL="${WS_URL}" npm run build
)

echo "Packing source and client build..."
tar -C "$ROOT_DIR" \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./.env.*' \
  --exclude='./server/.env' \
  --exclude='./server/.env.*' \
  --exclude='./client/.env' \
  --exclude='./client/.env.*' \
  --exclude='./node_modules' \
  --exclude='./client/node_modules' \
  --exclude='./server/node_modules' \
  --exclude='./client/dist' \
  --exclude='./server/dist' \
  --exclude='./.local' \
  --exclude='*.pem' \
  --exclude='*.key' \
  -czf "$SOURCE_ARCHIVE" .
tar -C "${ROOT_DIR}/client/dist" -czf "$CLIENT_DIST_ARCHIVE" .

write_nginx_conf "$NGINX_CONF"

{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  printf 'DEPLOY_USER=%s\n' "$(q "$DEPLOY_USER")"
  printf 'SOURCE_ARCHIVE=%s\n' "$(q "${REMOTE_PREFIX}-source.tgz")"
  printf 'CLIENT_DIST_ARCHIVE=%s\n' "$(q "${REMOTE_PREFIX}-client-dist.tgz")"
  printf 'NGINX_CONF_TMP=%s\n' "$(q "${REMOTE_PREFIX}-nginx.conf")"
  printf 'REMOTE_RELEASE_DIR=%s\n' "$(q "$REMOTE_RELEASE_DIR")"
  printf 'WEB_DIR=%s\n' "$(q "$WEB_DIR")"
  printf 'PR_STAGING_REMOTE_ROOT=%s\n' "$(q "$PR_STAGING_REMOTE_ROOT")"
  printf 'PR_STAGING_WEB_ROOT=%s\n' "$(q "$PR_STAGING_WEB_ROOT")"
  printf 'PR_STAGING_ENV_FILE=%s\n' "$(q "$PR_STAGING_ENV_FILE")"
  printf 'NGINX_CONF_TARGET=%s\n' "$(q "$NGINX_CONF_TARGET")"
  printf 'PM2_APP=%s\n' "$(q "$PM2_APP")"
  printf 'API_PORT=%s\n' "$(q "$API_PORT")"
  printf 'PUBLIC_URL=%s\n' "$(q "$PUBLIC_URL")"
  printf 'SERVER_NODE_ENV=%s\n' "$(q "$SERVER_NODE_ENV")"
  cat <<'REMOTE'

sudo mkdir -p "$PR_STAGING_WEB_ROOT"
sudo chown "$DEPLOY_USER":"$DEPLOY_USER" "$PR_STAGING_WEB_ROOT"
mkdir -p "$PR_STAGING_REMOTE_ROOT"

rm -rf "$REMOTE_RELEASE_DIR" "$WEB_DIR"
mkdir -p "$REMOTE_RELEASE_DIR" "$WEB_DIR"

tar -xzf "$SOURCE_ARCHIVE" -C "$REMOTE_RELEASE_DIR"
tar -xzf "$CLIENT_DIST_ARCHIVE" -C "$WEB_DIR"

if [[ -f "$PR_STAGING_ENV_FILE" ]]; then
  cp "$PR_STAGING_ENV_FILE" "$REMOTE_RELEASE_DIR/.env"
else
  touch "$REMOTE_RELEASE_DIR/.env"
fi

cd "$REMOTE_RELEASE_DIR/server"
npm ci
npm run build

SERVER_ENTRY="dist/server.js"
if [[ ! -f "$SERVER_ENTRY" && -f "dist/server/src/server.js" ]]; then
  SERVER_ENTRY="dist/server/src/server.js"
fi
if [[ ! -f "$SERVER_ENTRY" ]]; then
  echo "Compiled server entry not found. Looked for dist/server.js and dist/server/src/server.js." >&2
  find dist -maxdepth 5 -type f | sort | sed -n '1,80p' >&2 || true
  exit 1
fi

pm2 delete "$PM2_APP" >/dev/null 2>&1 || true
PORT="$API_PORT" FRONTEND_URL="$PUBLIC_URL" NODE_ENV="$SERVER_NODE_ENV" \
  pm2 start "$SERVER_ENTRY" --name "$PM2_APP"
pm2 save >/dev/null || true

sudo mv "$NGINX_CONF_TMP" "$NGINX_CONF_TARGET"
sudo nginx -t
sudo systemctl reload nginx || sudo service nginx reload

for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null

rm -f "$SOURCE_ARCHIVE" "$CLIENT_DIST_ARCHIVE"
echo "deployed ${PUBLIC_URL}"
REMOTE
} >"$REMOTE_SCRIPT"

echo "Uploading to ${REMOTE}..."
"${scp_base[@]}" "$SOURCE_ARCHIVE" "${REMOTE}:${REMOTE_PREFIX}-source.tgz"
"${scp_base[@]}" "$CLIENT_DIST_ARCHIVE" "${REMOTE}:${REMOTE_PREFIX}-client-dist.tgz"
"${scp_base[@]}" "$NGINX_CONF" "${REMOTE}:${REMOTE_PREFIX}-nginx.conf"
"${scp_base[@]}" "$REMOTE_SCRIPT" "${REMOTE}:${REMOTE_PREFIX}-remote-deploy.sh"

echo "Deploying ${PR_SLUG} on ${DEPLOY_HOST}..."
"${ssh_base[@]}" "$REMOTE" "bash $(q "${REMOTE_PREFIX}-remote-deploy.sh")"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "public_url=${PUBLIC_URL}" >>"$GITHUB_OUTPUT"
fi

echo "$PUBLIC_URL"
