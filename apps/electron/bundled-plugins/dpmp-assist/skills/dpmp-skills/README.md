# DPMP Skills

DPMP（项目管理平台）REQ 与 Story 创建与管理技能包，**使用 openApiToken 认证（完全替换 Cookie）**。

## 🚀 快速开始

### 1. 配置环境变量

复制 `.env.example` 为 `.env` 并配置：

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

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 测试连接

```bash
# 使用 Mock 模式测试
python3 run.py create-req \
    --name "测试需求" \
    --desc "测试描述" \
    --priority "高(一般)" \
    --product-key "TEST" \
    --req-doc-url "https://example.com/doc" \
    --req-doc-type "PRD" \
    --mock
```

## 📋 功能概述

| 命令 | 功能 | 说明 |
|------|------|------|
| **REQ 管理** | | |
| `create-req` | 创建 REQ（需求） | 使用新接口，openApiToken 认证 |
| `update-req` | 更新 REQ | 更新需求信息 |
| `query-req` | 查询 REQ | 精确查询或条件查询 |
| `update-status` | 更新状态 | 更新 REQ/STORY 状态 |
| **STORY 管理** | | |
| `create-story` | 创建 STORY（任务） | 使用新接口 |
| `batch-create-story` | 批量创建 STORY | 从CSV文件批量创建任务 |
| `update-story` | 更新 STORY | 更新任务信息 |
| `query-story` | 查询 STORY | 精确查询或条件查询 |
| **辅助工具** | | |
| `check-config` | 检查配置状态 | 检测所有环境变量是否已配置，输出缺少项 |
| `list-keys` | 列出可用空间key | 显示产品空间和项目空间key列表 |
| `extract-params` | 参数提取指导 | 为 LLM 提供提取指导 |
| `show-template` | 显示参数模板 | 显示可用的参数模板 |

## 🎯 常用示例

### 创建 REQ（需求）

```bash
python3 run.py create-req \
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

### 查询 REQ

```bash
# 精确查询
python3 run.py query-req --code "PRODU-1079"

# 条件查询（表格格式）
python3 run.py query-req \
    --assignee "021343" \
    --iteration "2024-Q2-Sprint3" \
    --format "table"
```

### 创建 STORY（任务）

```bash
python3 run.py create-story \
    --name "客户标签管理" \
    --desc "实现客户标签管理功能" \
    --priority "高(一般)" \
    --reporter "012950" \
    --assignee "012950" \
    --project-key "TEST0408" \
    --req-code "PRODU-1079" \
    --plan-end "2026-06-30"
```

### 更新状态

```bash
# 更新 REQ 状态
python3 run.py update-status \
    --code "PRODU-1079" \
    --status "开发中" \
    --type "req"

# 更新 STORY 状态
python3 run.py update-status \
    --code "STORY-123" \
    --status "测试中" \
    --type "story"
```

### 批量创建 STORY

```bash
# 从CSV文件批量创建STORY
python3 run.py batch-create-story \
    --csv-file "./reference/story_batch_template.csv" \
    --project-key "TEST0408" \
    --priority "高(一般)"

# Dry-run模式（只检查CSV格式不实际创建）
python3 run.py batch-create-story \
    --csv-file "./reference/story_batch_template.csv" \
    --project-key "TEST0408" \
    --dry-run

# Mock模式（模拟创建）
python3 run.py batch-create-story \
    --csv-file "./reference/story_batch_template.csv" \
    --project-key "TEST0408" \
    --mock
```

## 🔧 参数提取指导

帮助 LLM 从自然语言中提取结构化参数：

```bash
python3 run.py extract-params \
    --text "为PRODU-1079需求创建一个客户标签管理的story，经办人是012950，需要在6月30日前完成"
```

输出为 JSON 格式的指导信息，包含：
- 建议的模板
- 字段描述
- 提取指导

## 🔧 显示参数模板

查看所有可用的参数模板：

```bash
python3 run.py show-template
```

查看特定模板的详细信息：

```bash
python3 run.py show-template --template create_req
```

这将显示模板的字段说明、必填项和示例，帮助 AI 更好地理解如何提取参数。

## 🔍 检查配置状态

在首次使用或遇到认证问题时，可以检查当前配置状态：

```bash
python3 run.py check-config
```

输出示例：
```
✅ DPMP_BASE_URL: DPMP API 基础地址
✅ DPMP_APP_ID: 应用ID
❌ DPMP_OPEN_API_TOKEN: API Token
   获取方式: 登录 DPMP 系统 → 个人设置 → API Token 管理 → 创建并复制 Token
```

## 🧪 Mock 模式

所有命令都支持 `--mock` 参数，用于测试而不实际调用 API：

```bash
python3 run.py create-req \
    --name "测试需求" \
    --desc "测试描述" \
    --priority "高(一般)" \
    --product-key "TEST" \
    --mock
```

## ⚙️ 环境变量说明

### 空间key配置

在 `.env` 文件中可以设置产品空间和项目空间的key列表，多个key用英文分号`;`分隔：

```bash
# 产品空间key列表（创建REQ时使用），多个key用英文分号;分隔
DPMP_PRODUCT_KEY=PRODU;PRODU2;PRODU3

# 项目空间key列表（创建STORY时使用），多个key用英文分号;分隔
DPMP_PROJECT_KEY=TEST0408;TEST0409;TEST0410
```

配置支持的空间key后，在创建REQ或STORY时可通过 `--product-key` 或 `--project-key` 参数指定使用的空间key。

## 📚 详细文档

- **技能文档**: 查看 `SKILL.md` 获取完整命令参考和 API 说明
- **接口文档**: 查看 `docs/reference/dpmp接口列表.md` 获取 API 接口详情
- **测试示例**: 查看 `docs/reference/dpmp接口测试.http` 获取接口测试示例

## 🐛 故障排除

### 常见问题

1. **认证失败**：
   - 检查 `DPMP_OPEN_API_TOKEN` 和 `DPMP_APP_ID` 是否正确
   - 检查 `DPMP_AD_ACCOUNT` 是否已设置
   - 验证 API 地址 `DPMP_BASE_URL` 是否可以访问

2. **命令未找到**：
   - 确保使用正确的命令名称
   - 检查 `run.py` 文件是否存在且可执行

3. **参数错误**：
   - 使用 `--help` 查看命令帮助：`python3 run.py create-req --help`
   - 检查必需参数是否都已提供

### 调试模式

设置环境变量查看详细日志：
```bash
export LOG_LEVEL=DEBUG
python3 run.py query-req --code "PRODU-1079"
```

## 🧩 步骤描述文件

每个操作都有对应的步骤描述文件，指导 AI 如何与用户交互并执行操作：

### REQ（需求）管理
- `steps/create-req.md` - 创建 REQ（需求）
- `steps/update-req.md` - 更新 REQ
- `steps/query-req.md` - 查询 REQ
- `steps/update-status.md` - 更新 REQ 状态

### STORY（任务）管理
- `steps/create-story.md` - 创建 STORY
- `steps/update-story.md` - 更新 STORY
- `steps/query-story.md` - 查询 STORY
- `steps/update-status.md` - 更新 STORY 状态

### 辅助工具
- `steps/extract-params.md` - 参数提取指导
- `steps/show-template.md` - 显示参数模板

## 🤖 AI 工作流程

典型的 AI 交互流程：
1. **识别意图**：根据用户输入判断需要执行的操作
2. **提取参数**：使用 `extract-params` 获取参数提取指导
3. **确认参数**：向用户展示提取的参数并确认
4. **执行操作**：调用相应的 CLI 命令
5. **返回结果**：向用户展示操作结果

## 📄 许可证

本项目遵循公司内部使用规范。

## 🤝 贡献

如需改进或发现问题，请提交 Issue 或 Pull Request。

## 📞 支持

- 查看详细文档：`SKILL.md`
- 查看接口文档：`docs/reference/`
- 查看步骤描述：`steps/` 目录
- 测试接口连接：使用 Mock 模式测试命令