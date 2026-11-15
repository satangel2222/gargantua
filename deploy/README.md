# 发布成永久网址

## 一键（需要一次你的 GitHub 授权）

```bash
GITHUB_TOKEN=ghp_xxxxxxxx ./deploy/publish-github.sh
# → 建仓库 → 推送 → 开启 Pages → 打印 https://<你>.github.io/gargantua/
```

Token 生成（30 秒，只勾 `repo`）：<https://github.com/settings/tokens/new?scopes=repo&description=gargantua>

更安全的做法：先在 GitHub 上建一个**空仓库** `gargantua`，再生成一枚
**Fine-grained token**，只授权这一个仓库的 `Contents: Read and write` +
`Pages: Read and write`，用完即撤销。

## 零凭据方案

1. **Netlify Drop** — <https://app.netlify.com/drop>，把 `index.html` 拖进去 → 立刻得到
   `https://xxx.netlify.app`，用邮箱免费认领后永久保留。
2. **Firebase Hosting** — `npm i -g firebase-tools && firebase login && firebase init hosting && firebase deploy`
   → `https://<project>.web.app`
3. **Google Apps Script** — 见 `deploy/apps-script/`，拿到 `script.google.com/macros/s/…/exec`
   的永久地址，之后还能直接嵌进 Google Sites。
