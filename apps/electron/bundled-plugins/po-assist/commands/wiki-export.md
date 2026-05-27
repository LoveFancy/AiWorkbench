---
description: 批量导出 Confluence Wiki 页面、页面树或 Space 为 Markdown 知识库
argument-hint: <Wiki URL...> [--output-dir <目录>] [--mode pages|tree|space]
---

执行 po-skill Wiki 批量导出步骤。

输入：$ARGUMENTS

## 执行规则

1. 读取 `<技能根目录>/steps/wiki-export.md`
2. 从用户输入中提取一个或多个 Wiki URL
3. 若用户显式传入 `--mode pages|tree|space`，按参数执行
4. 若未传 `--mode`，按用户语义判断导出范围
5. 若用户通过 `--output-dir` 或自然语言指定保存目录，必须使用该目录
6. 若用户未指定保存目录，使用 `./tmp-wiki-export-<YYYYMMDD-HHMMSS>/`
7. 参考 `cme` 的实际调用方式：
   - `pages` -> `cme pages "<page url>"`
   - `tree` -> `cme pages-with-descendants "<page url>"`
   - `space` -> `cme spaces "<space url>"`
   - `pageId` 链接是 `cme` 原生支持的，可以直接透传
8. 执行完成后输出 `OUTPUT_DIR`、`INDEX_FILE`、`MODE`

本命令用于批量知识库归档，不生成 `[PROD_ORI]`，不自动进入 `/story-analyze`。
