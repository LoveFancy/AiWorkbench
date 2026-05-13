# prd-write：从零合成首版草稿 PRD

**触发词：** `prd-write` 或"编写PRD"或"写PRD"或"创建PRD"

**职责：** 从用户自由文字描述和可选的关联文档中，合成首版草稿 PRD。

"首版草稿"指：
- 输出文件结构与最终 PRD 完全一致
- 内容允许存在 `<!-- 待补充 -->`、待确认项
- 目标是帮助用户快速形成可审查、可迭代的第一版

---

## 阶段 A：输入解析与 REQID 确认

### Step 1：解析用户输入

| 类型 | 识别模式 | 用途 |
|------|----------|------|
| Wiki URL | `http://wiki...pageId=...` | 阶段 B 用 doc-convert 转换 |
| EIP 文档 | `eip.htsc.com.cn/htscPortalDocs/` | 阶段 B 默认派发 cloud-doc-downloader；调试开关可禁用 |
| LinkApp 短链 | `linkapp.htsc.com.cn/S/` | 阶段 B 默认派发 cloud-doc-downloader；调试开关可禁用 |
| 本地文档 | `.docx` / `.pdf` / `.doc` | 阶段 B 用 doc-to-md 转换 |
| REQID | 大写字母+数字组合（如 `TAILOR-124`） | 目录命名 |
| 自然语言描述 | 剩余所有文字 | PRD 主素材 |

### Step 2：确定 REQID

```
├─ 输入中已含 REQID → 直接使用
└─ 无 REQID → 自动生成 REQ-YYYYMMDD-NNN
```

### Step 3：创建目录

```bash
mkdir -p "{REQID}/1.产品设计/references/images/"
```

### Step 4：关联文档确认

若未发现任何 Wiki URL、EIP / LinkApp URL 或本地文档 → 询问："是否有需要关联的参考文档（Wiki 链接、EIP/LinkApp 云文档或本地 docx/pdf 文件）？没有请回复'无'。"

---

## 阶段 B：关联文档转换

> 无需关联文档时跳过。

对每个文档：

**Wiki URL：**
```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-convert --url "<URL>" --output-dir "{REQID}/1.产品设计/references"
```

**EIP / LinkApp 云文档：**

默认优先派发插件 subagent `cloud-doc-downloader` 并行处理，输入：

```json
{
  "source_url": "<EIP或LinkApp URL>",
  "reqid": "{REQID}",
  "references_dir": "{REQID}/1.产品设计/references"
}
```

主会话不要等待云文档下载完成才生成 PRD V0。派发后继续进入阶段 C。

调试开关：如果用户输入包含 `--no-cloud-subagent`、"不用 subagent"、"同步调试"、"当前会话执行"，或环境变量 `PO_CLOUD_DOC_SUBAGENT=0` / `false` / `off`，禁止派发 subagent，改为同步执行 `steps/doc-browser-download.md`。这种模式用于调试 Chrome DevTools MCP 操作、观察页面元素定位、排查浏览器实例冲突。同步模式下先完成云文档下载和转换，再进入阶段 C。

subagent 返回成功时，读取结果中的 `output_file`，在阶段 D 按“补充文档”流程处理。subagent 返回失败时，根据 `error_code` 给出具体回退：

- `AUTH_REQUIRED`：提示用户先在浏览器登录后重试
- `PERMISSION_DENIED`：提示用户确认权限或联系文档所有者
- 其他可恢复错误：提示用户手动下载并将文件放入 `{REQID}/1.产品设计/references/`

若 `cloud-doc-downloader` 不可用，回退为同步执行 `steps/doc-browser-download.md`。

**本地文档：**
```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/po-skills/run.py doc-to-md --file "<路径>" --output-dir "{REQID}/1.产品设计/references"
```

转换后如有图片引用，执行 enhance-content。

---

## 阶段 C：生成首版草稿 PRD

> 执行过程中最多向用户输出 4 句进展提示，用产品语言，不暴露内部步骤。

1. 输出 `"正在分析你的需求描述…"`
2. `read` 模板：`${CLAUDE_PLUGIN_ROOT}/skills/po-skills/references/prd-draft-template.md`
3. 输出 `"已确定文档结构，正在填充 PRD 内容…"`
4. 用户输入为主素材，按模板结构生成完整 PRD；用户没说的不编，缺什么标 `<!-- 待补充 -->`
5. 输出 `"正在保存 PRD 文档…"`
6. 一次 `write` 写入：`{REQID}/1.产品设计/[PROD_FORMAT]{标题}.md`（标题不超过 20 字）
7. 完成输出：`首版草稿 PRD 已生成：<路径>。下一步建议：/req-review 进行质量审查。需要吗？`

---

## 阶段 D：补充文档（可选）

用户补充新文档时：
1. 处理新文档（→ references/）
2. 重新读取所有 references + 现有 PRD
3. 列出受影响的章节，**征得用户确认后**用 Edit 工具做定向替换

---

## 阶段 E：后续引导

PRD 完成后主动引导：`/req-review {REQID}/1.产品设计/[PROD_FORMAT]{标题}.md`
