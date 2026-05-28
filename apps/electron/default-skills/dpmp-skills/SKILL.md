---
name: dpmp-skills
version: 0.1.5
description: DPMP项目管理平台REQ与Story的创建、更新、查询及状态管理，使用openApiToken认证。当用户提到REQ、需求、STORY、任务等DPMP相关操作时使用。
triggers:
  - "创建需求"
  - "新建需求"
  - "创建REQ"
  - "新建REQ"
  - "create-req"
  - "添加需求"
  - "更新需求"
  - "修改需求"
  - "编辑需求"
  - "update-req"
  - "查询需求"
  - "查看需求"
  - "查找需求"
  - "query-req"
  - "搜索需求"
  - "创建任务"
  - "新建任务"
  - "创建STORY"
  - "新建STORY"
  - "create-story"
  - "添加任务"
  - "更新任务"
  - "修改任务"
  - "编辑任务"
  - "update-story"
  - "查询任务"
  - "查看任务"
  - "查找任务"
  - "query-story"
  - "搜索任务"
  - "批量创建"
  - "批量创建STORY"
  - "批量创建Story"
  - "batch-create-story"
  - "更新状态"
  - "修改状态"
  - "状态变更"
  - "update-status"
  - "状态更新"
  - "list-keys"
  - "check-config"
  - "DPMP"
  - "dpmp"
  - "dpmp-skills"
  - "提取参数"
  - "extract-params"
  - "参数提取"
  - "显示模板"
  - "show-template"
  - "查看模板"
  - "模板列表"
---

# DPMP Skills

## Overview

DPMP（项目管理平台）REQ 与 Story 创建与管理技能包，使用 openApiToken 认证，提供以下能力：

- **参数提取指导**: 帮助 LLM 从自然语言中提取结构化参数
- **REQ（需求）管理**: 创建、更新、查询 REQ，更新 REQ 状态
- **STORY（任务）管理**: 创建、更新、查询 STORY，更新 STORY 状态

> **环境要求**: 需要 Python 环境，支持 openApiToken 认证的 DPMP API

## 环境变量配置

所有配置通过 `check-config` 动态检测。完整配置项及获取方式详见 `.env.example`。

```bash
# 必需配置
DPMP_BASE_URL=<your_base_url>
DPMP_APP_ID=<your_app_id>
DPMP_OPEN_API_TOKEN=<your-token>
DPMP_AD_ACCOUNT=<your_ad_account>

# 可选配置
DPMP_REQUEST_TIMEOUT=30
DPMP_PRODUCT_KEY=<your_product_keys>
DPMP_PROJECT_KEY=<your_project_keys>
```

## 空间Key选择引导

当需要创建REQ（`--product-key`）或创建STORY（`--project-key`）时，如果用户未在描述中明确指定对应的key，AI 必须调用 `list-keys` 命令获取可用key并引导用户选择：

1. 调用 `scripts/config.py` 加载配置，读取 `DPMP_PRODUCT_KEY`（产品空间）或 `DPMP_PROJECT_KEY`（项目空间）
2. 按英文分号 `;` 分隔为 key 列表
3. 根据列表长度决定行为：
   - **0个key**：提示用户提供对应的 key
   - **1个key**：自动使用该 key，并在确认信息中展示
   - **多个key**：列出所有可用 key，要求用户选择其中一个

**获取可用key的方式**：
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py list-keys
```

**示例对话（多key场景）**：
```
AI: 检测到以下可用产品空间，请选择一个：
    1. PRODU
    2. PRODU2
    3. PRODU3
    请输入编号或key名称。

用户: 1

AI: 已选择产品空间：PRODU
```

## 配置检查与缺失处理

### 全局规则

1. **通过脚本检查配置，不要手动读取 .env**：需要检测配置状态时，调用 `check-config` 命令；不要直接 `cat` 或 `read` `.env` 文件。
2. **保护敏感信息**：绝对不要在对话中回显 Token 明文。日志中也只显示脱敏后的值。

### 配置状态检测

执行任何 DPMP 操作前，AI 应先调用 `check-config` 检测配置是否就绪：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py check-config
```

返回 JSON 示例：
```json
{
  "config_status": "incomplete",
  "missing_count": 2,
  "total_count": 6,
  "items": [
    {"name": "DPMP_BASE_URL", "status": "configured", "value_hint": "http://1..."},
    {"name": "DPMP_APP_ID", "status": "configured", "value_hint": "20260518"},
    {"name": "DPMP_OPEN_API_TOKEN", "status": "missing", "guide": "联系马振徽(011516) 获取"},
    {"name": "DPMP_AD_ACCOUNT", "status": "configured", "value_hint": "012950"}
  ]
}
```

### 配置缺失处理流程

当 `check-config` 返回 `config_status: "incomplete"` 或脚本报配置错误时：

1. **停止当前操作**，不要尝试继续
2. **主动向用户获取缺失配置**，参考 `.env.example` 中的获取指导
3. **AI 代写 `.env`**：用户提供配置后，创建或更新 `${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/.env`
   - 保留已有的其他配置项，只写入或替换缺失的字段
   - 不得要求用户自行编辑 `.env` 文件
   - 不要在对话中回显 Token 明文
4. **写入完成后重新执行刚才失败的命令**

**提示文案模板（Token 缺失时）**：
```
需要先配置 DPMP API Token。

请把 DPMP 系统的 API Token 发我，我会帮你写入配置文件并继续操作。

获取方式：
- 联系马振徽(011516) 获取

这里需要的是 openApiToken，不是浏览器 Cookie。收到 Token 后我会写入 .env，不会在对话中展示 Token 明文。
```

**提示文案模板（工号缺失时）**：
```
请提供你的 AD 账号（工号），我会帮你写入配置文件。

工号示例：012950
```

## 主要命令

### REQ（需求）管理

#### 创建 REQ
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py create-req \
    --name "客户管理系统" \
    --desc "需要支持客户标签管理功能" \
    --priority "高(一般)" \
    --product-key "PRODU" \
    --demand-originator "012950" \
    --reporter "012950" \
    --assignee "012950" \
    --req-doc-url "https://example.com/req" \
    --req-doc-type "PRD"
```

#### 更新 REQ
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py update-req \
    --code "PRODU-1079" \
    --priority "紧急(致命)" \
    --desc "需要立即处理"
```

#### 查询 REQ
```bash
# 精确查询
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py query-req --code "PRODU-1079"

# 条件查询
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py query-req \
    --assignee "021343" \
    --iteration "2024-Q2-Sprint3" \
    --format "table"
```

#### 更新 REQ 状态
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py update-status \
    --code "PRODU-1079" \
    --status "开发中" \
    --type "req"
```

### STORY（任务）管理

#### 创建 STORY（新接口）
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py create-story \
    --name "客户标签管理" \
    --desc "实现客户标签管理功能" \
    --priority "高(一般)" \
    --reporter "012950" \
    --assignee "012950" \
    --project-key "TEST0408" \
    --req-code "PRODU-1079" \
    --plan-end "2026-06-30"
```

#### 更新 STORY
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py update-story \
    --code "STORY-123" \
    --assignee "021343" \
    --plan-end "2026-07-15"
```

#### 查询 STORY
```bash
# 精确查询
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py query-story --code "STORY-123"

# 条件查询
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py query-story \
    --assignee "012950" \
    --iteration "2024-Q2-Sprint3"
```

#### 更新 STORY 状态
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py update-status \
    --code "STORY-123" \
    --status "测试中" \
    --type "story"
```


### 辅助工具

#### 检查配置状态
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py check-config
```

#### 列出可用空间key
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py list-keys
```

#### 参数提取指导
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py extract-params \
    --text "为PRODU-1079需求创建一个客户标签管理的story，经办人是012950，需要在6月30日前完成"
```

#### 显示参数模板
```bash
# 显示所有模板
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py show-template

# 显示特定模板
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py show-template --template create_req
```

#### 批量创建 STORY
```bash
# 从CSV文件批量创建STORY
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py batch-create-story \
    --csv-file "./reference/story_batch_template.csv" \
    --project-key "TEST0408" \
    --priority "高(一般)"

# Dry-run模式（只检查CSV格式不实际创建）
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py batch-create-story \
    --csv-file "./reference/story_batch_template.csv" \
    --project-key "TEST0408" \
    --dry-run

# Mock模式（模拟创建）
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py batch-create-story \
    --csv-file "./reference/story_batch_template.csv" \
    --project-key "TEST0408" \
    --mock
```

## Mock 模式

所有命令都支持 `--mock` 参数，用于测试而不实际调用 API：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py create-req \
    --name "测试需求" \
    --desc "测试描述" \
    --priority "高(一般)" \
    --product-key "TEST" \
    --req-doc-url "https://example.com/doc" \
    --req-doc-type "PRD" \
    --mock
```

## 参数提取指导工作流程

1. **LLM 使用 `extract-params` 获取参数提取指导**
   ```bash
   python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py extract-params \
       --text "用户输入的自然语言描述"
   ```

2. **LLM 根据指导从用户输入中提取结构化参数**

3. **LLM 向用户展示提取结果进行确认**

4. **用户确认后，LLM 生成并执行对应的 CLI 命令**

## 支持的操作类型

### REQ（需求）操作
- **创建 REQ**: `create_req` 模板
- **更新 REQ**: `update_req` 模板  
- **更新 REQ 状态**: `update_status` 模板（type: req）
- **查询 REQ 详情**: `query_req` 模板
- **条件查询 REQ**: `query_req` 模板（带条件）

### STORY（任务）操作
- **创建 STORY**: `create_story` 模板
- **批量创建 STORY**: `batch_create_story` 模板
- **更新 STORY**: `update_story` 模板
- **更新 STORY 状态**: `update_status` 模板（type: story）
- **查询 STORY 详情**: `query_story` 模板
- **条件查询 STORY**: `query_story` 模板（带条件）

## API Endpoints（新接口）

| 接口路径 | 方法 | 功能 |
|----------|------|------|
| `/api/req/addreq` | POST | 创建 REQ |
| `/api/req/updatereq` | POST | 更新 REQ |
| `/api/req/updatestatus` | POST | 更新 REQ 状态 |
| `/api/req/getreqbycode` | GET | 查询 REQ 详情 |
| `/api/req/queryreqbyconditions` | POST | 条件查询 REQ |
| `/api/story/addstory` | POST | 创建 STORY |
| `/api/story/updatestory` | POST | 更新 STORY |
| `/api/story/updatestatus` | POST | 更新 STORY 状态 |
| `/api/story/getstorybycode` | GET | 查询 STORY 详情 |
| `/api/story/querystorybyconditions` | POST | 条件查询 STORY |

## 认证方式

使用 openApiToken + appId + adAccount 认证。

请求头示例：
```json
{
  "from": "OPENAPIHT",
  "openApiToken": "<your-token>",
  "appId": "18",
  "adAccount": "021343",
  "Content-Type": "application/json"
}
```

## 注意事项

1. **必需配置**: `DPMP_OPEN_API_TOKEN` 和 `DPMP_APP_ID` 是必需的
2. **空间key配置**: 可以设置 `DPMP_PRODUCT_KEY` 和 `DPMP_PROJECT_KEY` 作为支持的空间key列表，多个key用分号`;`分隔
3. **错误处理**: 所有命令都包含详细的错误信息和日志
4. **Mock 模式**: 所有命令都支持 `--mock` 参数用于测试
5. **配置校验**: 所有命令在执行前都会自动校验必需的env配置项，如果缺失会给出明确的错误提示

## 步骤描述和使用指南

每个操作都有对应的步骤描述文件，指导 AI 如何与用户交互并执行相应操作：

### 1. REQ（需求）管理步骤
- **创建 REQ**: `steps/create-req.md` - 当用户需要创建新需求时使用
- **更新 REQ**: `steps/update-req.md` - 当用户需要修改已有需求时使用
- **查询 REQ**: `steps/query-req.md` - 当用户需要查看需求信息时使用
- **更新 REQ 状态**: `steps/update-status.md` - 当用户需要变更需求状态时使用

### 2. STORY（任务）管理步骤
- **创建 STORY**: `steps/create-story.md` - 当用户需要创建新任务时使用
- **批量创建 STORY**: `steps/batch-create-story.md` - 当用户需要从CSV文件批量创建任务时使用
- **查询 STORY**: `steps/query-story.md` - 当用户需要查看任务信息时使用
- **更新 STORY**: `steps/update-story.md` - 当用户需要修改已有任务时使用
- **更新 STORY 状态**: `steps/update-status.md` - 当用户需要变更任务状态时使用

### 3. 辅助工具步骤
- **检查配置状态**: 调用 `check-config` 命令检测所有环境变量是否已配置
- **列出可用空间key**: 调用 `list-keys` 命令获取产品空间和项目空间的可用key列表
- **参数提取指导**: `steps/extract-params.md` - 当 AI 需要从自然语言中提取结构化参数时使用
- **显示参数模板**: `steps/show-template.md` - 当用户需要查看可用参数模板时使用

### 4. 工作流程
典型的 AI 交互流程：
1. **识别意图**：根据用户输入判断需要执行的操作
2. **提取参数**：使用 `extract-params` 获取参数提取指导
3. **确认参数**：向用户展示提取的参数并确认
4. **执行操作**：调用相应的 CLI 命令
5. **返回结果**：向用户展示操作结果

## 何时使用这些能力

### 使用 create-req 当：
- 用户说"创建一个需求"、"新建需求"、"添加需求"
- 用户描述了一个新的功能或改进需求
- 需要将业务需求转化为 DPMP 中的正式需求

### 使用 update-req 当：
- 用户说"更新需求"、"修改需求"、"编辑需求"
- 需求信息发生变化需要更新
- 需要调整需求的优先级、描述、经办人等

### 使用 query-req 当：
- 用户说"查询需求"、"查看需求"、"查找需求"
- 需要了解某个需求的详细信息
- 需要按条件搜索相关需求

### 使用 update-status 当：
- 用户说"更新状态"、"修改状态"、"状态变更"
- 需求或任务的状态需要变更
- 工作流程推进到下一个阶段

### 使用 create-story 当：
- 用户说"创建Story"、"新建任务"、"添加任务"
- 需要为需求创建具体的实施任务
- 需要分配具体的开发或测试工作

### 使用 update-story 当：
- 用户说"更新Story"、"修改任务"、"编辑任务"
- 任务信息发生变化需要更新
- 需要调整任务的经办人、计划日期等

### 使用 query-story 当：
- 用户说"查询Story"、"查看任务"、"查找任务"
- 需要了解某个任务的详细信息
- 需要按条件搜索相关任务

### 使用 batch-create-story 当：
- 用户有CSV格式的STORY清单需要批量创建
- 需要从Excel或其他工具导出的数据创建多个STORY
- 需要为多个需求或模块批量创建任务
- 需要将生成的story编号自动回写到原数据文件中

### 使用 extract-params 当：
- 用户用自然语言描述需求
- AI 需要从复杂描述中提取结构化参数
- 需要指导用户补充缺失信息

## 文件结构

```
dpmp-skills/
├── SKILL.md                  # 技能文档（本文档）
├── README.md                 # 使用说明
├── run.py                    # 执行入口（支持所有命令）
├── .env.example              # 环境变量配置模板
├── requirements.txt          # Python 依赖
├── steps/                    # AI 执行流程步骤
│   ├── create-req.md         # 创建 REQ
│   ├── update-req.md         # 更新 REQ
│   ├── query-req.md          # 查询 REQ
│   ├── update-status.md      # 更新状态（REQ/STORY）
│   ├── create-story.md       # 创建 STORY
│   ├── update-story.md       # 更新 STORY
│   ├── query-story.md        # 查询 STORY
│   ├── batch-create-story.md # 批量创建 STORY
│   ├── extract-params.md     # 参数提取指导
│   └── show-template.md      # 显示参数模板
├── scripts/                  # Python 脚本实现
│   ├── config.py             # 配置管理（三级优先级读取）
│   ├── check_config.py       # 配置状态检测
│   ├── api_client.py         # API 客户端（openApiToken 认证）
│   ├── list_keys.py          # 列出可用空间 key
│   ├── create_req.py         # 创建 REQ
│   ├── update_req.py         # 更新 REQ
│   ├── query_req.py          # 查询 REQ
│   ├── update_status.py      # 更新状态
│   ├── create_story.py       # 创建 STORY
│   ├── update_story.py       # 更新 STORY
│   ├── query_story.py        # 查询 STORY
│   ├── batch_create_story.py # 批量创建 STORY
│   ├── extract_params.py     # 参数提取指导
│   └── show_template.py      # 显示参数模板
├── reference/                # 参考模板
│   └── story_batch_template.csv
├── tests/                    # 测试文件
│   └── test_dpmp_workflow.py
└── evals/                    # 评估配置
    └── evals.json
```