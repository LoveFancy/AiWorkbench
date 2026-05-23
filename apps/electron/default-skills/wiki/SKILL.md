---
name: wiki
description: Use when the user needs HTSC Confluence Wiki content, especially URLs under wiki.htzq.htsc.com.cn, wiki pages, Confluence pages, requirement/design/solution docs, space trees, page IDs, or requests to read/search/open company wiki documents.
version: "1.0.0"
---

# Wiki Skill

通过 `ht-wiki` 命令访问 HTSC Confluence Wiki。只要任务明显是在读 HTSC wiki，优先用 `ht-wiki`，不要先走通用 web 搜索。

## 触发场景

- 用户给出 `http://wiki.htzq.htsc.com.cn/` 域名链接。
- 用户明确说 wiki 页面、Confluence 页面、需求文档、方案文档、设计文档，且上下文指向公司 wiki。
- 用户给出页面 ID、空间 key、页面树、父子页面关系等 wiki 线索。
- 用户要求“去 wiki 查”“从 wiki 读取”“打开需求文档”“把 wiki 里的内容拉下来”。

## 首次检测

真正开始 wiki 操作前，先执行：

```bash
ht-wiki status
```

如果命令不存在，唯一安装方式是：

```bash
npm i -g @ht/wiki-cli
ht-wiki status
```

如果 `npm` 不可用，直接说明环境缺少 Node/npm，不要尝试其他安装方式。

## 登录与配置

如果 `status` 提示未配置、配置无效或未登录，先向用户索取 token。只有用户明确提供真实 token 后，才可执行：

```bash
ht-wiki config --base-url "http://wiki.htzq.htsc.com.cn" --token "<USER_PROVIDED_TOKEN>"
ht-wiki status
```

约束：

- 不要把 `<USER_PROVIDED_TOKEN>` 当真实值写入配置。
- 当前回合没有 token，且本地没有可复用 token 时，禁止猜测、生成、补全 token。
- 不要优先调用交互式 `ht-wiki config`。
- 非交互配置失败后，再提示用户自己在终端执行 `ht-wiki config`，随后再跑 `ht-wiki status`。
- 不要用 `ht-wiki help` 检测登录态。

配置文件位置：

```text
~/.ht/wiki-cli-config.json
```

## 推荐工作流

已知页面 URL 或页面 ID 时，直接读取：

```bash
ht-wiki get-page 431555016
ht-wiki get-page "http://wiki.htzq.htsc.com.cn/pages/viewpage.action?pageId=431555016"
```

不知道页面 ID 时，先搜索：

```bash
ht-wiki search "API" --max-results 10
ht-wiki search "微服务" --type content --space DEV --max-results 20
```

需要空间或层级上下文时：

```bash
ht-wiki list-spaces --filter "tailor"
ht-wiki space-info TAILINTR
ht-wiki space-tree TAILINTR --depth 4
ht-wiki space-tree TAILINTR --format json
ht-wiki page-children 431555016 --recursive --depth 2
```

需要本地复用 markdown、图片、附件时：

```bash
ht-wiki download-doc 431555016 --output ./project-docs
ht-wiki download-images 431555016 --output ./wiki-images
```

## 命令速查

| 需求 | 命令 |
| --- | --- |
| 搜索页面 | `ht-wiki search "<query>" --max-results 10` |
| 搜正文 | `ht-wiki search "<query>" --type content --space DEV` |
| 读取页面 | `ht-wiki get-page <pageIdOrUrl>` |
| 分页读取大页面 | `ht-wiki get-page <pageIdOrUrl> --page-size 50000 --page-number 1` |
| 不取图片 | `ht-wiki get-page <pageIdOrUrl> --no-images` |
| 不取附件 | `ht-wiki get-page <pageIdOrUrl> --no-attachments` |
| 列空间 | `ht-wiki list-spaces --filter "<keyword>" --limit 20` |
| 空间详情 | `ht-wiki space-info <spaceKey>` |
| 空间树 | `ht-wiki space-tree <spaceKey> --depth 5` |
| 结构化空间树 | `ht-wiki space-tree <spaceKey> --format json` |
| 子页面 | `ht-wiki page-children <pageId> --recursive --depth 2` |
| 下载完整文档 | `ht-wiki download-doc <pageIdOrUrl> --output ./docs` |
| 下载图片 | `ht-wiki download-images <pageIdOrUrl> --output ./images` |

注意：`page-children` 只接受页面 ID，不接受完整 URL。CLI 输出通常是人类可读文本，不是 JSON；需要机器可读结构时优先用 `space-tree --format json`。

## 失败处理

- 页面不存在或无权限：用页面标题关键词搜索，或检查 `space-info <spaceKey>`；提醒用户确认权限。
- 页面内容过大：使用 `get-page --page-size 50000 --page-number N` 分页读取。
- 登录失败：确认 token 有效、base URL 是 `http://wiki.htzq.htsc.com.cn`、当前用户有目标空间或页面权限。
