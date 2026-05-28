# 显示参数模板 - 查看可用的参数模板

**触发词：** `显示模板`、`查看模板`、`模板列表`、`show-template`、`可用模板`

**职责：** 显示可用的参数模板信息，帮助 AI 了解支持的操作类型和参数结构。

## 使用场景

当 AI 需要了解支持哪些操作类型，或者需要查看某个操作的参数结构时，使用此工具获取模板信息。

## AI 执行流程

### Phase A: 调用模板显示命令

#### 显示所有模板：
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py show-template
```

#### 显示特定模板：
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py show-template \
    --template create_req
```

### Phase B: 分析模板信息

工具返回的模板信息包含：

1. **可用模板列表**：所有支持的模板名称
2. **模板详情**（如果指定了特定模板）：
   - 模板名称
   - 实体类型：REQ（需求）或 STORY（任务）
   - 操作类型：创建、更新、查询、状态更新
   - 必需字段：必须提供的参数
   - 可选字段：可选的参数
   - 描述：模板的功能描述
   - 示例：使用示例

### Phase C: 应用模板信息

AI 根据模板信息：
1. **了解支持的操作**：知道可以执行哪些类型的操作
2. **学习参数结构**：了解每个操作需要哪些参数
3. **指导用户交互**：知道需要向用户询问哪些信息
4. **生成正确命令**：根据模板生成正确的 CLI 命令

## 支持的模板类型

### 1. 创建类模板
- **create_req**: 创建 REQ（需求）
- **create_story**: 创建 STORY（任务）

### 2. 更新类模板
- **update_req**: 更新 REQ
- **update_story**: 更新 STORY
- **update_status**: 更新状态（REQ 或 STORY）

### 3. 查询类模板
- **query_req**: 查询 REQ
- **query_story**: 查询 STORY

## 模板详情示例

### create_req 模板：
```
模板名称：create_req
实体类型：REQ（需求）
操作类型：创建
必需字段：productkey, name, priorityLevel, description
可选字段：reqdoctype, reqdocurl, demandOriginator, reporter, assignee, vipreq
描述：创建需求（REQ）的参数模板（使用 openApiToken 认证）
```

### create_story 模板：
```
模板名称：create_story
实体类型：STORY（任务）
操作类型：创建
必需字段：name, priorityLevel, description, reporter, assignee
可选字段：projectkey, iterationname, reqcode, plandevend, plantestend, planend
描述：创建任务（STORY）的参数模板（使用 openApiToken 认证）
```

### update_status 模板：
```
模板名称：update_status
实体类型：UNKNOWN（可以是 REQ 或 STORY）
操作类型：状态更新
必需字段：code, statusname
可选字段：[]
描述：更新状态（REQ或STORY）的参数模板（使用 openApiToken 认证）
```

## 环境变量配置

所有配置通过 `check-config` 动态检测，不要手动读取 `.env`。参考文件：`.env.example`

## 使用示例

### 示例 1：查看所有模板
```
用户：显示所有可用的模板

AI 执行：
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py show-template

AI 响应：
可用模板：
- create_req: 创建 REQ（需求）
- create_story: 创建 STORY（任务）
- update_req: 更新 REQ
- update_story: 更新 STORY
- update_status: 更新状态
- query_req: 查询 REQ
- query_story: 查询 STORY
```

### 示例 2：查看特定模板
```
用户：查看创建需求的模板

AI 执行：
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py show-template --template create_req

AI 响应：
模板名称：create_req
实体类型：REQ（需求）
操作类型：创建
必需字段：productkey, name, priorityLevel, description
可选字段：reqdoctype, reqdocurl, demandOriginator, reporter, assignee, vipreq
描述：创建需求（REQ）的参数模板（使用 openApiToken 认证）

示例：
用户输入：创建一个客户管理系统的需求，产品空间key是PRODU，优先级为高，需要支持客户标签管理
提取参数：{"productkey": "PRODU", "name": "客户管理系统", "priorityLevel": "高(一般)", "description": "需要支持客户标签管理功能"}
```

## 与 extract-params 的关系

| 特性 | show-template | extract-params |
|------|--------------|----------------|
| 目的 | 显示模板结构 | 提供提取指导 |
| 输入 | 模板名称（可选） | 自然语言描述 |
| 输出 | 模板详情 | 提取指导 |
| 使用时机 | 了解支持的操作 | 实际提取参数 |
| 关系 | 先了解模板，再提取参数 | 根据模板指导提取参数 |

## 最佳实践

1. **先了解后操作**：在开始交互前，先了解支持哪些操作
2. **学习参数结构**：熟悉每个操作的参数要求
3. **指导用户提问**：根据模板知道需要询问哪些信息
4. **验证参数完整性**：检查必需参数是否都已获取
5. **提供示例**：向用户展示示例，帮助理解

## 错误处理

1. **模板不存在**：如果指定了不存在的模板，返回错误信息
2. **参数错误**：检查命令行参数是否正确
3. **网络错误**：返回本地缓存的模板信息
4. **配置错误**：检查环境变量是否正确配置

## 在 AI 工作流中的作用

### 1. 初始化阶段
- AI 了解支持哪些 DPMP 操作
- 学习参数结构和要求
- 准备与用户交互的问题

### 2. 交互阶段
- 根据模板指导用户提供信息
- 验证用户提供的参数是否完整
- 补充缺失的必需信息

### 3. 执行阶段
- 根据模板生成正确的 CLI 命令
- 确保参数格式正确
- 处理可能的错误情况

### 4. 学习阶段
- AI 通过模板学习 DPMP 系统的操作模式
- 积累处理类似请求的经验
- 优化与用户的交互方式

## 注意事项

1. **模板是指导**：模板提供指导，但实际交互需要灵活处理
2. **参数映射**：注意 API 字段名与 CLI 参数名的映射关系
3. **认证一致**：使用与其他 DPMP 工具相同的认证方式
4. **版本兼容**：模板可能随 API 版本更新而变化
5. **本地缓存**：模板信息可能被缓存以提高性能