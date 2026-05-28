# 更新/编辑 REQ（需求）

**触发词：** `更新需求`、`修改需求`、`update-req`、`编辑需求`

**职责：** AI 从用户的自然语言描述中提取必要字段，调用 DPMP API 更新已存在的 REQ（需求）。

## 必要信息（从用户描述中提取）

- REQ编号（code）：如 "PRODU-1079"

## 可选更新字段

- REQ名称（name）
- 优先级（priorityLevel）：紧急(致命)/极高(严重)/高(一般)/中(轻微)/低(改善)
- 详细描述（description）
- 需求文档URL（reqdocurl）
- 需求提出人工号（demandOriginator）
- 报告人工号（reporter）
- 经办人工号（assignee）
- 重大需求：Y/N（vipreq）
- 需求文档类型（reqdoctype）

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
📋 即将更新 REQ（需求）：

REQ编号：PRODU-1079
更新字段：
- 优先级：紧急(致命)
- 描述：需要立即处理

确认更新请输入"确认"，或直接修改上述信息后再确认。
```

**重要**：必须确认 REQ 编号是否正确，错误的编号会导致更新失败或更新错误的 REQ。

### Phase B: 执行更新

用户确认后执行更新命令：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py update-req \
    --code "PRODU-1079" \
    --priority "紧急(致命)" \
    --desc "需要立即处理"
```

**注意**：没有值或者为 null 的字段将被清空！

**Mock 模式（测试用）：**
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py update-req \
    --code "PRODU-1079" \
    --priority "紧急(致命)" \
    --desc "测试更新" \
    --mock
```

### Phase C: 完成确认

```
✅ REQ 更新成功！

REQ编号：PRODU-1079
更新字段：
- 优先级：紧急(致命)
- 描述：需要立即处理

更新后状态：开发中
```

## 环境变量配置

所有配置通过 `check-config` 动态检测，不要手动读取 `.env`。配置缺失时按 Phase 0 的流程处理。
参考文件：`.env.example`

## 参数提取指导

对于复杂的自然语言描述，使用参数提取指导：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py extract-params \
    --text "更新S0305-34的需求，名称改为'客户管理系统v2'，经办人改为021343"
```

这将返回结构化的提取指导，帮助 AI 准确提取参数。

## 常见用例

1. **更新优先级**：
   ```
   用户：把PRODU-1079的需求优先级改为紧急，描述更新为需要立即处理
   ```

2. **更新名称和经办人**：
   ```
   用户：更新S0305-34的需求，名称改为'客户管理系统v2'，经办人改为021343
   ```

3. **更新多个字段**：
   ```
   用户：修改TAILOR-124的需求，优先级改为高，描述更新，报告人改为012950
   ```

## 错误处理

1. **REQ 不存在**：检查 REQ 编号是否正确，或确认 REQ 是否已被删除
2. **认证失败**：检查 `DPMP_OPEN_API_TOKEN` 和 `DPMP_APP_ID` 是否正确配置
3. **参数错误**：检查更新字段的格式和值是否合法
4. **权限不足**：确认当前用户是否有权限更新该 REQ
5. **网络错误**：建议使用 Mock 模式测试，或检查网络连接

## 注意事项

1. **字段清空**：如果传递空值或 null，该字段将被清空
2. **部分更新**：可以只更新部分字段，未指定的字段保持不变
3. **状态更新**：使用 `update-status` 命令更新 REQ 状态
4. **历史记录**：DPMP 会记录更新历史，可在系统中查看
5. **并发更新**：注意并发更新可能导致数据冲突