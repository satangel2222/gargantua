#!/usr/bin/env bash
# ============================================================================
#  publish.sh — 任意静态项目 → 永久 GitHub Pages 网址
#
#    GITHUB_TOKEN=ghp_xxx ./publish.sh ../some-project my-project
#    GITHUB_TOKEN=ghp_xxx ./publish.sh .                 # 仓库名 = 目录名
#
#  做的事：建仓库(公有) → 提交推送 → 开启 Pages(main/root) → 轮询 → 打印网址
#  依赖：git, curl, python3
# ============================================================================
set -euo pipefail
CI=0
if [ "${1:-}" = "--ci" ]; then CI=1; shift; fi
DIR="${1:?usage: publish.sh [--ci] <project-dir> [repo-name]}"
REPO="${2:-$(basename "$(cd "$DIR" && pwd)")}"
TOKEN="${GITHUB_TOKEN:?需要 GITHUB_TOKEN 环境变量}"
API="https://api.github.com"
AH=(-H "Authorization: Bearer ${TOKEN}" -H "Accept: application/vnd.github+json")
say(){ printf '\033[1m▸ %s\033[0m\n' "$*"; }

cd "$DIR"
USER=$(curl -sS "${AH[@]}" "$API/user" | python3 -c 'import sys,json;print(json.load(sys.stdin)["login"])')
say "账号 ${USER} · 目标 ${USER}/${REPO}"

if [ ! -d .git ]; then
  git init -q -b main
  git -c user.email=deploy@local -c user.name=deploy add -A
  git -c user.email=deploy@local -c user.name=deploy commit -qm "deploy: initial"
fi
git rev-parse --verify HEAD >/dev/null 2>&1 || {
  git -c user.email=deploy@local -c user.name=deploy add -A
  git -c user.email=deploy@local -c user.name=deploy commit -qm "deploy"
}

if [ -f build.mjs ] && command -v node >/dev/null; then say "build.mjs 存在 → 构建"; node build.mjs; fi
[ -f index.html ] || { echo "✗ 目录里没有 index.html，静态站点需要它"; exit 1; }

code=$(curl -sS -o /dev/null -w '%{http_code}' "${AH[@]}" "$API/repos/${USER}/${REPO}")
if [ "$code" = "200" ]; then
  say "仓库已存在 → 覆盖推送"
else
  say "创建公有仓库"
  curl -sS -X POST "${AH[@]}" "$API/user/repos" -d "{\"name\":\"${REPO}\",\"private\":false}" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print("  →",d.get("html_url",d))'
  sleep 2
fi

git push -q "https://${USER}:${TOKEN}@github.com/${USER}/${REPO}.git" HEAD:main --force
say "已推送 $(git rev-parse --short HEAD)"
git remote get-url origin >/dev/null 2>&1 && git remote set-url origin "https://github.com/${USER}/${REPO}.git" \
  || git remote add origin "https://github.com/${USER}/${REPO}.git"

if [ "$CI" = "1" ]; then
  say "CI 模式：安装可复用工作流（以后 push 自动发布）"
  mkdir -p .github/workflows
  printf 'name: deploy\non: [push]\njobs:\n  pages:\n    uses: %s/deploy-kit/.github/workflows/pages-reusable.yml@main\n    permissions: { contents: read, pages: write, id-token: write }\n' "$USER" > .github/workflows/deploy.yml
  git add -A && git -c user.email=deploy@local -c user.name=deploy commit -qm "ci: reusable pages workflow"
  git push -q "https://${USER}:${TOKEN}@github.com/${USER}/${REPO}.git" HEAD:main -f
  BODY='{"build_type":"workflow"}'
else
  BODY='{"source":{"branch":"main","path":"/"}}'
fi
curl -sS -X POST "${AH[@]}" "$API/repos/${USER}/${REPO}/pages" -d "$BODY" >/dev/null 2>&1 || \
curl -sS -X PUT  "${AH[@]}" "$API/repos/${USER}/${REPO}/pages" -d "$BODY" >/dev/null 2>&1 || true

URL="https://${USER}.github.io/${REPO}/"
say "等待首次构建…"
for _ in $(seq 1 60); do
  [ "$(curl -sS -o /dev/null -w '%{http_code}' "$URL" || true)" = "200" ] && { say "上线 → ${URL}"; exit 0; }
  sleep 5
done
say "Pages 正在配置（通常 <2 分钟）：${URL}"
