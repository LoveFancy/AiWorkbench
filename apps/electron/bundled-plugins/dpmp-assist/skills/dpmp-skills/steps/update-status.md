# 更新REQ/story的状态

**触发词：** `更新状态`、`修改状态`、`状态变更`、`update-status`、`状态更新`

**职责：** AI 从用户的请求中提取实体类型和状态信息，调用 DPMP API 更新 REQ（需求）或 STORY（任务）的状态。

## 支持更新的实体类型

### 1. REQ（需求）状态更新
- 实体类型：`req`
- 必需信息：REQ编号（code）、状态名称（statusname）

### 2. STORY（任务）状态更新
- 实体类型：`story`
- 必需信息：STORY编号（code）、状态名称（statusname）

## 常见状态名称

### REQ（需求）状态：
- 待分析
- 分析中
- 待评审
- 评审中
- 待排期
- 已排期
- 开发中
- 测试中
- 已上线
- 已关闭
- 已取消

### STORY（任务）状态：
- 待分析
- 分析中
- 待开发
- 开发中
- 待测试
- 测试中
- 待验收
- 已验收
- 已关闭
- 已取消

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

### Phase A: 确定实体类型并提取信息

分析用户请求，确定是更新 REQ 状态还是 STORY 状态：

1. **识别实体类型**：
   - 包含"需求"、"REQ"关键词 → `req`
   - 包含"任务"、"STORY"关键词 → `story`
   - 无法确定时询问用户

2. **提取编号和状态**：
   ```
   用户：将PRODU-1079的需求状态更新为开发中
   提取：code = "PRODU-1079", statusname = "开发中", type = "req"
   ```

使用参数提取指导获取结构化参数：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py extract-params \
    --text "用户输入的状态更新描述"
```

### Phase B: 确认更新信息

向用户展示确认信息：

```
📋 即将更新状态：

实体类型：REQ（需求）
编号：PRODU-1079
当前状态：待分析（根据查询获取）
目标状态：开发中

确认更新请输入"确认"，或直接修改上述信息后再确认。
```

**重要**：建议先查询当前状态，让用户确认状态变更的合理性。

### Phase C: 执行状态更新

用户确认后执行更新命令：

#### 更新 REQ 状态：
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py update-status \
    --code "PRODU-1079" \
    --status "开发中" \
    --type "req"
```

#### 更新 STORY 状态：
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py update-status \
    --code "STORY-123" \
    --status "测试中" \
    --type "story"
```

**Mock 模式（测试用）：**
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py update-status \
    --code "PRODU-1079" \
    --status "开发中" \
    --type "req" \
    --mock
```

### Phase D: 完成确认

```
✅ 状态更新成功！

实体类型：REQ（需求）
编号：PRODU-1079
原状态：待分析
新状态：开发中
更新时间：2024-05-22 10:30:25

状态变更已完成，相关团队成员已收到通知。
```

## 环境变量配置

所有配置通过 `check-config` 动态检测，不要手动读取 `.env`。配置缺失时按 Phase 0 的流程处理。
参考文件：`.env.example`

## 参数提取指导

对于复杂的状态更新描述，使用参数提取指导：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py extract-params \
    --text "把STORY-123的状态改为测试中"
```

这将返回结构化的提取指导，帮助 AI 准确提取参数。

## 常见用例

1. **更新 REQ 状态**：
   ```
   用户：将PRODU-1079的需求状态更新为开发中
   ```

2. **更新 STORY 状态**：
   ```
   用户：把STORY-123的状态改为测试中
   ```

3. **批量状态更新**：
   ```
   用户：将迭代2024-Q2-Sprint3下所有STORY的状态更新为开发中
   （注意：需要先查询，然后逐个更新）
   ```

4. **状态流转确认**：
   ```
   用户：确认PRODU-1079是否可以进入测试阶段
   （先查询当前状态，再建议合适的状态变更）
   ```

## 错误处理

1. **实体不存在**：检查编号是否正确，或确认实体是否已被删除
2. **状态流转非法**：检查状态变更是否符合工作流规则
3. **认证失败**：检查 `DPMP_OPEN_API_TOKEN` 和 `DPMP_APP_ID` 是否正确配置
4. **权限不足**：确认当前用户是否有权限更新该实体的状态
5. **网络错误**：建议使用 Mock 模式测试，或检查网络连接

## 注意事项

1. **状态验证**：更新前建议查询当前状态，确保状态变更合理
2. **权限检查**：不同角色可能有不同的状态更新权限
3. **通知机制**：状态变更可能会触发通知，通知相关团队成员
4. **历史记录**：DPMP 会记录状态变更历史，可在系统中查看
5. **批量操作**：批量更新状态时，注意处理失败的情况
6. **并发更新**：注意并发更新可能导致状态冲突