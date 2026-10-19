# 辰记 StarNote · GitHub Pages 博客模板

在 [辰记](https://starnote.app) 写文章，一键发布到**你自己的** GitHub Pages。整站构建时生成（SEO、双语、RSS、sitemap、llms.txt 都已就绪），样式和辰记博客一致。仓库归你所有，不用辰记也能继续手写文章发布。

- 中文在根路径 `/`，英文在 `/en/`；同一篇文章的译文互相声明 hreflang
- 每篇文章都带 canonical、Open Graph / Twitter 卡片、JSON-LD（BlogPosting、BreadcrumbList、WebSite、Person）
- sitemap（索引 + 每种语言一份）、RSS + Atom、`robots.txt`（AI 爬虫分组可开关）、`llms.txt`、`llms-full.txt`、每篇文章的 `.md` 版本
- 分享条与微信二维码、相关文章、可选的 Google AdSense 广告位与 `ads.txt`
- 评论在辰记进行：文章页只读展示最新 3 条，按钮跳到辰记参与讨论
- 依赖只有 Node 20+、[Nunjucks](https://mozilla.github.io/nunjucks/) 和 `qrcode-generator`

## 开通（3 步，约 5 分钟）

### 1. 用模板生成仓库

点右上角 **Use this template → Create a new repository**。

- 仓库名填 **`<你的用户名>.github.io`**，网站就在 `https://<你的用户名>.github.io/`（推荐）。
- 填其他名字（比如 `blog`）也可以，网站在 `https://<你的用户名>.github.io/blog/`。模板会自动给所有链接加上 `/blog` 前缀，不用改任何配置。注意项目站的 `robots.txt`、`ads.txt` 只有放在主机根目录才生效，见下文「项目站的限制」。
- 选 **Public**（免费账号的私有仓库不能开 Pages）。

> 〔配图占位：Use this template 按钮与仓库名填写〕

生成后第一次自动构建会显示「GitHub Pages 还没有开启」并跳过，这是正常的：下一步绑定后辰记会开启 Pages。

### 2. 生成一个只给这个仓库用的令牌

打开 <https://github.com/settings/personal-access-tokens/new>（Fine-grained personal access token），按下面填写：

| 设置项 | 填什么 |
| --- | --- |
| Token name | `starnote`（随意） |
| Expiration | 按需设置。到期前辰记会提醒你续期 |
| Repository access | **Only select repositories** → 只选刚生成的博客仓库 |
| Permissions → Repository permissions | **Contents：Read and write**，**Pages：Read and write**，Metadata：Read-only（自动勾选） |

其他权限都不要勾。令牌**不需要 Workflows 权限**：构建流程 `.github/workflows/pages.yml` 已经随模板生成，辰记以后只提交文章和 `content/site.json`，不会改动它。

> 〔配图占位：令牌权限设置页〕

点 **Generate token**，复制令牌（只显示一次）。

### 3. 在辰记绑定

辰记 → 设置 → 平台账号 → **绑定 GitHub**，填仓库名（`你的用户名/你的用户名.github.io`）和令牌。辰记会：

1. 开启 Pages，来源设为 GitHub Actions；
2. 把你的博客名、头像、简介写进 `content/site.json`；
3. 发布你选的文章（每次发布是一次提交），GitHub Actions 约 1 分钟后上线。

同时请在辰记「博客设置」里填上 GitHub 博客地址：辰记博客的 header 会显示「GitHub 博客」链接，评论预览也只对这个地址开放。

以后在辰记点「发布 → GitHub Pages」即可。可以选「同时发布英文版」。

> 〔配图占位：辰记「绑定 GitHub」对话框〕

### 不用辰记，手动开通

1. 同第 1 步生成仓库；
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**；
3. 改 `content/site.json`、在 `content/posts/` 写文章（格式见下），推送到 `main` 分支即自动发布。也可以在 **Actions → Deploy to GitHub Pages → Run workflow** 手动触发。

## 写文章

每篇文章一个目录，一种语言一个文件：

```
content/posts/<slug>/
├── index.zh.html     # 中文
├── index.en.html     # 英文译文（可选）
└── cover.png         # 封面、正文图片，HTML 里用相对路径引用
```

文件开头是 front matter，下面是正文 HTML（辰记编辑器的输出，手写普通 HTML 也行）：

```html
---
title: 我的 AI 写作工作流
summary: 一两句话的摘要，会出现在列表、搜索结果和分享卡片里。
date: 2026-10-19T08:00:00+08:00
updated: 2026-10-20T09:00:00+08:00   # 可选
category: { slug: tech, name: 技术 }  # 也可以只写 tech（在 site.json categories 里定义名称）
tags: [AI, 写作]
cover: cover.png                      # 可选；分享卡片建议 1200×630 的 PNG / JPG
canonical: https://starnote.app/@me/8kq2xa   # 可选：以辰记原文为准时填
starnote_url: https://starnote.app/@me/8kq2xa # 可选：辰记原文，有它才显示评论区
---
<p>正文……</p>
```

目录名就是网址（中文 `/<目录名>/`，英文 `/en/<目录名>/`），只能用字母、数字、`-`、`_`；front matter 里的 `slug` 不影响网址。语言代码写 `zh` / `zh-CN` / `en` 都可以。草稿加 `draft: true`（不发布，`npm run dev` 里可见）。字段完整列表见 SPEC 文档。

## 配置 `content/site.json`

| 字段 | 说明 |
| --- | --- |
| `title` / `description` / `about` | 博客名、简介、关于页正文；可写成 `{"zh": "…", "en": "…"}` |
| `author` | `name`、`avatar`（放在 `content/assets/` 下） |
| `url` | 一般留空：Actions 会自动使用 Pages 的地址（含项目站路径、自定义域名）。本地构建时可填 |
| `cname` | 自定义域名，会写入 `CNAME` 文件。还需要在 GitHub Settings → Pages 里填写同一个域名并配置 DNS |
| `languages` | `["zh", "en"]`，第一个是默认语言（根路径）。没有英文文章时不会生成 `/en/` |
| `links` / `contact` | 社交链接（页脚、关于页，也用于搜索引擎识别作者），联系方式（为空时不生成联系页） |
| `categories` | 栏目顺序和中英文名称 |
| `starnote` | `handle`、`blog_url`（header 的「辰记博客」链接）、`app_url`、`api_url` |
| `comments` | `chenji`（默认）/ `giscus` / `off`，见「评论」 |
| `adsense` | Google AdSense，见「广告」 |
| `robots` | `ai_search` / `ai_training`：是否允许 AI 搜索、AI 训练爬虫；`disallow_md`：不让爬虫抓 `.md` |
| `share` | 无封面文章的分享图、是否给分享链接加 UTM |

编辑器里打开 `site.json` 会按 `site.schema.json` 提示字段。

## 评论

- `comments: "chenji"`（默认）：文章发到了辰记（front matter 有 `starnote_url`）时，文章底部只读展示辰记原文最新 3 条评论，下面是「去辰记参与讨论」按钮；发评论要在辰记登录，没有游客评论。没发到辰记的文章不显示评论区。数据来自辰记公开接口，辰记只对你在博客设置里填写的「GitHub 博客地址」开放跨域读取。
- `comments: "giscus"`：用 GitHub Discussions。在 <https://giscus.app> 生成配置，把 `repo`、`repo_id`、`category`、`category_id` 填进 `site.json` 的 `giscus`，四项都填了才会显示。
- `comments: "off"`：不显示评论区。

## 统计

访问统计以后再定（候选：有自定义域名时用 Cloudflare Web Analytics，否则用 GoatCounter，由辰记每天读取后存回仓库）。模板目前不加载任何统计脚本，文章页也不显示阅读数。

## 广告（Google AdSense）

1. 在 `site.json` 填 `adsense.client`（`ca-pub-…`）和各广告位的单元 ID（`slots.article` 文中、`slots.end` 文末、`slots.rail` 侧栏，留空的不显示）。没填 `client` 时页面里不会出现任何广告代码。
2. 同意管理默认 `consent: "cmp"`：使用 Google 认证的同意管理平台。**请在 AdSense 后台「隐私权和消息」中创建并发布「欧洲法规消息」**（GDPR，EEA / 英国 / 瑞士必需），也可以开「美国州级法规消息」。页脚「Cookie 设置」会重新打开这个同意弹窗。
3. 备选 `consent: "banner"`：用模板自带的 Cookie 条，访客点「全部接受」后才加载广告。自带条不是 Google 认证 CMP，只适合没有欧洲流量的站点。
4. `ads.txt` 自动生成在站点根目录。

## 项目站的限制（仓库名不是 `<用户名>.github.io` 时）

- `robots.txt`、`ads.txt` 只在主机根目录生效：把 `_site/` 里生成的这两个文件复制到 `<用户名>.github.io` 仓库根目录，或绑定自定义域名。
- GitHub Pages 不能设置响应头，所以 `.md` 版本无法通过 `Link` 头声明 canonical：模板把 canonical 写在每个 `.md` 文件 front matter 的第一行，并在文末附原文链接。介意的话设 `robots.disallow_md: true`。

## 本地预览

```bash
npm install
npm run dev          # http://localhost:4000 ，改文件自动重新构建；--port 5190 可换端口
npm run build        # 输出到 _site/；--base-url https://me.github.io/blog 可模拟线上地址
npm test
```

## 改样式

- `theme/static/custom.css`（自己新建）会自动在 `blog.css` 之后加载，推荐在这里覆盖样式。
- `theme/templates/` 是 Nunjucks 模板（语法接近 Jinja），`theme/static/blog.css`、`blog.js` 复制自辰记博客，升级模板时会被覆盖。

## 设为模板仓库（维护者）

本仓库需要在 **Settings → General → Template repository** 勾选，才会出现「Use this template」按钮，也才能被 GitHub API `POST /repos/{owner}/{repo}/generate` 使用。工作流在没有文章、没有开启 Pages 时都能跑完，不会让新生成的仓库出现失败的构建。

## 许可

MIT。`theme/static/katex/` 来自 KaTeX（MIT），图标来自 Ant Design Icons（MIT）。
