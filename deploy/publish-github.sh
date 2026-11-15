#!/usr/bin/env bash
# ============================================================================
#  GARGANTUA · one-shot GitHub Pages publisher
#  usage:  GITHUB_TOKEN=ghp_xxx ./deploy/publish-github.sh [repo-name]
#  does:   create repo → push → enable Pages (branch: main / root) → wait → print URL
# ============================================================================
set -euo pipefail

TOKEN="${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
REPO="${1:-gargantua}"
API="https://api.github.com"
H_AUTH="Authorization: Bearer ${TOKEN}"
H_JSON="Accept: application/vnd.github+json"

say() { printf '\033[1m▸ %s\033[0m\n' "$*"; }

USER=$(curl -sS -H "$H_AUTH" "$API/user" | python3 -c 'import sys,json;print(json.load(sys.stdin)["login"])')
say "account: ${USER}"

if curl -sS -o /dev/null -w '%{http_code}' -H "$H_AUTH" "$API/repos/${USER}/${REPO}" | grep -q 200; then
  say "repo ${USER}/${REPO} already exists — pushing over it"
else
  say "creating public repo ${USER}/${REPO}"
  curl -sS -X POST -H "$H_AUTH" -H "$H_JSON" "$API/user/repos" \
    -d "{\"name\":\"${REPO}\",\"private\":false,\"description\":\"GARGANTUA · RELATIVISTIC SINGULARITY — single-file WebGL2 GR black hole\",\"has_issues\":true,\"has_wiki\":false}" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print("  →", d.get("html_url", d))'
  sleep 2
fi

cd "$(dirname "$0")/.."
git remote remove origin 2>/dev/null || true
git push -q "https://${USER}:${TOKEN}@github.com/${USER}/${REPO}.git" HEAD:main --force
say "pushed ($(git rev-parse --short HEAD))"
git remote add origin "https://github.com/${USER}/${REPO}.git"

say "enabling GitHub Pages (main /)"
curl -sS -X POST -H "$H_AUTH" -H "$H_JSON" "$API/repos/${USER}/${REPO}/pages" \
  -d '{"source":{"branch":"main","path":"/"}}' >/dev/null 2>&1 || \
curl -sS -X PUT -H "$H_AUTH" -H "$H_JSON" "$API/repos/${USER}/${REPO}/pages" \
  -d '{"source":{"branch":"main","path":"/"}}' >/dev/null 2>&1 || true

URL="https://${USER}.github.io/${REPO}/"
say "waiting for the first build…"
for i in $(seq 1 60); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "$URL" || true)
  if [ "$code" = "200" ]; then say "LIVE → ${URL}"; exit 0; fi
  sleep 5
done
say "Pages is provisioning (usually <2 min). URL: ${URL}"
