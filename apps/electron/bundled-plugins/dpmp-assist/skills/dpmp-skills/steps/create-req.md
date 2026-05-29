# 创建 REQ（需求）

**触发词：** `创建需求`、`新建需求`、`create-req`、`添加需求`

**职责：** AI 从用户的自然语言描述中提取必要字段，调用 DPMP API 创建 REQ（需求）。

## 必要信息（从用户描述中提取）

根据DPMP接口文档，创建REQ需要以下必填字段：

- **产品空间key（productkey）** - 产品空间标识
- **REQ名称（name）** - 需求标题
- **优先级（priorityLevel）** - 紧急(致命)/极高(严重)/高(一般)/中(轻微)/低(改善)
- **详细描述（description）** - 需求详细描述
- **需求文档URL（reqdocurl）** - 需求文档链接
- **需求文档类型（reqdoctype）** - 需求文档类型
- **需求提出人工号（demandOriginator）** - 提出需求的工号
- **报告人工号（reporter）** - 报告人工号
- **经办人工号（assignee）** - 经办人工号

## 可选信息

- **重大需求：Y/N（vipreq）** - 是否重大需求

## AI 执行流程

### Phase 0: 配置检查（首次或按需）

在用户首次使用时，先调用 `check-config` 检测配置状态：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py check-config
```

根据输出处理：
- `config_status: "ready"` → 直接进入 Phase A
- `config_status: "incomplete"` → 向用户说明哪些配置缺失，按 SKILL.md 中的配置缺失处理流程引导用户补充

不要手动读取 `.env` 文件，所有配置检测通过 `check-config` 脚本完成。

### Phase A: 提取字段并确认

从用户描述中提取字段，使用参数提取指导获取结构化参数：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py extract-params \
    --text "用户输入的自然语言描述"
```

根据提取指导，从用户输入中提取结构化参数，并向用户展示确认：

```
📋 即将创建 REQ（需求）：

产品空间：PRODU
名称：客户管理系统
优先级：高(一般)
描述：需要支持客户标签管理功能
需求提出人：012950
报告人：012950
经办人：012950

确认创建请输入"确认"，或直接修改上述信息后再确认。
```

如果用户描述中缺少必需字段，**必须先向用户询问，不要猜测**。

**产品空间Key选择**：当用户未指定 `--product-key` 时，通过以下命令获取可用key列表：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py list-keys
```

按以下规则处理：

1. 从输出中解析产品空间key列表（按 `, ` 分隔）
2. **0个key**：提示用户提供产品空间key，例如：`请提供产品空间key（如 PRODU）`
3. **1个key**：自动使用该key，并在确认信息中展示
4. **多个key**：列出所有可用key，要求用户选择：

```
检测到以下可用产品空间，请选择一个：
  1. PRODU
  2. PRODU2
  3. S0305
请输入编号或key名称。
```

### Phase B: 执行创建

用户确认后执行创建命令：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py create-req \
    --product-key "PRODU" \
    --name "客户管理系统" \
    --priority "高(一般)" \
    --desc "需要支持客户标签管理功能" \
    --demand-originator "012950" \
    --reporter "012950" \
    --assignee "012950" \
    --req-doc-url "https://example.com/req" \
    --req-doc-type "PRD"
```

**Mock 模式（测试用）：**
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py create-req \
    --product-key "PRODU" \
    --name "测试需求" \
    --priority "高(一般)" \
    --desc "测试描述" \
    --req-doc-url "https://example.com/doc" \
    --req-doc-type "PRD" \
    --mock
```

### Phase C: 完成确认

```
✅ REQ 创建成功！

产品空间：PRODU
名称：客户管理系统
优先级：高(一般)
REQ编号：PRODU-1079
状态：待分析

可在 DPMP 系统中查看详情。
```

## 环境变量配置

所有配置通过 `check-config` 动态检测，不要手动读取 `.env`。配置缺失时按 Phase 0 的流程处理。
参考文件：`.env.example`

## 参数提取指导

对于复杂的自然语言描述，使用参数提取指导：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py extract-params \
    --text "在S0305产品空间下创建一个用户登录优化的需求，优先级中等，需求提出人是012950"
```

这将返回结构化的提取指导，帮助 AI 准确提取参数。

## 常见用例

1. **创建普通需求**：
   ```
   用户：创建一个客户管理系统的需求，产品空间key是PRODU，优先级为高，需要支持客户标签管理
   ```

2. **创建带提出人的需求**：
   ```
   用户：在S0305产品空间下创建一个用户登录优化的需求，优先级中等，需求提出人是012950
   ```

3. **创建重大需求**：
   ```
   用户：创建一个紧急的支付系统升级需求，产品空间是FINANCE，这是重大需求
   ```

## 错误处理

1. **认证失败**：检查 `DPMP_OPEN_API_TOKEN` 和 `DPMP_APP_ID` 是否正确配置
2. **参数缺失**：提示用户补充必需字段
3. **网络错误**：建议使用 Mock 模式测试，或检查网络连接
4. **API 错误**：显示详细的错误信息，帮助用户诊断问题