# CodeBuddy / WorkBuddy 连接器实现机制说明

# 一、结论摘要

CodeBuddy / WorkBuddy 的连接器不是把每个外部系统硬编码进主程序，而是采用“连接器市场包 \+ 用户启用状态 \+ MCP/CLI/Skill 适配 \+ 本地代理聚合”的配置驱动机制。

从当前工作目录观察到的实现可以概括为：

```text
connectors-marketplace/ 连接器市场原始包
  -> connectors/<account>/ 用户级连接状态与 MCP 汇总配置
  -> connectors/skills/connector-<id>/ 启用后安装出来的可用 Skill
  -> .mcp.json 本地 connector-proxy 暴露给 Agent
  -> ConnectorService 负责安装、认证、保活和状态同步
```

其中，MCP 型连接器通过 MCP 协议向 Agent 暴露结构化工具；CLI 型连接器通过本地命令行工具完成实际操作，Skill 负责告诉 Agent 什么时候调用、调用什么命令、参数和错误如何处理。

# 二、当前目录中的核心位置

|路径|作用|说明|
|---|---|---|
|connectors\-marketplace/|连接器市场缓存|保存官方连接器包、索引、图标、MCP/CLI 配置、Skill 原始内容。|
|connectors\-marketplace/\.codebuddy\-connector/connectors\.json|市场索引|描述有哪些连接器、展示名称、类型、source、示例和可见范围。|
|connectors\-marketplace/connectors/\<id\>/|单个连接器包|每个连接器的实际定义目录，可能包含 mcp\.json、cli\.json、token\-schema\.json、skills/、connector\-meta\.json、icon 等。|
|connectors/\<accountIdentity\>/connector\-states\.json|用户启用状态|记录当前账号启用了哪些连接器、曾经连接过哪些、header/env 覆盖、禁用工具、安全迁移状态等。|
|connectors/\<accountIdentity\>/mcp\.json|用户级 MCP 汇总|把 marketplace 中的 MCP 型连接器转成统一的 connector:\<id\> MCP server 配置，并按启用状态设置 disabled。|
|connectors/\<accountIdentity\>/\.credentials\.json|连接器认证辅助数据|保存 OAuth client 信息等连接器认证辅助元数据，不是所有 token 都直接存在这里。|
|connectors/skills/connector\-\<id\>/|安装后的 Skill|连接器启用或连接成功后，从 marketplace 复制/安装出的可用 Skill。|
|\.mcp\.json|Agent 可见 MCP 入口|当前注册的是 connector\-proxy，即本地聚合代理，而不是直接把所有 connector 暴露给 Agent。|

# 三、connectors\.json：连接器市场索引

connectors\.json 是连接器市场的总目录。它不包含真正的执行命令、MCP 地址或密钥，而是面向展示、筛选和定位连接器包。

顶层结构如下：

```json
{
  "name": "codebuddy-connectors-official",
  "description": "CodeBuddy 官方连接器配置索引",
  "owner": {
    "name": "CodeBuddy",
    "email": "codebuddy@tencent.com"
  },
  "connectors": []
}
```

当前 connectors 数组中有 39 个连接器条目。每个条目常见字段如下：

|字段|含义|
|---|---|
|id|连接器 ID，通常也是用户状态和展示中使用的唯一标识。|
|name / name\_en|中文和英文展示名称。|
|description / description\_zh / description\_en|连接器展示描述。|
|source|连接器包目录名，例如 feishu 对应 connectors\-marketplace/connectors/feishu/。|
|type|连接器类型，常见值为 mcp、cli、skill\-only。未显式声明时通常按 MCP 型理解。|
|examples\_zh / examples\_en|连接器使用示例，主要用于 UI 展示和用户引导。|
|minWorkbuddyVersion|最低 WorkBuddy 版本要求。|
|visible\_in|可见环境，例如 iOA、internal、external、selfhosted、cloudhosted。|
|auth\_mode|认证模式提示，例如 token。|
|version|连接器包版本。|

示例条目：

```json
{
  "id": "tdx-connector",
  "name": "通达信",
  "name_en": "Tongdaxin Finance",
  "description_zh": "通过通达信 MCP 查询全球股票行情数据、条件选股、研究报告、公告资讯和宏观信息。",
  "source": "tdx-connector",
  "type": "mcp",
  "examples_zh": [
    "帮我查询贵州茅台(600519)最近的研究报告"
  ]
}
```

因此，connectors\.json 可以理解为“连接器市场的商品列表”；真正怎么连接、怎么认证、怎么调用，需要进入对应 source 目录继续查看。

# 四、单个连接器目录的文件职责

单个连接器目录位于 connectors\-marketplace/connectors/\<source\>/。根据连接器类型不同，里面可能包含以下文件。

## 1\. mcp\.json

mcp\.json 描述 MCP 型连接器的真实接入方式。它通常包含 MCP server 地址、传输类型、超时时间、header、环境变量占位符、本地启动命令等。

远端 HTTP MCP 示例：

```json
{
  "mcpServers": {
    "tyc-mcp": {
      "url": "https://mcp.tianyancha.com/v1",
      "headers": {
        "Authorization": "${TIANYANCHA_API_KEY}"
      },
      "type": "streamableHttp",
      "timeout": 600000
    }
  }
}
```

常见字段：

|字段|说明|
|---|---|
|url|远端 MCP 服务地址。|
|type / transportType|传输类型，例如 streamableHttp、streamable\-http、sse、stdio、http。|
|timeout|请求或工具调用超时时间。|
|headers / staticHeaders|请求头。headers 可能包含变量占位符，staticHeaders 通常是固定透传。|
|command / args|本地 stdio MCP server 启动命令，例如 npx 某个包。|
|env / staticEnv|进程环境变量。|
|runtime|运行时要求，例如 Node 版本。|
|\_workbuddyManagedAuth|提示认证由 WorkBuddy 侧托管，例如 server\-side。|

## 2\. cli\.json

cli\.json 描述 CLI 型连接器如何安装、检查版本、登录、登出和检查状态。它不描述 CLI 的全部业务命令树，而是解决“CLI 能不能用、是否已认证”的生命周期问题。

以飞书为例：

```json
{
  "runtime": {
    "type": "node",
    "version": ">=18"
  },
  "init": {
    "darwin": "npm install -g @larksuite/cli",
    "linux": "npm install -g @larksuite/cli",
    "win32": "npm install -g @larksuite/cli"
  },
  "versionCheck": {
    "command": {
      "darwin": "lark-cli --version",
      "linux": "lark-cli --version",
      "win32": "lark-cli.cmd --version"
    },
    "minVersion": "1.0.55"
  },
  "auth": [
    {
      "command": {
        "darwin": "lark-cli config init --new --lang en"
      },
      "skipIf": {
        "darwin": "lark-cli config show"
      },
      "authWaitForExit": true,
      "authUrlDomain": "open.feishu.cn"
    },
    {
      "command": {
        "darwin": "lark-cli auth login --recommend"
      },
      "authWaitForExit": true,
      "authUrlDomain": "accounts.feishu.cn"
    }
  ],
  "status": {
    "darwin": "lark-cli auth status"
  },
  "statusMatchJson": {
    "identity": "user"
  }
}
```

常见字段：

|字段|说明|
|---|---|
|runtime|依赖运行时，例如 Node 及最低版本。|
|init|按操作系统区分的安装或升级命令。|
|versionCheck|版本检查命令和最低版本要求。|
|auth|认证命令。可以是单个命令对象，也可以是多步骤数组。|
|skipIf|认证步骤中的跳过条件；命令成功则跳过该步骤。|
|unAuth|登出或断开连接命令。|
|status|检查是否已登录或可用的命令。|
|statusMatch|用文本匹配判断登录状态。|
|statusMatchJson|用 JSON 字段匹配判断登录状态。|
|authUrlDomain|认证流程涉及的域名，用于识别或允许跳转。|
|authWaitForExit|是否等待认证命令退出。|
|authSuppressBrowser|是否抑制自动打开浏览器。|
|authDeviceFlow / authQrModal|设备码或二维码认证辅助声明。|
|userProvidedData / env|用户补充数据或环境变量。|
|\_sync|上游仓库、Skill 路径、版本来源等同步信息。|

## 3\. token\-schema\.json

token\-schema\.json 描述需要用户手动填写的认证字段，通常用于 API Key、Access Token、账号密码等。WorkBuddy 可据此生成授权配置 UI，并将字段值替换到 mcp\.json 的变量占位符中。

以天眼查为例：

```json
{
  "title": "天眼查 MCP 授权配置",
  "description": "输入天眼查 AI 智能体数据平台的 API Key，用于查询天眼查 160+ 项多维度企业数据能力。",
  "docUrl": "https://ai.tianyancha.com/guide",
  "fields": [
    {
      "key": "TIANYANCHA_API_KEY",
      "label": "API Key",
      "type": "password",
      "required": true
    }
  ]
}
```

这里的 TIANYANCHA\_API\_KEY 会与 mcp\.json 中的 $\{TIANYANCHA\_API\_KEY\} 对应。

## 4\. skills/ 或 skill/

Skill 是给 Agent 看的操作说明。对于 CLI 型连接器，Skill 尤其关键，因为 cli\.json 只负责安装和认证，不会完整描述“这个 CLI 有哪些业务指令、什么场景用什么命令、参数如何组合”。

以飞书为例，marketplace 中有 27 个飞书 Skill，包括 lark\-doc、lark\-drive、lark\-base、lark\-calendar、lark\-im、lark\-mail、lark\-sheets 等。连接成功后，这些 Skill 会安装到 connectors/skills/connector\-feishu/，成为当前 Agent 可用的连接器 Skill。

Skill 通常包含：

- 触发场景：用户提出什么需求时使用该 Skill。

- 前置条件：认证、权限、身份类型、必须读取的参考文件。

- 推荐命令：优先使用哪些 shortcut 或 CLI 子命令。

- 参数约束：必填参数、API 版本、格式要求、路径限制。

- 错误处理：权限不足、未登录、风险操作确认、更新提示。

- 安全规则：高风险写操作确认、密钥不明文输出、路径限制。

## 5\. connector\-meta\.json、icon、install 脚本等

connector\-meta\.json 和 icon 文件主要服务 UI 展示、版本和扩展元信息。部分连接器还带 install\.sh、install\.ps1、scripts/ 或 references/，用于安装、辅助操作或承载更细的说明。

# 五、连接器类型与调用路径

## 1\. MCP 型连接器

MCP 型连接器的核心是 mcp\.json。WorkBuddy 将其合并进用户级 connectors/\<account\>/mcp\.json，并以 connector:\<id\> 的名字管理。

调用链：

```text
用户启用 MCP 连接器
  -> WorkBuddy 读取 marketplace/connectors/<id>/mcp.json
  -> 写入或更新 connectors/<account>/mcp.json
  -> 本地 connector-proxy 聚合 MCP server
  -> Agent 通过 .mcp.json 连接 http://127.0.0.1:52666/mcp
  -> MCP 协议 list_tools / call_tool
  -> 远端或本地 MCP server 执行业务能力
```

MCP 的优势是工具结构清晰：每个 tool 有 name、description、inputSchema，Agent 不需要理解完整 CLI 命令树，只需调用 MCP server 声明出的工具。

## 2\. CLI 型连接器

CLI 型连接器的核心是 cli\.json \+ Skill。cli\.json 负责让 CLI 可用，Skill 负责让 Agent 会用。

调用链：

```text
用户连接 CLI 型连接器
  -> ConnectorService 读取 cli.json
  -> 检查 runtime 和 CLI 版本
  -> 必要时执行 init 安装或升级
  -> 执行 auth / status 完成认证检查
  -> 安装 marketplace 中的 skills 到 connectors/skills/connector-<id>/
  -> Agent 根据 Skill 选择具体 CLI 命令
  -> 通过 shell 执行 CLI
  -> CLI stdout/stderr 返回给 Agent 解析
```

当前飞书连接器就是这种模式。日志显示 WorkBuddy 对 feishu 执行了 CLI 安装检查、版本升级、认证状态检查，然后安装飞书 Skill 到 connectors/skills/connector\-feishu。

## 3\. skill\-only 型连接器

skill\-only 型连接器不一定注册 MCP server，也不一定有独立的 cli\.json。它主要通过 Skill、脚本和说明来指导 Agent 使用已有环境或连接器包内脚本完成任务。

# 六、用户级状态与启用机制

用户级状态位于 connectors/\<accountIdentity\>/connector\-states\.json。当前文件中记录：

```json
{
  "enabled": [
    "feishu"
  ],
  "headerOverrides": {},
  "envOverrides": {},
  "headerOverridesBearerStripped": true,
  "accountIdentityKey": "ddd20e09-ad6d-445c-b76c-26000a1eaeaa||enterprise",
  "everConnected": [
    "feishu"
  ],
  "userDisabled": [],
  "disabledToolsOverrides": {},
  "mcpSecurityMigrated": true
}
```

字段含义：

|字段|说明|
|---|---|
|enabled|当前启用的连接器列表。|
|everConnected|曾经连接成功过的连接器列表。|
|userDisabled|用户主动禁用的连接器。|
|headerOverrides|用户级请求头覆盖，用于 MCP 请求。|
|envOverrides|用户级环境变量覆盖，用于 CLI 或本地 MCP 进程。|
|disabledToolsOverrides|针对 MCP 工具级别的禁用配置。|
|accountIdentityKey|账号身份 key，用于隔离不同用户或企业身份下的连接器状态。|
|mcpSecurityMigrated|MCP 安全配置迁移标记。|

# 七、\.mcp\.json 与 connector\-proxy

当前顶层 \.mcp\.json 中只有一个 MCP server：

```json
{
  "mcpServers": {
    "connector-proxy": {
      "type": "http",
      "url": "http://127.0.0.1:52666/mcp",
      "description": "Aggregated proxy containing MCP servers: none"
    }
  }
}
```

这说明 Agent 侧不是直接连接每个连接器，而是连接本地 connector\-proxy。proxy 再根据用户启用状态聚合和转发底层 MCP server。当前 description 显示 none，是因为当前实际启用的是 CLI 型 feishu，而没有启用 MCP 型连接器。

这种设计的好处是：

- Agent 只需要知道一个稳定入口。

- WorkBuddy 可以集中做认证、状态、禁用工具、header/env 注入和安全控制。

- 连接器启用或禁用不需要 Agent 直接改多个 MCP server 配置。

# 八、connectors\-marketplace 中的 Skill 与 WorkBuddy Skill 的关系

connectors\-marketplace/connectors/\<id\>/skills 是连接器包里的原始 Skill；connectors/skills/connector\-\<id\>/ 是连接器连接或启用后安装出的可用 Skill。两者格式相同，通常内容也相同，但处在不同层级。

```text
connectors-marketplace/connectors/.../skills/
= 连接器市场里的 Skill 原始包、模板或缓存

connectors/skills/connector-xxx/
= 某个连接器启用或连接后，WorkBuddy 安装出来的可用 Skill

当前会话中的 lark-* skills
= WorkBuddy 启动时发现并注入给 Agent 的可调用 Skill
```

在当前环境中，飞书 marketplace 下的 lark\-doc/SKILL\.md 与安装后的 connectors/skills/connector\-feishu/lark\-doc/SKILL\.md 内容一致。说明连接成功后 WorkBuddy 将 marketplace 中的飞书 Skill 安装到了用户可用目录。

需要注意：connectors\-marketplace/connectors/ 不是 WorkBuddy 全部内置 Skill 的唯一来源。插件 Skill、系统 Skill、用户自定义 Skill 可能来自其他目录。它包含的是“内置连接器相关的 Skill 内容”。

# 九、当前 marketplace 中 Skill 覆盖情况

当前 connectors\-marketplace/connectors/ 下有 43 个连接器目录，其中 32 个带有 SKILL\.md，总计 102 个 SKILL\.md。

带 Skill 的连接器包括：

```text
anydev, baidu-netdisk, bugly, cloudbase, cnb-api, cnb-woa,
ctrip-wendao, dingtalk, edgeone-pages, fbs-connector, feishu,
github, github-remote, kdocs, km, lexiang, neo-crm, netease-mail,
notion, pkulaw, qcc-company, qq-mail, tdx-connector,
tencent-qidian-cs, tencent-survey, tencent-weiyun, tmeet, tyc-mcp,
wecom, weisheng-scrm, xiaoe-cloud-cli, zfs-fssc-ai
```

没有 Skill 的连接器包括：

```text
gmail, gongfeng-woa, ima-mcp, iwiki-woa, jira, supabase,
tapd, tapd-woa, tencent-docs, yuandian-mcp, zhiyan-cicd
```

Skill 数量较多的连接器包括：

|连接器|SKILL\.md 数量|说明|
|---|---|---|
|feishu|27|覆盖文档、云盘、表格、多维表格、IM、日历、邮箱、会议等多个飞书域。|
|cloudbase|26|包含 CloudBase 平台、云函数、数据库、Web/小程序开发等参考 Skill。|
|lexiang|8|包含文档、文件、搜索、写作、同步等知识库操作说明。|
|wecom|7|覆盖企微消息、文档、联系人、会议、日程、待办、智能表格等。|
|notion|4|覆盖研究文档、会议智能、知识捕获、需求到实现等工作流。|
|xiaoe\-cloud\-cli|4|覆盖认证、课程、素材等小鹅通 CLI 能力。|

# 十、与 Claude Code 接入 CLI 的对比

在讨论 Claude Code 接入 CLI 时，可以对照 WorkBuddy 的设计。

Claude Code 调用 CLI 通常有两条路径：

1. 通过 shell/Bash 工具直接执行 CLI 命令。此时 Claude Code 并不会自动知道某个 CLI 的完整指令树，需要从 Skill、CLAUDE\.md、README、\-\-help 输出或用户说明中学习。

2. 通过 MCP server 调用结构化工具。此时 Claude Code 知道的是 MCP server 暴露出的 tools，而不是底层 CLI 的全部命令。

因此，对于“大而全”的 CLI，例如飞书 CLI、kubectl、gh、内部 DevOps CLI，完全封装成 MCP 往往维护成本很高。更合适的方式是：

```text
安装/认证脚本或文档：解决 CLI 怎么装、怎么登录、怎么检查状态
Skill：告诉 Agent 什么时候用、怎么用、常见命令和错误处理
CLI 本身：执行实际业务操作
```

如果 CLI 只有少量稳定动作，例如 query\_ticket、create\_ticket、deploy\_service，则可以考虑 MCP wrapper，把这些动作暴露成结构化 tool。对于长尾命令多、参数频繁变化的 CLI，Skill 驱动更现实。

# 十一、推荐的连接器设计准则

- 如果能力是少量稳定 API，优先做 MCP 型连接器，让工具 schema 清晰、参数可控。

- 如果能力是大型 CLI，优先做 CLI 型连接器，并把使用说明沉淀为 Skill。

- cli\.json 只负责生命周期：安装、版本、认证、状态、登出，不要试图描述完整业务命令树。

- Skill 负责 Agent 可用性：场景判断、命令选择、参数约束、错误处理、安全规则。

- token\-schema\.json 用于用户输入密钥，不要把密钥写死进 mcp\.json 或 Skill。

- 对于高风险写操作，必须在 Skill 或 CLI 层设计确认机制。

- MCP wrapper 不建议暴露 run\_cli\(command: string\) 这种任意命令工具，应暴露明确业务动作和结构化参数。

- 连接器启用状态应与账号身份隔离，避免不同用户或企业身份串用认证状态。

- 安装后的 Skill 应与 marketplace 原始包区分，便于升级、回滚和用户级启用控制。

# 十二、整体架构图

```text
┌─────────────────────────────────────────────────────────┐
│ connectors-marketplace                                  │
│  ├─ .codebuddy-connector/connectors.json                │
│  └─ connectors/<id>/                                    │
│      ├─ mcp.json                                        │
│      ├─ cli.json                                        │
│      ├─ token-schema.json                               │
│      ├─ skills/ or skill/                               │
│      └─ connector-meta.json / icon / scripts            │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ ConnectorService                                        │
│  - 读取 marketplace 包                                  │
│  - 安装/升级 CLI                                        │
│  - 发起认证和状态检查                                   │
│  - 汇总 MCP 配置                                        │
│  - 安装可用 Skill                                       │
│  - 保活内置或本地 MCP 进程                              │
└─────────────────────────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
┌─────────────────────────┐ ┌─────────────────────────────┐
│ connectors/<account>/   │ │ connectors/skills/           │
│  connector-states.json  │ │  connector-<id>/SKILL.md     │
│  mcp.json               │ │                             │
│  .credentials.json      │ │                             │
└─────────────────────────┘ └─────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│ .mcp.json                                                │
│  connector-proxy -> http://127.0.0.1:52666/mcp           │
└─────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│ Agent                                                    │
│  - MCP 型：通过 connector-proxy 调 MCP tools             │
│  - CLI 型：根据 Skill 通过 shell 执行 CLI 命令            │
└─────────────────────────────────────────────────────────┘
```

# 十三、最终理解

CodeBuddy / WorkBuddy 连接器的关键不是某一个文件，而是一组分层协议：

- connectors\.json 解决“有哪些连接器”。

- mcp\.json 解决“MCP 型连接器怎么连”。

- cli\.json 解决“CLI 型连接器怎么安装和认证”。

- token\-schema\.json 解决“用户需要提供哪些密钥”。

- Skill 解决“Agent 如何正确使用这个能力”。

- connector\-states\.json 解决“当前用户启用了什么、状态如何”。

- \.mcp\.json 和 connector\-proxy 解决“Agent 通过哪里接入所有 MCP 连接器”。

这种机制使连接器可以独立发布、独立升级，也让 MCP、CLI 和纯 Skill 三类接入方式可以共存。对于飞书这类复杂 CLI，WorkBuddy 选择的是“cli\.json 管生命周期 \+ 多个 Skill 管使用方式”的模式，而不是把整个 CLI 全量封装成 MCP。

> (注：内容由 AI 生成，请谨慎参考）
