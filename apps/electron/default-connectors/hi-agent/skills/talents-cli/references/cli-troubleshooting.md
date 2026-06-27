# Talents CLI Troubleshooting

## Command Not Found

若 `talents` 不可用，提示用户回到连接器配置页重新初始化泰为 hiagent 连接器。不要在 Skill 中自行安装或修改 npm registry。

## Authentication Failed

若命令返回认证失败：

1. 不要要求用户在对话中发送 Token
2. 提示用户在连接器配置页重新输入 Talents Token
3. 不要输出 `HTSKILL_TOKEN` 的值

## Environment Mismatch

若查询结果疑似环境不对，先检查命令是否使用了连接器注入的 `AGENTOS_ENV`。如果当前 CLI 不识别该环境变量，可以在命令中显式追加：

```bash
--env "$AGENTOS_ENV"
```

## Timeout

智能体对话可能耗时较长。若 CLI 超时，说明当前限制，并建议用户到 hiagent Web 界面继续处理。
