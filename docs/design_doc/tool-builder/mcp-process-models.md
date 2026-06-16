# MCP 三种进程模型对比

SDK 支持三种 MCP 服务器进程模型。

---

## 一、进程内 MCP (in-process)

```
Proma 主进程
│
│  sdk.createSdkMcpServer({
│    name: 'automation',
│    tools: [
│      sdk.tool('delete_automation', schema, async (args) => {
│        deleteAutomation(args.id)   ← 直接在主进程执行
│      })
│    ]
│  })
│  → mcpServers['automation'] = server
│
└─ 无子进程、无网络、无序列化
```

例子：automation、nano-banana、web-search、memory、http-custom

---

## 二、stdio 子进程

```
Proma 主进程                       独立子进程
───────────                       ─────────
│
│  mcpServers['email'] = {
│    type: 'stdio',               SDK 内部:
│    command: 'mcp-email-server',   child_process.spawn()
│    args: ['stdio']                   │
│  }                              stdin  │  stdout
│                                 ──────►│◄──────
└─ 传给 sdk.query({mcpServers})    JSON-RPC (字符串)
                                    tools/list, tools/call
```

例子：email、drawio

---

## 三、http/sse 远程

```
Proma 主进程                       远端服务
───────────                       ────────
│
│  mcpServers['remote-db'] = {
│    type: 'sse',                 SDK 内部:
│    url: 'https://...',       ────────► 远端 MCP Server
│    headers: {...}               HTTP/SSE JSON-RPC
│  }                               tools/list, tools/call
│
└─ 无本地子进程，SDK 直接连远端
```

目前项目没有内置示例，但工作区 mcp.json 可配置远端 MCP 服务。

---

## 四、对比

| | 进程内 | stdio | http/sse |
|------|:--:|:--:|:--:|
| **注册方式** | `sdk.createSdkMcpServer()` | `{type:'stdio', command:'...'}` | `{type:'http', url:'...'}` |
| **进程** | 主进程内 | 本地子进程 | 远端服务 |
| **通信** | 函数调用 | JSON-RPC over stdin/stdout | JSON-RPC over HTTP/SSE |
| **性能** | 最高（零开销） | 中（管道序列化） | 低（网络延迟） |
| **隔离性** | 无（共享内存） | 进程隔离 | 机器隔离 |
| **语言** | TypeScript 限定 | 任意语言 | 任意语言 |
| **依赖** | 无 | pip install CLI | 远程部署 |
| **可用性** | 跟随主进程 | 需本地安装 | 依赖远端服务 |
| **配置复杂度** | 最简（写 handler） | 中（env 传参） | 中（url + headers） |
| **安全** | 信任主进程 | 进程隔离 | 需 HTTPS + 鉴权 |
| **最佳场景** | 产品内置功能 | 本地协议桥接 | 共享服务/云端能力 |

---

## 五、选型指南

```
这是产品级内置功能？
  ├─ 是 → 进程内 MCP（写在源码里，跟随版本）
  └─ 否 →
       需要集成第三方协议（IMAP/Git/DB）？
         ├─ 是 → stdio 子进程（pip install 一个 CLI gateway）
         └─ 否 → 能用一个 HTTP API 搞定？
                  ├─ 是 → http-custom MCP（Agent 对话创建，零安装）
                  └─ 否 → http/sse 远程 MCP（部署专属远端服务）
```
