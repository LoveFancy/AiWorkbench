# 独立工具：quick-story（直接创建单条 DPMP Story）

**触发词：** `创建Story`、`新建Story`、`quick-story`

**职责：** AI 从用户的自然语言描述中提取必要字段，直接调用 DPMP API 创建单条 Story，无需 `[STORY_PLAN].csv`。

**必要信息（从用户描述中提取）：**
- Story 名称
- Story 描述
- 所属迭代名（如"2024-Q2-Sprint3"）
- 所属需求编号（如"TAILOR-124"）

**可选信息（缺失时从 pmconfig 或 .env 读取默认值）：**
- 经办人工号（默认读 `pmconfig.md` 中的"默认经办人工号"，或 `.env` 中的 `DPMP_DEFAULT_ASSIGNEE`）
- 创建人工号（默认同经办人）

**AI 执行流程：**

### 阶段 A：提取字段，确认信息

从用户描述中提取字段，读取 `../../pmconfig.md` 补全默认值，向用户展示确认：

```
📋 即将创建 Story：

名称：【前后端】客户标签管理
描述：支持对客户添加、删除、查询标签
迭代：2024-Q2-Sprint3
需求：TAILOR-124
经办人：012950（秦晓）
创建人：012950

确认创建请输入"确认"，或直接修改上述信息后再确认。
```

如果用户描述中缺少迭代名或需求编号，**必须先向用户询问，不要猜测**。

### 阶段 B：执行创建

用户确认后执行：

```bash
python3 run.py quick-story \
    --name "<Story名称>" \
    --desc "<Story描述>" \
    --iteration "<迭代名>" \
    --req-code "<需求编号>" \
    --assignee "<经办人工号>" \
    --reporter "<创建人工号>"
```

**Mock 模式（网络不通时）：**
```bash
python3 run.py quick-story \
    --name "<Story名称>" \
    --desc "<Story描述>" \
    --iteration "<迭代名>" \
    --req-code "<需求编号>" \
    --mock
```

### 阶段 C：完成

```
✅ Story 创建成功！
名称：<名称>
迭代：<迭代>
需求：<需求编号>
STORY_ID：<真实ID>
```
