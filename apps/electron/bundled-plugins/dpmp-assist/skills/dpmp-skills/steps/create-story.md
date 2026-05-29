# 创建 story（需求）

**触发词：** `创建Story`、`新建Story`、`create-story`、`添加任务`、`创建任务`

**职责：** AI 从用户的自然语言描述中提取必要字段，调用 DPMP API 创建 STORY（任务）。

## 必要信息（从用户描述中提取）

- STORY名称（name）
- 优先级（priorityLevel）：紧急(致命)/极高(严重)/高(一般)/中(轻微)/低(改善)
- 详细描述（description）
- 报告人工号（reporter）
- 经办人工号（assignee）
- 项目空间key（projectkey）

## 可选信息

- 迭代名称（iterationname）
- 所属REQ编号（reqcode）
- 计划开发完成日期（plandevend）：yyyy-mm-dd
- 计划测试完成日期（plantestend）：yyyy-mm-dd
- 计划完成日期（planend）：yyyy-mm-dd

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
📋 即将创建 STORY（任务）：

名称：客户标签管理
优先级：高(一般)
描述：实现客户标签管理功能
报告人：012950
经办人：012950
项目空间：TEST0408
所属需求：PRODU-1079
计划完成日期：2026-06-30

确认创建请输入"确认"，或直接修改上述信息后再确认。
```

如果用户描述中缺少必需字段，**必须先向用户询问，不要猜测**。

**项目空间Key选择**：当用户未指定 `--project-key` 时，通过以下命令获取可用key列表：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py list-keys
```

按以下规则处理：

1. 从输出中解析项目空间key列表（按 `, ` 分隔）
2. **0个key**：提示用户提供项目空间key，例如：`请提供项目空间key（如 TEST0408）`
3. **1个key**：自动使用该key，并在确认信息中展示
4. **多个key**：列出所有可用key，要求用户选择：

```
检测到以下可用项目空间，请选择一个：
  1. TEST0408
  2. TEST0409
  3. PROJ01
请输入编号或key名称。
```

### Phase B: 执行创建

用户确认后执行创建命令：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py create-story \
    --name "客户标签管理" \
    --priority "高(一般)" \
    --desc "实现客户标签管理功能" \
    --reporter "012950" \
    --assignee "012950" \
    --project-key "TEST0408" \
    --req-code "PRODU-1079" \
    --plan-end "2026-06-30"
```

**Mock 模式（测试用）：**
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py create-story \
    --name "测试任务" \
    --priority "高(一般)" \
    --desc "测试描述" \
    --reporter "012950" \
    --assignee "012950" \
    --mock
```

### Phase C: 完成确认

```
✅ STORY 创建成功！

名称：客户标签管理
优先级：高(一般)
描述：实现客户标签管理功能
STORY编号：STORY-456
状态：待分析
经办人：012950
计划完成日期：2026-06-30

可在 DPMP 系统中查看详情。
```

## 环境变量配置

所有配置通过 `check-config` 动态检测，不要手动读取 `.env`。配置缺失时按 Phase 0 的流程处理。
参考文件：`.env.example`

**注意**：
`DPMP_AD_ACCOUNT` 用于标识操作人，应与报告人或经办人一致

## 参数提取指导

对于复杂的自然语言描述，使用参数提取指导：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py extract-params \
    --text "为PRODU-1079需求创建一个用户界面优化的story，在TEST0408项目下，优先级中等，需要在2026-06-30前完成"
```

这将返回结构化的提取指导，帮助 AI 准确提取参数。

## 与 quick-story 的区别

| 特性 | create-story（新接口） | quick-story（兼容接口） |
|------|----------------------|----------------------|
| 认证方式 | openApiToken + appId + adAccount | openApiToken + appId + adAccount |
| 接口路径 | `/api/story/addstory` | 兼容旧接口 |
| 必需字段 | name, priorityLevel, description, reporter, assignee, projectkey | name, desc, iteration, req-code, assignee |
| 可选字段 | iterationname, reqcode, plandevend, plantestend, planend | reporter（可选） |
| 使用场景 | 新的标准接口，功能更完整 | 保持向后兼容 |

## 常见用例

1. **创建标准 STORY**：
   ```
   用户：创建一个客户标签管理的story，优先级为高，报告人和经办人都是012950
   ```

2. **创建带需求关联的 STORY**：
   ```
   用户：为PRODU-1079需求创建一个用户界面优化的story，在TEST0408项目下，优先级中等，需要在2026-06-30前完成
   ```

3. **创建带时间计划的 STORY**：
   ```
   用户：创建一个性能优化的story，优先级紧急，经办人021343，计划6月30日开发完成，7月5日测试完成
   ```

## 错误处理

1. **认证失败**：检查 `DPMP_OPEN_API_TOKEN` 和 `DPMP_APP_ID` 是否正确配置
2. **参数缺失**：提示用户补充必需字段
3. **需求不存在**：如果指定了 reqcode，检查对应的 REQ 是否存在
4. **项目不存在**：如果指定了 projectkey，检查对应的项目是否存在
5. **日期格式错误**：日期必须为 yyyy-mm-dd 格式
6. **网络错误**：建议使用 Mock 模式测试，或检查网络连接
7. **权限不足**：确认当前用户是否有权限创建 STORY

## 最佳实践

1. **关联需求**：尽量为 STORY 关联对应的 REQ，便于跟踪和管理
2. **明确经办人**：确保经办人是实际负责该任务的人员
3. **合理设置计划**：根据任务复杂度合理设置计划完成日期
4. **详细描述**：提供清晰的描述，便于后续开发和测试
5. **优先级设置**：根据业务影响设置合适的优先级
6. **使用 Mock 测试**：首次使用或网络不稳定时，使用 Mock 模式测试