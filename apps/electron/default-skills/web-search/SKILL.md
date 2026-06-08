---
name: web-search
description: 当用户需要当前、近期或公开网页信息，明确要求联网搜索/查询，或提出可能过期、不确定的事实问题时使用。
version: "1.0.2"
---

# Web Search

当需要当前公开网页信息时使用本 Skill。内置搜索脚本会直接调用 WorkMate 的 Compass 搜索服务，并有意忽略代理环境变量。

## How To Search

Run the helper from this skill directory:

```bash
node scripts/search.mjs "搜索关键词"
```

The default search window is one month. When the user asks for a specific validity period, pass `--time-range`:

```bash
node scripts/search.mjs --time-range OneWeek "搜索关键词"
```

Supported values:

- `OneDay` — last day
- `OneWeek` — last week
- `OneMonth` — last month, default
- `OneYear` — last year

The script returns compact result previews by default to avoid oversized tool outputs. If the user asks to inspect details after seeing the result list, rerun with a larger preview:

```bash
node scripts/search.mjs --time-range OneMonth --max-content-chars 2000 "搜索关键词"
```

Use concise, specific Chinese or English keywords. If the result is too broad, search again with narrower terms.

## Answering Rules

- Cite result URLs in your answer.
- Prefer the `content` field over short snippets when both are present.
- If the script reports an error, include the error reason and do not invent results.
- For high-stakes topics, search multiple focused queries and compare sources before answering.
