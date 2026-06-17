#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "error: $*" >&2
  exit 1
}

DEPLOY_USER="${DEPLOY_USER:-ec2-user}"
DEPLOY_HOST="${DEPLOY_HOST:-3.108.218.47}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/ec2-user/misfits-ops}"
PM2_APP="${PM2_APP:-misfits-ops}"
SSH_KEY_PATH="${SSH_KEY_PATH:-}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_SHA="${DEPLOY_SHA:-}"
WEB_ROOT="${WEB_ROOT:-/var/www/operations}"
HEALTH_URL="${HEALTH_URL:-http://localhost/health}"

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

ssh_base=(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_KEY_PATH" ]]; then
  ssh_base+=(-i "$SSH_KEY_PATH")
fi

remote() {
  local cmd="$1"
  "${ssh_base[@]}" "$REMOTE" "bash -lc $(printf '%q' "$cmd")"
}

[[ -n "$DEPLOY_HOST" ]] || fail "DEPLOY_HOST is required"
[[ -n "$DEPLOY_USER" ]] || fail "DEPLOY_USER is required"

echo "Deploying ${DEPLOY_BRANCH}${DEPLOY_SHA:+ at ${DEPLOY_SHA}} to ${DEPLOY_HOST}:${DEPLOY_PATH}"

remote "cd ${DEPLOY_PATH} && git fetch origin ${DEPLOY_BRANCH} && git checkout ${DEPLOY_BRANCH} && git pull --ff-only origin ${DEPLOY_BRANCH}"

if [[ -n "$DEPLOY_SHA" ]]; then
  remote "cd ${DEPLOY_PATH} && test \"\$(git rev-parse HEAD)\" = ${DEPLOY_SHA}"
fi

remote "cd ${DEPLOY_PATH}/server && npm ci && npm run build"
remote "cd ${DEPLOY_PATH}/client && npm ci && npm run build"
remote "sudo mkdir -p ${WEB_ROOT} && sudo rsync -a --delete ${DEPLOY_PATH}/client/dist/ ${WEB_ROOT}/"
remote "printf '{\"sha\":\"%s\",\"branch\":\"%s\",\"deployed_at\":\"%s\"}\n' \"\$(cd ${DEPLOY_PATH} && git rev-parse HEAD)\" \"${DEPLOY_BRANCH}\" \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" | sudo tee ${WEB_ROOT}/version.json >/dev/null"
remote "pm2 restart ${PM2_APP}"
remote "curl -fsS ${HEALTH_URL} >/dev/null && echo health_ok"

echo "Production deploy complete"
