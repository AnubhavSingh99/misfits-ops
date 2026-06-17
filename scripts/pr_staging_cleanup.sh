#!/usr/bin/env bash
set -euo pipefail

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

require PR_NUMBER

DEPLOY_HOST="${DEPLOY_HOST:-3.108.218.47}"
DEPLOY_USER="${DEPLOY_USER:-ec2-user}"
SSH_KEY_PATH="${SSH_KEY_PATH:-}"
STAGING_BASE_DOMAIN="${STAGING_BASE_DOMAIN:-operations-staging.misfits.net.in}"
PR_STAGING_SCHEME="${PR_STAGING_SCHEME:-http}"
PR_STAGING_REMOTE_ROOT="${PR_STAGING_REMOTE_ROOT:-/home/ec2-user/pr-staging}"
PR_STAGING_WEB_ROOT="${PR_STAGING_WEB_ROOT:-/var/www/pr-staging}"

PR_SLUG="pr-${PR_NUMBER}"
PR_HOSTNAME="${PR_SLUG}.${STAGING_BASE_DOMAIN}"
PUBLIC_URL="${PR_STAGING_SCHEME}://${PR_HOSTNAME}"
REMOTE_RELEASE_DIR="${PR_STAGING_REMOTE_ROOT}/${PR_SLUG}"
WEB_DIR="${PR_STAGING_WEB_ROOT}/${PR_SLUG}"
PM2_APP="misfits-ops-${PR_SLUG}"
NGINX_CONF_TARGET="/etc/nginx/conf.d/misfits-ops-${PR_SLUG}.conf"

SAFE_SHA="${PR_SHA:-manual}"
SAFE_SHA="${SAFE_SHA//[^A-Za-z0-9_.-]/-}"
REMOTE_SCRIPT="/tmp/misfits-ops-${PR_SLUG}-${SAFE_SHA}-remote-cleanup.sh"

ssh_base=(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
scp_base=(scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_KEY_PATH" ]]; then
  ssh_base+=(-i "$SSH_KEY_PATH")
  scp_base+=(-i "$SSH_KEY_PATH")
fi

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

LOCAL_SCRIPT="${TMP_DIR}/remote-cleanup.sh"
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  printf 'REMOTE_RELEASE_DIR=%s\n' "$(q "$REMOTE_RELEASE_DIR")"
  printf 'WEB_DIR=%s\n' "$(q "$WEB_DIR")"
  printf 'NGINX_CONF_TARGET=%s\n' "$(q "$NGINX_CONF_TARGET")"
  printf 'PM2_APP=%s\n' "$(q "$PM2_APP")"
  cat <<'REMOTE'

pm2 delete "$PM2_APP" >/dev/null 2>&1 || true
pm2 save >/dev/null || true

rm -rf "$REMOTE_RELEASE_DIR"
sudo rm -rf "$WEB_DIR"
sudo rm -f "$NGINX_CONF_TARGET"

sudo nginx -t
sudo systemctl reload nginx || sudo service nginx reload

echo "removed ${PM2_APP}"
REMOTE
} >"$LOCAL_SCRIPT"

echo "Uploading cleanup script to ${REMOTE}..."
"${scp_base[@]}" "$LOCAL_SCRIPT" "${REMOTE}:${REMOTE_SCRIPT}"

echo "Cleaning up ${PR_SLUG} on ${DEPLOY_HOST}..."
"${ssh_base[@]}" "$REMOTE" "bash $(q "$REMOTE_SCRIPT") && rm -f $(q "$REMOTE_SCRIPT")"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "public_url=${PUBLIC_URL}" >>"$GITHUB_OUTPUT"
fi

echo "$PUBLIC_URL"
