# 一劳永逸的部署方案

## 为什么不"永久"是个技术限制
每次新对话，Agent 拿到的是一个**全新沙箱**：没有上次的对话记忆，也没有任何账号凭据
（`.git/config`、credential 文件这类路径被快照系统显式排除）。所以"以后自动帮我部署"
必须依赖两件事之一：**① 凭据存在我能读到的地方**，或 **② 部署根本不经过我**。

下面正好就是这两种。

---

## 方案 1 · 零凭据自动发布（推荐，真正的"一劳永逸"）

GitHub Actions 自带 `GITHUB_TOKEN`，浏览器/CI 里就能开 Pages —— **不需要任何 PAT**。

一次性安装（我帮你装，或你自己装）：

```bash
mkdir -p .github/workflows
cat > .github/workflows/deploy.yml <<'YML'
name: deploy
on: [push]
jobs:
  pages:
    uses: <你的用户名>/deploy-kit/.github/workflows/pages-reusable.yml@main
    permissions: { contents: read, pages: write, id-token: write }
YML
git add -A && git commit -m "ci: pages" && git push
```

之后：**任何项目、任何时间，`git push` 就上线**。不需要 token、不需要我、不需要点任何按钮。
`deploy-kit` 里的 `pages-reusable.yml` 会自动 `node build.mjs`（如果存在）并把整站推上 Pages。

## 方案 2 · 把 token 存进 Google Drive（我全自动，跨对话）

在本项目里 Google Drive 是连着的。把一枚 token 放在云端，任何新对话我都能自己拿到：

1. 生成一枚 classic token，勾 **`repo` + `workflow`**
   <https://github.com/settings/tokens/new?scopes=repo,workflow&description=arena-deploy>
2. 存成 Google Drive 里一个纯文本文件，命名 `arena-deploy.token`（内容只放 `ghp_...`）
3. 以后任何对话，你说「部署这个项目」，我：
   `drive → 读 token → ./publish.sh <项目目录> <仓库名> → 返回 https://你.github.io/<仓库名>/`

**风险与缓解**（请自己权衡）：

| 风险 | 缓解 |
|---|---|
| token 明文躺在 Drive 里 | 文件不公开分享；只给 `repo`+`workflow`；设 90 天过期 |
| 权限偏大（可动全部仓库） | 改为：先手动建空仓库，再用 Fine-grained token 只授权该仓库 |
| 忘了它存在 | 在日历上设个到期提醒；吊销后站点照常运行（Pages 是静态的） |

想收回来随时说一声，我把 Drive 里那个文件删掉即可。

## 方案 3 · 保守模式

每次开新对话时粘一次 token。最安全，代价是每次都得多做 20 秒。

---

## 现在用哪个

`publish.sh` 已经通用化：目录进、网址出。

```bash
GITHUB_TOKEN=ghp_xxx ./publish.sh ~/any-project any-project
```
