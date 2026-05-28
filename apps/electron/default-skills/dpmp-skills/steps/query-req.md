# 查询 REQ（需求）

**触发词：** `查询需求`、`查看需求`、`查找需求`、`query-req`、`搜索需求`

**职责：** AI 从用户的查询请求中提取查询条件，调用 DPMP API 查询 REQ（需求）信息。

## 查询方式

### 1. 精确查询（按 REQ 编号）
- REQ编号（code）：如 "PRODU-1079"

### 2. 条件查询（按多个条件）
- REQ编号（code）
- REQ名称（name）
- 需求提出人工号（demandOriginator）
- 报告人工号（reporter）
- 经办人工号（assignee）
- 迭代名称（iterationname）
- 版本名称（versionname）

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

### Phase A: 确定查询类型并提取条件

分析用户查询意图，确定是精确查询还是条件查询：

1. **精确查询**：当用户明确指定 REQ 编号时
   ```
   用户：查询PRODU-1079的需求详情
   提取：code = "PRODU-1079"
   ```

2. **条件查询**：当用户按其他条件查询时
   ```
   用户：查找经办人是021343的所有需求
   提取：assignee = "021343"
   ```

使用参数提取指导获取结构化查询条件：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py extract-params \
    --text "用户输入的查询描述"
```

### Phase B: 执行查询

根据查询类型执行相应的命令：

#### 精确查询：
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py query-req \
    --code "PRODU-1079"
```

#### 条件查询：
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py query-req \
    --assignee "021343" \
    --iteration "2024-Q2-Sprint3" \
    --format "table"
```

**输出格式选项**：
- `--format json`：JSON 格式（默认）
- `--format table`：表格格式（适合显示多个结果）
- `--format simple`：简化格式

**Mock 模式（测试用）：**
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py query-req \
    --code "TEST" \
    --mock
```

### Phase C: 展示查询结果

#### 精确查询结果（单个 REQ）：
```
📋 REQ 详情：

编号：PRODU-1079
名称：客户管理系统
优先级：高(一般)
状态：开发中
产品空间：PRODU
需求提出人：012950
报告人：012950
经办人：012950
创建时间：2024-05-15
描述：需要支持客户标签管理功能
```

#### 条件查询结果（多个 REQ）：
```
📋 查询结果（共 3 个 REQ）：

| 编号        | 名称           | 优先级   | 状态   | 经办人 | 创建时间   |
|-------------|----------------|----------|--------|--------|------------|
| PRODU-1079  | 客户管理系统   | 高(一般) | 开发中 | 012950 | 2024-05-15 |
| PRODU-1080  | 支付优化       | 中(轻微) | 待分析 | 021343 | 2024-05-16 |
| PRODU-1081  | 用户登录       | 紧急(致命) | 测试中 | 012950 | 2024-05-17 |
```

## 环境变量配置

所有配置通过 `check-config` 动态检测，不要手动读取 `.env`。配置缺失时按 Phase 0 的流程处理。
参考文件：`.env.example`

## 参数提取指导

对于复杂的查询描述，使用参数提取指导：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/dpmp-skills/run.py extract-params \
    --text "搜索名称包含'客户管理'的需求"
```

这将返回结构化的提取指导，帮助 AI 准确提取查询条件。

## 常见用例

1. **精确查询详情**：
   ```
   用户：查询PRODU-1079的需求详情
   ```

2. **按经办人查询**：
   ```
   用户：查找经办人是021343的所有需求
   ```

3. **按名称搜索**：
   ```
   用户：搜索名称包含'客户管理'的需求
   ```

4. **按迭代查询**：
   ```
   用户：查看迭代'2024-Q2-Sprint3'下的所有需求
   ```

5. **组合条件查询**：
   ```
   用户：查找经办人是012950且状态为开发中的需求
   ```

## 错误处理

1. **REQ 不存在**：精确查询时，如果 REQ 不存在会返回空结果
2. **认证失败**：检查 `DPMP_OPEN_API_TOKEN` 和 `DPMP_APP_ID` 是否正确配置
3. **查询条件错误**：检查查询条件的格式和值是否合法
4. **网络错误**：建议使用 Mock 模式测试，或检查网络连接
5. **结果过多**：条件查询可能返回大量结果，建议添加更多限制条件

## 性能优化

1. **缓存机制**：查询结果会被缓存，重复查询相同条件会更快
2. **分页查询**：大量结果时，DPMP API 支持分页查询
3. **字段选择**：可以指定只返回需要的字段，减少数据传输
4. **异步查询**：对于复杂查询，可以考虑异步执行

## 注意事项

1. **权限控制**：用户只能查询自己有权限访问的 REQ
2. **数据时效性**：查询结果是实时数据，反映当前状态
3. **查询限制**：避免过于宽泛的查询条件，可能导致性能问题
4. **结果格式**：根据结果数量选择合适的展示格式
5. **敏感信息**：注意保护敏感信息，如内部编号等