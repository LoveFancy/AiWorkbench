---
description: 将本地 Markdown 发布到 Confluence Wiki 页面
argument-hint: [本地 Markdown 文件路径] [--space-key SpaceKey --parent-page-id 父页面ID或URL] [--page-id 已有页面ID --mode update]
---

执行 po-skill `wiki-upload` 步骤。

输入：$ARGUMENTS

## 执行规则

1. 按 po-skill 中 wiki-upload 步骤执行；不要把项目工作区中的 `common/` 或 `steps/` 当作内部目录
2. 先执行全局自检规则和全局输出规范，完成后再处理 wiki-upload 配置
3. wiki-upload 配置只允许写入并读取项目根目录 `.env`；`run.py` 会自动读取 `.env`，缺配置时按全局规则补齐键并停止
4. 不要手工检查本地目录、Markdown 文件、图片目录或探测 `md2conf`；缺文件、缺依赖都由脚本返回错误
5. 不得调用 `ht-wiki`、`md2conf`、`pip install`、`python -m pip show`、`which md2conf` 或自写 Python import 探测；唯一上传入口是 `python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-upload ...`
6. 只接受本地 Markdown 文件；若用户给出其他格式，提示先转换为 Markdown 再发布
7. 用户说“上传回原页面”“覆盖这个页面”“更新这个页面”，或提供明确的目标页面 URL/pageId 时，使用更新模式：`--mode update --page-id <页面ID>`；更新模式不读取也不传入 Space Key 或父页面默认值
8. 用户说“发布到某页面下”“作为子页面”“父页面”时，使用新建模式：`--space-key <SpaceKey> --parent-page-id <父页面ID或URL>`；`--parent-page-id` 可填写纯数字父页面 ID，也可填写 `pages/viewpage.action?pageId=...` 页面 URL
9. 如果用户本次显式提供父页面 ID/URL，发布后提醒用户可写入项目根目录 `.env`，后续复用同一父目录
10. 如果用户未显式提供父页面 ID/URL，但 `.env` 中存在 `HTSC_WIKI_PARENT_PAGE_ID` 或 `HTSC_WIKI_PARENT_PAGE_URL`，上传前必须提醒用户将默认发布到该父页面下，并获得用户确认后再执行
11. 调用 `run.py wiki-upload` 执行 `md2conf` 同步发布

## `.env` 配置契约

项目根目录 `.env` 至少需要：

```bash
HTSC_WIKI_TOKEN=<你的 Confluence Personal Access Token>
```

新建页面还需要命令行传入 `--space-key`，或在 `.env` 中配置：

```bash
HTSC_WIKI_SPACE_KEY=<SpaceKey>
HTSC_WIKI_PARENT_PAGE_ID=<父页面ID>
```

缺配置时按 init.md 的全局规则只补齐上述键并停止；不要用临时 shell 环境变量绕过。

## Python 参数模板

更新已有页面：

```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-upload \
  --file "<本地 Markdown 路径>" \
  --mode update \
  --page-id "<已有页面ID>" \
  --title "<页面标题>"
```

新建子页面：

```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py wiki-upload \
  --file "<本地 Markdown 路径>" \
  --space-key "<SpaceKey>" \
  --parent-page-id "<父页面ID或URL>" \
  --title "<页面标题>"
```
