# 用 Google 自家服务发布 GARGANTUA

## 为什么不能只用 Google Sites
* Sites 的「插入 → 嵌入代码」有 **10,000 字符**上限，而且代码会被 **sanitize** 后塞进
  sandboxed iframe。`index.html` 是 **77,519 字符**，粘不进去。
* Sites 的「嵌入网址 / 整页嵌入」本质是 iframe，**需要一个已在线的 URL** —— 它只能套娃，
  不能当主机。

## 真正能托管的 Google 服务（两个）

### A. Apps Script Web App（最省事，纯网页操作）
1. 打开 <https://script.new>（新建独立脚本）
2. 把 `Code.gs` 的内容整个粘进去，覆盖默认的 `myFunction`
3. `部署 → 新建部署 → 类型选「网页应用」`
   * 执行身份：**我**
   * 谁可以访问：**任何人**
4. 授权（第一次会弹 Google 授权页，选自己的账号 → 高级 → 继续）
5. 拿到的 `https://script.google.com/macros/s/AKfy.../exec` 就是**永久公开网址**

> 它每次请求都会 `DriveApp.getFileById(...)` 把 77 KB 的 HTML 取出来吐给浏览器，
> 所以你以后改 Drive 里那个文件，网站内容也跟着变 —— 相当于 Google Drive 变成了 CMS。

### B. Firebase Hosting（Google 正牌静态托管，带 CDN + 自定义域名）
```bash
npm i -g firebase-tools
firebase login                 # 浏览器里授权一次
cd gargantua
firebase init hosting          # public 目录填 "."  ；不要覆盖 index.html
firebase deploy                # → https://<project>.web.app
```
免费额度：10 GB 存储 / 360 MB 日流量，够一个个人项目跑很久。

## 顺便：想让 Sites 也能用
Apps Script 部署好之后，在 Sites 里「插入 → 嵌入 → 按网址」，粘那个 `/exec` 地址，
再把嵌入块拉到全屏（「整页嵌入」），就是一个 Google Sites 站点里的黑洞。
