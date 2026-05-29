# 批量创建 STORY

**触发词：** `批量创建Story`、`批量创建任务`、`batch-create-story`、`从CSV创建Story`

**职责：** AI帮助用户从CSV文件批量创建STORY（任务），并将生成的story编号回写到CSV文件中。

## 必要信息（从用户描述中提取）

根据DPMP接口文档和CSV模板，批量创建STORY需要以下信息：

### 必需信息
- **CSV文件路径** - 包含STORY清单的CSV文件
- **项目空间key** - 所有STORY所属的项目空间

### 可选信息
- **优先级** - 所有STORY的优先级（默认为"高(一般)"）
- **Mock模式** - 是否使用Mock模式测试（不实际调用API）
- **Dry-run模式** - 是否只检查CSV格式不实际创建

## CSV文件格式要求

CSV文件必须包含以下必需字段：
- `story名称` - STORY名称
- `story描述` - 详细描述
- `经办人工号` - 经办人AD账号
- `创建人工号` - 创建人/报告人AD账号

可选字段：
- `所属完整迭代名` - 迭代名称
- `所属需求编号` - 所属REQ编号
- `所属需求名称` - 所属需求名称（仅参考）
- `发布版本` - 发布版本（仅参考）
- `经办人姓名` - 经办人姓名（仅参考）
- `计划开发完成日期` - 格式：yyyy-mm-dd
- `计划测试完成日期` - 格式：yyyy-mm-dd
- `计划完成日期` - 格式：yyyy-mm-dd
- `story_key` - 留空，创建成功后回填生成的story编号

## AI 执行流程

### Phase 0: 配置检查（首次或按需）

在用户首次使用时，先调用 `check-config` 检测配置状态：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py check-config
```

根据输出处理：
- `config_status: "ready"` → 直接进入 Phase A
- `config_status: "incomplete"` → 向用户说明哪些配置缺失，按 SKILL.md 中的配置缺失处理流程引导用户补充

### Phase A: 准备CSV文件并确认

1. **确认用户有CSV文件**：
   ```
   您是否有包含STORY清单的CSV文件？CSV文件需要包含以下必需字段：
   - story名称
   - story描述  
   - 经办人工号
   - 创建人工号
   
   您可以使用参考模板：reference/story_batch_template.csv
   ```

2. **确认项目空间**：
   调用 `list-keys` 获取可用项目空间key列表：
   ```bash
   python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py list-keys
   ```
   
   从输出中解析项目空间key列表，按以下规则处理：
   - **0个key**：提示用户提供项目空间key
   - **1个key**：自动使用该key，并告知用户
   - **多个key**：列出所有可用key，要求用户选择：
   
   ```
   检测到以下可用项目空间，请选择一个：
     1. TEST0408
     2. TEST0409
     3. PROJ01
   请输入编号或key名称。
   ```

3. **确认其他参数**：
   ```
   请确认以下信息：
   - 优先级（默认为"高(一般)"）：[用户输入或使用默认值]
   - 是否使用Mock模式测试？[是/否]
   - 是否只检查CSV格式不实际创建？[是/否]
   ```

### Phase B: 执行批量创建

用户确认后执行批量创建命令：

#### 1. 只检查CSV格式（Dry-run模式）
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py batch-create-story \
    --csv-file "/path/to/your/stories.csv" \
    --project-key "TEST0408" \
    --dry-run
```

#### 2. Mock模式测试
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py batch-create-story \
    --csv-file "/path/to/your/stories.csv" \
    --project-key "TEST0408" \
    --mock
```

#### 3. 实际创建
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py batch-create-story \
    --csv-file "/path/to/your/stories.csv" \
    --project-key "TEST0408" \
    --priority "高(一般)"
```

### Phase C: 完成确认

```
✅ 批量创建完成！

📊 创建结果统计：
- 总记录数: 10
- 成功数: 10  
- 失败数: 0

💾 结果文件：
生成的story编号已回写到新文件：/path/to/your/stories_processed_20240525_143022.csv

📋 创建的STORY列表：
1. 客户标签管理 → STORY-1001
2. 用户登录优化 → STORY-1002
3. 支付接口升级 → STORY-1003
...
```

## 环境变量配置

所有配置通过 `check-config` 动态检测，不要手动读取 `.env`。配置缺失时按 Phase 0 的流程处理。
参考文件：`.env.example`

**注意**：所有命令在执行前都会自动校验必需的配置项，如果缺失会给出明确的错误提示。

## 参数提取指导

对于复杂的自然语言描述，使用参数提取指导：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py extract-params \
    --text "从stories.csv文件批量创建STORY，项目空间是TEST0408，优先级为中等"
```

## 常见用例

1. **从Excel导出批量创建**：
   ```
   用户：我有从Excel导出的stories.csv，需要批量创建到TEST0408项目
   ```

2. **为多个需求创建任务**：
   ```
   用户：为PRODU-1079、PRODU-1080、FINANCE-1001这三个需求批量创建开发任务
   ```

3. **测试CSV格式**：
   ```
   用户：帮我检查一下这个CSV文件格式是否正确，但不实际创建
   ```

4. **模拟创建测试**：
   ```
   用户：用Mock模式测试一下批量创建，看看流程是否正常
   ```

## 错误处理

1. **CSV文件不存在**：提示用户提供正确的文件路径
2. **CSV格式错误**：显示具体错误信息，建议使用dry-run模式检查
3. **必需字段缺失**：列出缺失的字段，提示用户补充
4. **API调用失败**：显示详细的错误信息，建议使用Mock模式测试
5. **部分成功**：显示成功和失败的记录，提供失败原因

## 最佳实践

1. **先测试后创建**：建议先使用dry-run模式检查CSV格式，再用Mock模式测试流程
2. **备份原文件**：批量创建会修改原CSV文件（添加story_key列），建议先备份
3. **分批处理**：如果STORY数量很多，建议分批处理（如每次50-100个）
4. **记录结果**：保存创建结果文件，便于后续跟踪和管理