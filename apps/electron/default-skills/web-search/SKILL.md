---
name: web-search
description: Use when the user asks for current, recent, public web information, explicitly requests online search or lookup, or asks a factual question that may be outdated or uncertain.
version: "1.0.0"
---

# Web Search

Use this skill when you need current public web information. The bundled search script calls Proma's built-in Compass search service directly and deliberately ignores proxy environment variables.

## How To Search

Run the helper from this skill directory:

```bash
node scripts/search.mjs "搜索关键词"
```

Use concise, specific Chinese or English keywords. If the result is too broad, search again with narrower terms.

## Answering Rules

- Cite result URLs in your answer.
- Prefer the `content` field over short snippets when both are present.
- If the script reports an error, include the error reason and do not invent results.
- For high-stakes topics, search multiple focused queries and compare sources before answering.
