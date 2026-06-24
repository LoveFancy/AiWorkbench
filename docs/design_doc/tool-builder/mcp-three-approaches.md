# 三种 MCP 工具架构对比

---

## 一、SDK 进程内 MCP（代码内置） — automation

```
Proma 主进程
│
├─ agent-orchestrator.ts
│   injectAutomationMcpServer(sdk, mcpServers)
│     │
│     └─ sdk.createSdkMcpServer({
│          name: 'automation',
│          tools: [
│            sdk.tool('delete_automation', ..., async (args) => {
│              deleteAutomation(args.id)    ← 直接调本地函数
│              broadcastChanged()
│              return jsonResult(...)
│            })
│          ]
│        })
│
├─ automation-manager.ts
│   deleteAutomation(id)
│     → 读写 ~/.proma/automations.json    ← 本地文件
│
└─ automation-scheduler.ts
    setInterval(tick, 30_000)              ← 定时轮询
```

**链路：SDK → 函数调用 → 本地 JSON 文件。零进程、零网络。**

---

## 二、SDK stdio MCP（子进程 Gateway） — email

```
Proma 主进程                      独立子进程                  远端服务器
───────────                      ─────────                  ──────────

agent-orchestrator.ts
│
├─ mcpServers["email"] = {
│    type: "stdio",
│    command: "mcp-email-server",
│    args: ["stdio"],
│    env: { IMAP_HOST: "...", PASSWORD: "..." }
│  }
│
└─ SDK 传给 sdk.query({mcpServers})
     │
     └─ SDK 内部 spawn ──────────► mcp-email-server
         子进程                     (pip install 装的 CLI)
                                   │
                                   │  stdin/stdout JSON-RPC
                                   │  tools/list, tools/call
                                   │
                                   │  翻译成:
                                   ├─ imaplib 连接 ────────► htemail.htsc.com.cn:993
                                   └─ smtplib 发信 ────────► htemail.htsc.com.cn:25
```

**链路：SDK → spawn 子进程 → JSON-RPC → imaplib → 远端邮件服务器。**

---

## 三、Chat Tool → Agent MCP 桥接 — http-custom（设计中）

```
Proma 主进程                                            远端服务器
───────────                                             ──────────

agent-orchestrator.ts
│
└─ injectHttpCustomMcpServer(sdk, mcpServers)  🆕
     │
     └─ http-custom-mcp.ts
          │
          ├─ 1. 读 ~/.proma/chat-tools.json
          │      customTools: [weather, eip-staff, ...]
          │
          ├─ 2. 过滤启用的 + 动态 Zod Schema
          │
          └─ 3. sdk.createSdkMcpServer({
                 name: 'proma-custom-http',
                 tools: [
                   sdk.tool('custom_weather', ..., async (args) => {
                     executeHttpTool(toolCall, meta)
                       │
                       ├─ 模板替换: wttr.in/{{city}} → wttr.in/Beijing
                       ├─ EIP 认证: getToken() → Cookie 注入
                       ├─ fetch(url) ─────────────────► wttr.in
                       └─ 路径提取: resultPath           api.example.com
                   })
                 ]
               })
```

**链路：SDK → 函数调用 → fetch(远端API)。零额外进程、零安装。**

---

## 四、对比总结

| | 进程内-代码内置 | 进程内-http-custom | stdio 子进程 |
|------|:--:|:--:|:--:|
| **例子** | automation | 🆕 custom-weather | email |
| **扩展方式** | 改源码 | Agent 对话创建 | pip install |
| **通信方式** | 函数调用 | HTTP(S) | JSON-RPC over stdio |
| **操作对象** | 本地文件 | 远端 API | 远端服务 |
| **额外进程** | 无 | 无 | 1 个子进程 |
| **额外安装** | 无 | 无 | pip/npm install |
| **适用场景** | 产品级功能 | 用户自定义 API | 第三方协议集成 |
