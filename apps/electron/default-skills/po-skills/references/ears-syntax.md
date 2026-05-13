# EARS 语法参考

EARS（Easy Approach to Requirements Syntax）用于将需求中的系统行为描述改写为结构化、可审查的句式。

## 基本模式

### 1. Ubiquitous（普适型）

**适用场景：** 无条件、始终成立的系统行为。

**模板：**
```text
THE <system name> SHALL <system response>
```

**输出格式：**
```text
[Ubiquitous] The System shall <系统响应>。
```

**示例：**
```text
[Ubiquitous] The System shall 在所有页面顶部显示导航栏。
```

### 2. Event-driven（事件驱动型）

**适用场景：** 由特定触发事件引发的系统行为。

**模板：**
```text
WHEN <trigger> THE <system name> SHALL <system response>
```

**输出格式：**
```text
[Event-driven] When <触发事件>，The System shall <系统响应>。
```

**示例：**
```text
[Event-driven] When 用户点击“提交”按钮，The System shall 校验表单并显示校验结果。
```

### 3. State-driven（状态驱动型）

**适用场景：** 系统处于特定状态时持续执行的行为。

**模板：**
```text
WHILE <system state> THE <system name> SHALL <system response>
```

**输出格式：**
```text
[State-driven] While <系统状态>，The System shall <系统响应>。
```

**示例：**
```text
[State-driven] While 用户已登录，The System shall 在页面右上角显示用户头像和昵称。
```

### 4. Unwanted Behavior（非期望事件型）

**适用场景：** 处理异常、错误或不期望发生的情况。

**模板：**
```text
IF <condition> THEN THE <system name> SHALL <system response>
```

**输出格式：**
```text
[Unwanted Behavior] If <异常条件>，The System shall <系统响应>。
```

**示例：**
```text
[Unwanted Behavior] If 网络请求超时，The System shall 显示“网络异常，请稍后重试”提示，并提供重试按钮。
```

### 5. Optional（可选功能型）

**适用场景：** 仅在特定范围、角色或配置下适用的行为。

**模板：**
```text
WHERE <feature or condition> THE <system name> SHALL <system response>
```

**输出格式：**
```text
[Optional] Where <适用范围>，The System shall <系统响应>。
```

**示例：**
```text
[Optional] Where 当前用户具备审批权限，The System shall 显示“审批通过”按钮。
```

### 6. Complex（复合型，可选）

**适用场景：** 同时依赖多个条件的复杂行为。

**模板：**
```text
WHILE <system state> WHEN <trigger> THE <system name> SHALL <system response>
```

**输出格式：**
```text
[Event-driven, State-driven] While <系统状态>，When <触发事件>，The System shall <系统响应>。
```

**示例：**
```text
[Event-driven, State-driven] While 用户处于编辑模式，When 用户按下 Ctrl+S，The System shall 自动保存当前内容并显示“已保存”提示。
```

## 使用约束

- 每条 EARS 语句独立成行，以 `[模式标签]` 开头。
- 优先忠实表达原文语义，不要补造业务规则。
- 原文语义不清晰时，不强行转换，改为标注待确认。
- 同一段原文可拆成多条 EARS 语句，但每条只表达一个清晰行为。
