# 更新/编辑story

**触发词：** `更新Story`、`修改Story`、`update-story`、`编辑任务`、`修改任务`

**职责：** AI 从用户的自然语言描述中提取必要字段，调用 DPMP API 更新已存在的 STORY（任务）。

## 必要信息（从用户描述中提取）

- STORY编号（code）：如 "STORY-123"

## 可选更新字段

- STORY名称（name）
- 优先级（priorityLevel）：紧急(致命)/极高(严重)/高(一般)/中(轻微)/低(改善)
- 所属REQ编号（reqcode）
- 报告人工号（reporter）
- 详细描述（description）
- 经办人工号（assignee）
- 计划完成日期（planend）：yyyy-mm-dd
- 计划开发完成日期（plandevend）：yyyy-mm-dd
- 计划测试完成日期（plantestend）：yyyy-mm-dd
- 迭代名称（iterationname）

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
📋 即将更新 STORY（任务）：

STORY编号：STORY-123
更新字段：
- 经办人：021343
- 计划完成日期：2026-07-15

确认更新请输入"确认"，或直接修改上述信息后再确认。
```

**重要**：必须确认 STORY 编号是否正确，错误的编号会导致更新失败或更新错误的 STORY。

### Phase B: 执行更新

用户确认后执行更新命令：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py update-story \
    --code "STORY-123" \
    --assignee "021343" \
    --plan-end "2026-07-15"
```

**注意**：没有值或者为 null 的字段将被清空！

**Mock 模式（测试用）：**
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py update-story \
    --code "STORY-123" \
    --assignee "021343" \
    --plan-end "2026-07-15" \
    --mock
```

### Phase C: 完成确认

```
✅ STORY 更新成功！

STORY编号：STORY-123
更新字段：
- 经办人：021343
- 计划完成日期：2026-07-15

更新后状态：开发中
```

## 环境变量配置

所有配置通过 `check-config` 动态检测，不要手动读取 `.env`。配置缺失时按 Phase 0 的流程处理。
参考文件：`.env.example`

## 参数提取指导

对于复杂的自然语言描述，使用参数提取指导：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py extract-params \
    --text "修改STORY-456的名称和优先级，改为'性能优化'，优先级改为高"
```

这将返回结构化的提取指导，帮助 AI 准确提取参数。

## 常见用例

1. **更新经办人**：
   ```
   用户：更新STORY-123的经办人为021343
   ```

2. **更新名称和优先级**：
   ```
   用户：修改STORY-456的名称和优先级，改为'性能优化'，优先级改为高
   ```

3. **更新计划日期**：
   ```
   用户：更新PROD-1079的计划完成日期为2026-07-15
   ```

4. **更新多个字段**：
   ```
   用户：更新STORY-789，经办人改为012950，描述更新，优先级改为紧急
   ```

## 错误处理

1. **STORY 不存在**：检查 STORY 编号是否正确，或确认 STORY 是否已被删除
2. **认证失败**：检查 `DPMP_OPEN_API_TOKEN` 和 `DPMP_APP_ID` 是否正确配置
3. **参数错误**：检查更新字段的格式和值是否合法
4. **权限不足**：确认当前用户是否有权限更新该 STORY
5. **网络错误**：建议使用 Mock 模式测试，或检查网络连接
6. **REQ 不存在**：如果更新了 reqcode，检查对应的 REQ 是否存在

## 注意事项

1. **字段清空**：如果传递空值或 null，该字段将被清空
2. **部分更新**：可以只更新部分字段，未指定的字段保持不变
3. **状态更新**：使用 `update-status` 命令更新 STORY 状态
4. **历史记录**：DPMP 会记录更新历史，可在系统中查看
5. **并发更新**：注意并发更新可能导致数据冲突
6. **计划日期验证**：计划日期应合理，不应早于当前日期
7. **经办人变更**：变更经办人时，确保新经办人有相应权限

## 与状态更新的区别

| 操作 | 更新内容 | 使用场景 |
|------|----------|----------|
| `update-story` | 更新任务的基本信息（名称、描述、经办人、计划日期等） | 任务信息发生变化时 |
| `update-status` | 更新任务的状态（待分析、开发中、测试中等） | 任务状态流转时 |

## 最佳实践

1. **先查询后更新**：更新前先查询当前信息，确保更新正确
2. **明确更新内容**：向用户明确说明哪些字段将被更新
3. **验证日期格式**：确保日期格式为 yyyy-mm-dd
4. **检查权限**：确认当前用户有权限进行更新
5. **记录变更原因**：在描述中简要说明更新原因
6. **通知相关人员**：重要变更应通知相关团队成员
7. **测试更新**：首次使用或重要更新前，使用 Mock 模式测试