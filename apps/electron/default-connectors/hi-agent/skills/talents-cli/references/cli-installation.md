# Talents CLI Installation

Talents CLI 由 WorkMate 的泰为 hiagent 连接器初始化流程安装和校验。Agent 使用本 Skill 时不要自行安装、更新或修改 npm registry。

## Connector Managed Flow

连接器初始化会完成：

1. 检查 Node.js 和 npm
2. 安装 `@ht/talents`
3. 解析 `talents` 可执行文件路径
4. 保存运行时路径
5. 加密保存用户 Token
6. 执行 `talents workspace --json` 自检

## Manual Check

必要时可以只做只读检查：

```bash
talents -V
talents --help
talents workspace --json
```

不要在 Skill 中输出 Token，也不要要求用户在对话里提供 Token。
