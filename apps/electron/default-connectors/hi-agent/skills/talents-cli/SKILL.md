---
name: talents-cli
description: Talents/泰为 hiagent CLI 工具。用于查询工作区、检索知识库 RAG、列出智能体、创建会话和向智能体发送问题。触发关键词包括 talents、hiagent、泰为、工作区、知识库、RAG、智能体对话、大模型应用平台。
version: 1.0.2
---

# Talents CLI

## Usage

使用本技能时直接调用 `talents` 命令。认证信息由 WorkMate 连接器在运行时注入，不要要求用户在对话中提供 Token，也不要在输出中展示 `HTSKILL_TOKEN`。

运行环境由连接器注入：

- `HTSKILL_TOKEN`：访问 Token
- `AGENTOS_ENV`：运行环境，取值 `dev` / `sit` / `uat` / `prd`

所有命令优先添加 `--json` 获取结构化结果。若发现当前 CLI 不识别 `AGENTOS_ENV`，命令中显式追加 `--env "$AGENTOS_ENV"`。

## Supported Commands

### Workspace

```bash
talents workspace --json
talents workspace <keyword> --json
talents workspace --keyword <keyword> --json
```

### RAG

```bash
talents rag list --workspace-id <workspaceId> --json
talents rag list --workspace-id <workspaceId> --kb-name <name> --json
talents rag query --workspace-id <workspaceId> --dataset-id <datasetId> --keyword <keyword> --json
```

### Agent

```bash
talents agent list --workspace-id <workspaceId> --json
talents agent new --workspace-id <workspaceId> --app-id <appId> --json
talents agent query --workspace-id <workspaceId> --app-id <appId> --query <query> --app-conversation-id <conversationId> --json
```

智能体对话可能耗时较长。若 CLI 超时，说明当前限制，并建议用户到 hiagent Web 界面继续处理。

## Unsupported Capabilities

当前技能暂不支持：

- 创建、删除或修改 workspace 空间
- 创建、删除或修改知识库
- 创建、删除或修改 Agent 应用
- 删除对话或历史消息
- 管理 Agent 应用配置、发布、权限和角色
- 下载或导出知识库文档
- 向 Agent 上传文件
- 批量上传或批量查询

用户请求不支持能力时，明确说明当前 `talents-cli` 技能暂不支持，并给出可用替代能力或建议使用 hiagent Web 界面。

## Safety

- 不要输出 Token、npm registry 凭据或任何认证环境变量的值。
- 不要修改用户 npm registry。
- 不要自动安装、更新 CLI 或 Skill；安装和更新由 WorkMate 连接器初始化流程负责。
- 执行破坏性或写入类操作前必须确认该能力确实受支持。
