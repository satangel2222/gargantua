#!/usr/bin/env bash
# ============================================================================
#  arena.sh — 「一句话加/删项目」的执行引擎
#    arena.sh add  <本地目录> [id] [TITLE] [SUB] [META]   把项目放进画廊并上线
#    arena.sh rm   <id>                                    从画廊移除并下线
#    arena.sh ls                                          看当前有哪些项目
#  环境变量：GITHUB_TOKEN（必需）
# ============================================================================
set -euo pipefail
U="${ARENA_USER:-satangel2222}"
R="${ARENA_REPO:-arena-projects}"
T="${GITHUB_TOKEN:?需要 GITHUB_TOKEN}"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
export GIT_AUTHOR_NAME=arena GIT_AUTHOR_EMAIL=a@local GIT_COMMITTER_NAME=arena GIT_COMMITTER_EMAIL=a@local
git clone -q "https://${U}:${T}@github.com/${U}/${R}.git" "$W/r"
cd "$W/r"

case "${1:-}" in
add)
  SRC="${2:?usage: arena.sh add <dir> [id] [TITLE] [SUB] [META]}"
  ID="${3:-$(basename "$(cd "$SRC" && pwd)")}"
  TITLE="${4:-${ID^^}}"; SUB="${5:-}"; META="${6:-}"
  rm -rf "$ID"; mkdir -p "$ID"; cp -a "$SRC"/. "$ID"/
  if [ -f "$ID/build.mjs" ] && command -v node >/dev/null; then (cd "$ID" && node build.mjs); fi
  [ -f "$ID/index.html" ] || { echo "✗ $ID 里没有 index.html"; exit 1; }
  python3 - "$ID" "$TITLE" "$SUB" "$META" <<'PY'
import json,sys
i,t,s,m = sys.argv[1:5]
try: d=json.load(open('projects.json'))
except Exception: d=[]
d=[x for x in d if x.get('id')!=i]
d.append({"id":i,"title":t,"sub":s,"href":f"./{i}/","meta":m,"accent":"#9fd8ff"})
json.dump(d,open('projects.json','w'),indent=2,ensure_ascii=False)
PY
  git add -A; git commit -qm "add: $ID"; git push -q origin HEAD:main
  echo "✔ 已上线  https://${U}.github.io/${R}/${ID}/"
  ;;
rm)
  ID="${2:?usage: arena.sh rm <id>}"
  rm -rf "$ID"
  python3 - "$ID" <<'PY'
import json,sys
i=sys.argv[1]
try: d=json.load(open('projects.json'))
except Exception: d=[]
json.dump([x for x in d if x.get('id')!=i],open('projects.json','w'),indent=2,ensure_ascii=False)
PY
  git add -A; git commit -qm "rm: $ID"; git push -q origin HEAD:main
  echo "✔ 已移除 ${ID}（约 60 秒后该网址变 404）"
  ;;
ls)
  python3 - <<'PY'
import json
for p in json.load(open('projects.json')):
    print('  %-26s%s' % (p['id'], p.get('title','')))
PY
  ;;
*) sed -n '3,8p' "$0"; exit 1;;
esac
