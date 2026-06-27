# 泰为 hiagent CLI Connector 设计方案

> 版本：v1.0
> 日期：2026-06-24
> 状态：方案设计

***

## 一、目标

为泰为 hiagent 平台新增一个 CLI 型连接器，支持：

1. 用户在界面输入 Talents Token
2. 用户选择运行环境：`dev` / `sit` / `uat` / `prd`
3. 自动安装 `talents` CLI
4. 自动安装并启用 `talents-cli` Skill
5. Agent 调用时自动注入认证环境变量
6. 兼容 AiWorkbench 当前 `connector.json + skillDirs` 机制
7. 参考 WorkBuddy marketplace 的 `cli.json + skills/` 声明式连接器结构，便于后续通用化

***

## 二、现状与参考

### 2.1 AiWorkbench 当前连接器格式

当前内置连接器位于：

```text
apps/electron/default-connectors/
```

典型结构：

```text
default-connectors/feishu-cli/
├── connector.json
└── skill/
    └── SKILL.md
```

`connector.json` 用于：

1. 展示连接器名称、描述、分类、状态
2. 标记连接器类型：`mcp` 或 `cli`
3. 对 CLI 连接器声明 `skillDirs`
4. 被同步到工作区 `connectors/connectors.json`

当前已有 hiagent 占位连接器：

```text
apps/electron/default-connectors/hi-agent/connector.json
```

现状为 `coming-soon`，且没有 Skill：

```json
{
  "type": "cli",
  "displayName": "泰为智能体",
  "description": "泰为智能体，用于处理办公协同任务",
  "category": "办公协同",
  "status": "coming-soon",
  "version": "1.0.2",
  "sortOrder": 3,
  "skillDirs": []
}
```

### 2.2 WorkBuddy marketplace 参考格式

Feishu marketplace connector 位于：

```text
~/.workbuddy/connectors-marketplace/connectors/feishu/
```

结构：

```text
feishu/
├── cli.json
└── skills/
    ├── lark-doc/
    ├── lark-im/
    └── ...
```

`cli.json` 声明：

1. runtime 要求
2. init 安装命令
3. versionCheck 版本检查命令
4. auth 认证流程
5. status 状态检查命令
6. unAuth 退出认证命令
7. skillsPath Skill 同步路径

hiagent 连接器建议参考该模型，但短期仍落到 AiWorkbench 当前 `connector.json + skillDirs` 机制上。

***

## 三、总体架构

采用“双层配置”：

1. `connector.json`：兼容 AiWorkbench 现有连接器列表、启用状态和 Skill 注入
2. `cli.json`：声明 CLI 安装、版本检查、用户输入字段、状态检查和运行时环境

推荐目录：

```text
apps/electron/default-connectors/hi-agent/
├── connector.json
├── cli.json
└── skills/
    └── talents-cli/
        ├── SKILL.md
        ├── agents/
        │   └── openai.yaml
        └── references/
            ├── cli-reference.md
            ├── cli-installation.md
            └── cli-troubleshooting.md
```

工作区同步后：

```text
~/.workmate/agent-workspaces/{slug}/connectors/hi-agent/
├── connector.json
├── cli.json
├── secrets.json
├── runtime.json
└── skills/
    └── talents-cli/
        └── SKILL.md
```

`secrets.json` 保存用户输入数据，敏感字段必须加密；`runtime.json` 保存初始化产物，例如已解析出的 `talents` 可执行文件全路径和 npm bin 目录。

***

## 四、connector.json 设计

`connector.json` 用于兼容当前 AiWorkbench 连接器体系：

```json
{
  "type": "cli",
  "displayName": "泰为 hiagent",
  "description": "泰为 hiagent 大模型应用平台，支持工作区查询、知识库召回和智能体对话",
  "category": "办公协同",
  "status": "available",
  "version": "1.0.2",
  "sortOrder": 3,
  "skillDirs": ["skills/talents-cli"]
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `type` | CLI 连接器，运行时通过 Skill 调用本地命令 |
| `displayName` | UI 展示名 |
| `status` | 改为 `available` 后在连接器列表中可配置 |
| `version` | 预置连接器同步和升级判断使用 |
| `skillDirs` | Agent 运行时额外加载的 Skill 目录 |

***

## 五、cli.json 设计

`cli.json` 描述 hiagent CLI 的安装和认证方式。

```json
{
  "runtime": {
    "type": "node",
    "version": ">=20"
  },
  "init": {
    "darwin": "npm install -g @ht/talents-cli",
    "linux": "npm install -g @ht/talents-cli",
    "win32": "npm install -g @ht/talents-cli"
  },
  "versionCheck": {
    "command": {
      "darwin": "talents -V",
      "linux": "talents -V",
      "win32": "talents.cmd -V"
    },
    "minVersion": "1.0.0"
  },
  "userProvidedData": [
    {
      "name": "HTSKILL_TOKEN",
      "label": "Talents Token",
      "type": "password",
      "required": true
    },
    {
      "name": "AGENTOS_ENV",
      "label": "环境",
      "type": "select",
      "default": "uat",
      "options": ["dev", "sit", "uat", "prd"],
      "required": true
    }
  ],
  "status": {
    "darwin": "talents workspace --json",
    "linux": "talents workspace --json",
    "win32": "talents.cmd workspace --json"
  },
  "env": {
    "HTSKILL_TOKEN": "{{HTSKILL_TOKEN}}",
    "AGENTOS_ENV": "{{AGENTOS_ENV}}"
  }
}
```

### 5.1 runtime

hiagent CLI 基于 Node.js，要求：

```json
{
  "type": "node",
  "version": ">=20"
}
```

初始化器需要检查：

```bash
node -v
npm -v
```

### 5.2 init

安装命令：

```bash
npm install -g @ht/talents-cli
```

注意：talents 相关文档中曾出现 `@ht/talents` 和 `@ht/talents-cli` 两种包名。安装文档和排障文档均指向 `@ht/talents-cli`，本方案统一使用 `@ht/talents-cli`。

安装完成后必须解析 `talents` 的可执行文件全路径：

1. macOS / Linux 优先执行 `which talents`
2. Windows 优先执行 `where talents.cmd`
3. 若当前 shell PATH 找不到，则使用 `npm bin -g` 或 `npm prefix -g` 推导全局 bin 目录
4. 将解析结果写入 `runtime.json`

示例：

```json
{
  "commandPath": "/Users/xxx/.nvm/versions/node/v20.x/bin/talents",
  "binDir": "/Users/xxx/.nvm/versions/node/v20.x/bin",
  "packageName": "@ht/talents-cli",
  "packageVersion": "1.0.2"
}
```

后续初始化自检和 Agent 运行时优先使用 `runtime.json.commandPath`，并把 `runtime.json.binDir` 追加到 `PATH`。不能只依赖命令名 `talents`，否则 nvm、fnm、volta、Windows npm 全局目录等场景下子进程可能找不到 CLI。

### 5.3 userProvidedData

用于声明 UI 需要用户填写的字段：

1. `HTSKILL_TOKEN`：Talents Token，密码输入框
2. `AGENTOS_ENV`：运行环境，下拉选择，默认 `uat`

### 5.4 env 模板解析

`cli.json.env` 是运行时 env 声明，不直接写入子进程。初始化器和运行时都必须使用同一个解析器：

1. 只允许解析 `{{FIELD_NAME}}` 形式的完整占位符
2. `FIELD_NAME` 必须存在于 `userProvidedData`
3. `type === "password"` 的字段写入 `secrets.json` 时必须加密
4. 运行时读取 `secrets.json` 后先解密，再按 `cli.json.env` 生成子进程 env
5. 若模板引用未知字段，初始化和自检直接失败
6. 不允许把未解析的 `{{...}}` 传给 Agent 子进程

允许注入的环境变量 key 由 `Object.keys(cliJson.env)` 派生，不使用全局硬编码白名单。实现上可以再加一层保留字段拒绝列表，例如 `PATH`、`HOME`、`SHELL`、`NODE_OPTIONS`、`ELECTRON_RUN_AS_NODE`、`ANTHROPIC_*`，避免连接器覆盖宿主运行环境和模型认证环境。

### 5.5 status

状态检查命令：

```bash
talents workspace --json
```

执行时必须注入：

```text
HTSKILL_TOKEN=xxx
AGENTOS_ENV=uat
```

注意：`AGENTOS_ENV` 是否被 `talents` CLI 直接识别，需要在实现阶段用真实 CLI 自检确认。如果 CLI 只支持参数而不读取该环境变量，则 status 和 Skill 命令必须显式追加 `--env {{AGENTOS_ENV}}`，运行时仍可保留 `AGENTOS_ENV` 作为 Skill 侧上下文变量。

***

## 六、认证与密钥存储

### 6.1 用户输入

前端弹窗提供：

1. Token 输入框
2. 环境选择器
3. 开始连接按钮
4. 初始化步骤展示

Token 输入框使用 password 类型，不在 UI 中明文展示。

### 6.2 本地保存

保存路径：

```text
~/.workmate/agent-workspaces/{workspaceSlug}/connectors/hi-agent/secrets.json
```

内容：

```json
{
  "version": 1,
  "encrypted": true,
  "data": {
    "HTSKILL_TOKEN": {
      "encrypted": true,
      "value": "base64-safeStorage-ciphertext"
    },
    "AGENTOS_ENV": {
      "encrypted": false,
      "value": "uat"
    }
  }
}
```

敏感字段必须复用 Electron `safeStorage`，与渠道 API Key、飞书、钉钉、企微、SkillHub 等现有配置保持同一安全基线：

```ts
const encrypted = safeStorage.encryptString(token).toString('base64')
const plain = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
```

判定规则：

1. `userProvidedData.type === "password"` 的字段必须加密
2. 非敏感配置，例如 `AGENTOS_ENV`，可以明文保存
3. 若 `safeStorage.isEncryptionAvailable()` 不可用，可以沿用现有服务的降级策略，但必须记录 `encrypted: false` 并在 UI 或日志中给出降级提示
4. 任何日志和错误信息都不能输出解密后的 Token

安全要求：

1. 不写入 `connector.json`
2. 不写入 `connectors.json`
3. 不写入对话消息
4. 不在日志中输出完整 Token
5. 错误信息需要脱敏

脱敏策略：

```text
abcd********wxyz
```

或统一显示：

```text
已配置
```

***

## 七、环境区分

### 7.1 API 调用环境

`talents` 文档中出现过通过参数区分环境的方式：

```bash
talents workspace --env uat --token xxx
talents workspace --env prd --token xxx
```

也出现过通过环境变量区分环境的说明：

```bash
AGENTOS_ENV=uat
HTSKILL_TOKEN=xxx
talents workspace --json
```

实现前必须用当前实际安装的 `@ht/talents-cli` 验证 `AGENTOS_ENV` 是否生效。若验证失败，Skill 命令和 `status` 命令统一显式传 `--env`，不要只依赖环境变量。

### 7.2 npm 源环境

初始化安装 CLI 时，根据 `AGENTOS_ENV` 配置 npm 源。

`dev` / `sit` / `uat`：

```bash
npm config set registry http://npm.htsc
```

`prd`：

```text
registry=http://repo-prd.htsc/artifactory/api/npm/mcp-npm-prd-local/
```

生产环境配置会写入 npm 配置，UI 应明确提示：

```text
将连接生产环境，并使用生产 npm 源安装 talents CLI。
```

***

## 八、主进程初始化接口

### 8.1 当前接口

当前接口定义位于：

```text
packages/shared/src/types/agent.ts
```

当前只覆盖华泰邮箱：

```ts
export interface InitializeDefaultConnectorInput {
  connectorId: string
  emailAddress?: string
  password?: string
}
```

当前返回类型还要求 `serverName: string`：

```ts
export interface InitializeDefaultConnectorResult {
  connectorId: string
  serverName: string
  success: boolean
  steps: DefaultConnectorInitStep[]
  message: string
}
```

`serverName` 对 MCP 连接器有意义，因为初始化会写入 `mcp.json.servers[serverName]`；CLI 连接器不创建 MCP Server entry，不应被迫返回虚假的 serverName。

主进程初始化实现位于：

```text
apps/electron/src/main/lib/default-connector-initializer.ts
```

当前只支持：

```ts
if (input.connectorId !== 'huatai-email') {
  throw new Error(`暂不支持初始化连接器: ${input.connectorId}`)
}
```

### 8.2 扩展接口

建议改为：

```ts
export interface InitializeDefaultConnectorInput {
  connectorId: string

  // huatai-email
  emailAddress?: string
  password?: string

  // generic cli connector, including hi-agent
  userProvidedData?: Record<string, string>
}

export interface InitializeDefaultConnectorResult {
  connectorId: string
  serverName?: string
  success: boolean
  steps: DefaultConnectorInitStep[]
  message: string
}
```

前端展示需要按连接器类型处理：`type === "mcp"` 可展示 `serverName`，`type === "cli"` 展示 `connectorId` 或 `displayName`。

前端 hiagent 调用：

```ts
await window.electronAPI.initializeDefaultConnector(workspaceSlug, {
  connectorId: 'hi-agent',
  userProvidedData: {
    HTSKILL_TOKEN: token,
    AGENTOS_ENV: env,
  },
})
```

### 8.3 初始化分发

建议将主入口改为分发模式：

```ts
export async function initializeDefaultConnector(
  workspaceSlug: string,
  input: InitializeDefaultConnectorInput,
  deps: InitializerDeps = {},
): Promise<InitializeDefaultConnectorResult> {
  switch (input.connectorId) {
    case 'huatai-email':
      return initializeHuataiEmailConnector(workspaceSlug, input, deps)
    case 'hi-agent':
      return initializeCliConnector(workspaceSlug, input, deps)
    default:
      throw new Error(`暂不支持初始化连接器: ${input.connectorId}`)
  }
}
```

`initializeHuataiEmailConnector` 保持原行为。

`initializeCliConnector` 读取连接器目录下的 `cli.json`，执行通用 CLI 初始化。

***

## 九、初始化步骤

建议把 Step 类型从具体运行时中解耦。当前 `check-python` 对华泰邮箱可用，但对 Node CLI 连接器不合适。推荐改为通用步骤：

```ts
export type DefaultConnectorInitStepId =
  | 'check-runtime'
  | 'check-package'
  | 'install-package'
  | 'install-skill'
  | 'write-config'
  | 'self-check'
```

hiagent 步骤：

```ts
[
  { id: 'check-runtime', label: '检查 Node/npm 环境', status: 'pending' },
  { id: 'check-package', label: '检查 talents CLI', status: 'pending' },
  { id: 'install-package', label: '安装 talents CLI', status: 'pending' },
  { id: 'install-skill', label: '启用 talents Skill', status: 'pending' },
  { id: 'write-config', label: '保存认证配置', status: 'pending' },
  { id: 'self-check', label: '自检连接', status: 'pending' }
]
```

初始化流程：

1. 读取 `cli.json`
2. 校验 `userProvidedData`
3. 检查 Node/npm
4. 根据环境配置 npm registry
5. 检查 `talents -V`
6. 缺失或版本不足时执行 `init`
7. 再次执行 `versionCheck`
8. 解析 `talents` 可执行文件全路径并写入 `runtime.json`
9. 加密写入 `secrets.json`
10. 启用 `connectors.json` 中的 `hi-agent`
11. 解析 `cli.json.env` 并注入 env 执行 `status` 自检

***

## 十、运行时环境注入

当前 Agent 运行时已经支持 CLI connector 的 `skillDirs` 注入，但没有读取 `secrets.json` 或 `cli.json.env`。这不是可选增强，而是 hiagent CLI 连接器的硬依赖；否则 Agent 调用 `talents` 时拿不到 Token 和环境信息。

必须修改：

```text
apps/electron/src/main/lib/agent-orchestrator.ts
```

可选修改：

```text
apps/electron/src/main/lib/orchestrator/sdk-env.ts
```

实现方式可以二选一：

1. 扩展 `buildSdkEnv()` 的输入，让它接收 `workspaceSlug` 后合并 CLI connector env
2. 保持 `buildSdkEnv()` 只负责模型 SDK env，在 `agent-orchestrator.ts` 调用后追加 `collectCliConnectorEnv(workspaceSlug)`

建议采用第 2 种，边界更清晰：`buildSdkEnv()` 继续只处理模型、代理和 shell 环境，连接器 env 在编排层合并。无论采用哪种方式，都必须在创建 Agent SDK query options 前把连接器 env 合并进 `sdkEnv`，否则 `talents` 子进程收不到认证变量。

逻辑：

1. 遍历 enabled connector
2. 找出 `type === 'cli'`
3. 读取：

```text
connectors/{connectorId}/secrets.json
connectors/{connectorId}/cli.json
connectors/{connectorId}/runtime.json
```

4. 解密 `secrets.json`
5. 按 `cli.json.env` 解析模板
6. 只注入 `cli.json.env` 显式声明的 key
7. 将 `runtime.json.binDir` 追加到 `PATH`

示例：

```ts
{
  HTSKILL_TOKEN: resolvedEnv.HTSKILL_TOKEN,
  AGENTOS_ENV: resolvedEnv.AGENTOS_ENV,
  PATH: `${runtime.binDir}:${sdkEnv.PATH ?? process.env.PATH ?? ''}`
}
```

不要无条件注入任意 `secrets.json` 字段，避免用户写入危险环境变量；但也不要把 `HTSKILL_TOKEN` / `AGENTOS_ENV` 写成全局硬编码白名单，否则新增 CLI 连接器时每次都要改主进程代码。

***

## 十一、前端设计

新增文件：

```text
apps/electron/src/renderer/components/agent-skills/HiAgentConnectorDialog.tsx
```

页面元素：

1. 标题：连接泰为 hiagent
2. 说明：连接后 Agent 可查询工作区、检索知识库、与 hiagent 智能体对话
3. 环境选择器：`uat` 默认
4. Token 输入框
5. 开始连接按钮
6. 初始化步骤列表
7. 已连接状态展示
8. 重新绑定按钮

挂载位置：

```text
apps/electron/src/renderer/components/agent-skills/AgentSkillsView.tsx
```

示例：

```tsx
<HiAgentConnectorDialog
  open={activeDefaultConnector === 'hi-agent'}
  workspaceSlug={data.workspaceSlug}
  onOpenChange={(open) => setActiveDefaultConnector(open ? 'hi-agent' : null)}
  onSaved={() => {
    setActiveDefaultConnector(null)
    void loadConnectorEnabledMap()
  }}
/>
```

***

## 十二、Skill 设计

Skill 来源：

```text
/Users/gt921/Workspace/aiworkspace/talents-cli_1.0.2
```

目标位置：

```text
apps/electron/default-connectors/hi-agent/skills/talents-cli/
```

需要修正：

1. 包名统一为 `@ht/talents-cli`
2. 删除或澄清“文件上传”能力
3. 不要求每次 Skill 调用时配置 npm registry
4. 优先使用 `HTSKILL_TOKEN`
5. 不在响应中展示 Token
6. 版本统一为 `1.0.2`

Skill 调用示例：

```bash
talents workspace --json
talents rag list --workspace-id <workspaceId> --json
talents rag query --workspace-id <workspaceId> --dataset-id <datasetId> --keyword <keyword>
talents agent list --workspace-id <workspaceId>
talents agent new --workspace-id <workspaceId> --app-id <appId>
talents agent query --workspace-id <workspaceId> --app-id <appId> --query <query> --app-conversation-id <conversationId>
```

认证由运行时 env 注入：

```text
HTSKILL_TOKEN=xxx
AGENTOS_ENV=uat
```

***

## 十三、错误处理

### 13.1 Node/npm 不存在

提示：

```text
未检测到 Node.js 或 npm，请先安装 Node.js 20 及以上版本。
```

### 13.2 npm 源不可达

提示：

```text
无法访问 npm 源，请确认当前网络和环境选择是否正确。
```

### 13.3 CLI 安装失败

保留 npm 错误摘要，但过滤敏感信息。

### 13.4 Token 无效

自检 `talents workspace --json` 失败时提示：

```text
Talents Token 校验失败，请确认 Token 是否正确或已过期。
```

### 13.5 prd 环境误选

prd 初始化前增加确认提示，不应静默写生产 registry。

***

## 十四、改动文件清单

必须新增或修改：

```text
apps/electron/default-connectors/hi-agent/connector.json
apps/electron/default-connectors/hi-agent/cli.json
apps/electron/default-connectors/hi-agent/skills/talents-cli/**
packages/shared/src/types/agent.ts
apps/electron/src/main/lib/default-connector-initializer.ts
apps/electron/src/main/lib/agent-orchestrator.ts
apps/electron/src/renderer/components/agent-skills/HiAgentConnectorDialog.tsx
apps/electron/src/renderer/components/agent-skills/AgentSkillsView.tsx
```

可选修改：

```text
apps/electron/src/main/lib/orchestrator/sdk-env.ts
```

只有选择在 `buildSdkEnv()` 内部合并连接器 env 时才需要修改该文件；若在 `agent-orchestrator.ts` 中对 `sdkEnv` 做后置合并，则不需要改。

***

## 十五、测试建议

### 15.1 单元测试

覆盖：

1. `hi-agent` connector 能从 `connector.json` 读取并展示
2. `cli.json` 解析成功
3. Token 缺失时初始化失败
4. Node/npm 缺失时初始化失败
5. npm 安装失败时返回错误步骤
6. 安装成功后解析 `talents` 可执行文件全路径并写入 `runtime.json`
7. 安装成功后加密写入 `secrets.json`
8. 安装成功后启用 `connectors.json`
9. 自检失败时不标记为成功
10. 日志和返回 message 不包含完整 Token
11. `cli.json.env` 引用未知字段时初始化失败
12. 运行时只注入 `cli.json.env` 显式声明的 key

### 15.2 集成验证

手工验证：

1. 打开连接器列表，看到“泰为 hiagent”
2. 点击配置，输入 Token 和环境
3. 初始化成功后 connector enabled
4. Agent 能加载 `talents-cli` Skill
5. 询问“查询泰为空间”，Agent 能调用：

```bash
talents workspace --json
```

6. 切换 `uat` / `prd` 后环境变量或显式 `--env` 参数正确

***

## 十六、实施顺序

建议分 4 个阶段：

### 阶段 1：文件与元数据

1. 更新 `hi-agent/connector.json`
2. 新增 `hi-agent/cli.json`
3. 迁移 talents Skill 到 `hi-agent/skills/talents-cli`

### 阶段 2：初始化器

1. 扩展 `InitializeDefaultConnectorInput`
2. 将 `default-connector-initializer.ts` 改为分发模式
3. 新增 `initializeCliConnector`
4. 支持读取 `cli.json`
5. 支持写入加密 `secrets.json`
6. 支持写入 `runtime.json`

### 阶段 3：前端

1. 新增 `HiAgentConnectorDialog`
2. 在 `AgentSkillsView` 中挂载
3. 展示初始化步骤和错误信息

### 阶段 4：运行时注入与验收

1. Agent 运行时读取 enabled CLI connector 的 `cli.json`、`secrets.json`、`runtime.json`
2. 解密密钥并按 `cli.json.env` 派生允许注入的环境变量
3. 将 `runtime.json.binDir` 合并到 `PATH`
4. 验证 Skill 能正常调用 `talents`

***

## 十七、验收标准

1. 连接器列表显示“泰为 hiagent”，状态为可连接
2. 用户可输入 Token 并选择环境
3. 初始化器可自动安装 `@ht/talents-cli`
4. 初始化成功后写入本地加密 `secrets.json` 和 `runtime.json`
5. 初始化成功后启用 `hi-agent`
6. Agent 运行时自动加载 `talents-cli` Skill
7. Agent 调用 `talents` 时无需用户再次输入 Token
8. `uat` 和 `prd` 能正确区分
9. 日志、错误信息、对话内容不泄漏完整 Token
10. 安装失败、认证失败、环境错误均有明确提示
11. `AGENTOS_ENV` 环境变量若经实测不可用，则命令路径必须显式传 `--env`

***

## 十八、后续演进

当前方案只对 `hi-agent` 落地通用 CLI 初始化器。后续可以继续演进为完整 marketplace connector loader：

1. 所有 CLI 连接器统一读取 `cli.json`
2. 支持 `auth` 命令式认证
3. 支持 `userProvidedData` 表单自动渲染
4. 支持 `statusMatch` / `statusMatchJson`
5. 支持 `unAuth`
6. 支持 marketplace connector 安装、升级和同步

这样 Feishu、企微、钉钉、CNB、hiagent 等 CLI 连接器都可以收敛到同一套声明式机制。
