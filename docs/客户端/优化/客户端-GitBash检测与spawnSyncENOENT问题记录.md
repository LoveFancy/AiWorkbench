# Git Bash 检测与 `spawnSync cmd.exe ENOENT` 问题

> **创建日期：** 2026-06-22  
> **涉及版本：** WorkMate (Electron)  
> **状态：** 问题已定位，修复方案已设计但**暂未落地**（见文末说明）

---

## 1. 问题现象

在 Windows 打包环境下（非开发模式），应用启动时 **所有 Git Bash 检测策略全部失败**，即使 `C:\Program Files\Git\bin\bash.exe` 真实存在于硬盘上。

关键日志输出（通过临时添加的 `[GitBashDebug]` 调试日志捕获）：

```
[GitBashDebug] verify 文件存在，执行 --version: C:\Program Files\Git\bin\bash.exe
[GitBashDebug] verify 执行失败: C:\Program Files\Git\bin\bash.exe | spawnSync cmd.exe ENOENT
[GitBashDebug] where bash 执行失败: spawnSync cmd.exe ENOENT
```

### 核心错误

**`spawnSync cmd.exe ENOENT`**

- `ENOENT` = Error NO ENTity（文件/路径不存在）
- Node.js 的 `execSync` 在 Windows 上内部调用 `cmd.exe` 来执行命令字符串
- 进程找不到 `cmd.exe` → 所有依靠 `execSync` 的命令探测全挂

### 影响范围

| 检测模块 | 受影响的 API | 后果 |
|---|---|---|
| `git-bash-detector.ts` | `execSync("bash --version")`, `execSync("where bash")` | Git Bash 检测不到 |
| `git-detector.ts` | `execSync("where git")` | Git 运行时检测不到 |
| `bun-finder.ts` | `execSync("where bun")` | Bun 检测不到 |
| `node-detector.ts` | `execSync("where node")` | Node.js 检测不到 |
| `windows-env.ts` | `execSync("reg query ...")` | 注册表 PATH 合并失败 |

---

## 2. 根因分析

### 2.1 `execSync` 执行机制

Node.js 的 `execSync(command)` / `execSync(command)` 在 Windows 平台上的执行路径：

```
execSync("bash --version")
  → 查找 process.env.ComSpec（即 cmd.exe 的完整路径）
    → 如果 ComSpec 存在：使用它
    → 如果 ComSpec 不存在/为空：回退裸 "cmd.exe"，靠 PATH 查找
      → 如果 PATH 不含 System32：cmd.exe 找不到 → ENOENT
```

**代码位置：**  
[git-bash-detector.ts:88-92](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/git-bash-detector.ts#L88-L92)

```typescript
const output = execSync(`"${bashPath}" --version`, {
  timeout: 5000,
  stdio: ['pipe', 'pipe', 'pipe'],
})
```

### 2.2 GUI 进程环境变量的特殊性

Windows 上通过**桌面快捷方式 / 开始菜单 / 双击 EXE** 启动的 GUI 应用：

- **不继承**用户在终端里看到的完整环境变量（如通过 `setx` 设置的用户 PATH）
- 只继承 launchd 级别的最小环境（`SystemRoot`, `windir` 等通常保留，但 `ComSpec` 偶尔缺失）
- Electron 打包后的应用（通过 Squirrel 安装器注册的快捷方式启动）属于典型的 GUI 进程

### 2.3 现有兜底机制的不足

应用已有的 Windows 环境加载模块 [windows-env.ts:15-18](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/windows-env.ts#L15-L18) 会从注册表读取 PATH 并合并：

```
HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment\Path
HKCU\Environment\Path
```

**但是：**

1. **时机问题**：注册表 PATH 合并（`loadWindowsEnv`）和 Git Bash 检测（`detectGitBash`）都依赖 `execSync`。如果 `ComSpec` 和 `System32` 一开始就不在环境里，**连 `reg query` 都跑不了**。
2. `readRegistryValue` [windows-env.ts:37-49](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/windows-env.ts#L37-L49) 也是用的 `execSync("reg query ...")`，同样会 `ENOENT`。
3. 另外 `loadWindowsEnv` 在**开发模式下会直接跳过**（[windows-env.ts:157-159](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/windows-env.ts#L157-L159)），开发时依赖终端启动的完整 PATH；但某些开发场景（如从 VS Code 调试启动）也可能遇到类似问题。

### 2.4 `execSync` vs `execFileSync` 的关键区别

| API | 执行方式 | 依赖 | 适用场景 |
|---|---|---|---|
| `execSync(cmd)` | 经 `cmd.exe /c cmd` 间接执行 | `ComSpec` 或 `cmd.exe` 在 PATH 中 | 需要 shell 管道/重定向 |
| `execFileSync(path, args)` | **直接**创建进程 | 无（直接指定可执行文件路径） | 已知绝对路径的程序 |

**修复关键**：`bash.exe` 已经是完整绝对路径，完全不需要经过 `cmd.exe`，改用 `execFileSync` 即可绕开。

---

## 3. 完整的 Git Bash 检测过程

### 3.1 调用链

```
应用启动 → main/index.ts
  → initializeRuntime()                    [runtime-init.ts:37-138]
    → loadShellEnv() → loadWindowsEnv()    [runtime-init.ts:47, → shell-env.ts → windows-env.ts]
    → detectNodeRuntime()                  [runtime-init.ts:55]
    → detectBunRuntime()                   [runtime-init.ts:62]
    → detectGitRuntime()                   [runtime-init.ts:69]
    → detectGitBash()                      [runtime-init.ts:84, → git-bash-detector.ts]
      → getCommonGitBashPaths()            [git-bash-detector.ts:27-68]
      → verifyBashPath()                   [git-bash-detector.ts:76-119]
      → getGitForWindowsInstallPath()      [git-bash-detector.ts:156-173, → windows-env.ts:58-66]
      → findBashInPath()                   [git-bash-detector.ts:126-163]
  → 结果缓存到 runtimeStatusCache          [runtime-init.ts:126-127]
  → 汇总日志                              [runtime-init.ts:133-136]
```

### 3.2 检测策略详情

#### 策略 1：扫描常见安装路径

**函数：** [getCommonGitBashPaths()](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/git-bash-detector.ts#L27-L68)

按优先级生成候选路径列表（共 6 或 8 条，取决于 `%SCOOP%` 是否设置）：

| 优先级 | 来源 | 示例路径 |
|---|---|---|
| 1 | `%SCOOP%\apps\git\current\bin\bash.exe` | `D:\Scoop\apps\git\current\bin\bash.exe` |
| 2 | `%SCOOP%\apps\git\current\usr\bin\bash.exe` | 同上，`usr\bin\` |
| 3 | `%LOCALAPPDATA%\scoop\apps\git\current\bin\bash.exe` | `C:\Users\xxx\AppData\Local\scoop\...` |
| 4 | 同上 `usr\bin\` | — |
| 5 | `%ProgramFiles%\Git\bin\bash.exe` | `C:\Program Files\Git\bin\bash.exe` |
| 6 | `C:\Program Files (x86)\Git\bin\bash.exe` | 32位版 |
| 7 | `%ProgramFiles%\Git\usr\bin\bash.exe` | — |
| 8 | `C:\Program Files (x86)\Git\usr\bin\bash.exe` | — |

逐个调用 [verifyBashPath(path)](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/git-bash-detector.ts#L76-L119)：
1. `existsSync(path)` — 文件不存在 → 跳过
2. `execSync("path --version")` — 执行 5s 有超时
3. 正则 `/version\s+(\S+)/` 匹配版本号
4. 提取主版本号 `split('(')[0]`

第一个验证通过即返回，后续不再检查。

#### 策略 2：从注册表读取安装路径

**函数：** [getGitForWindowsInstallPath()](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/windows-env.ts#L58-L66)

1. 读 `HKLM\SOFTWARE\GitForWindows` 的 `InstallPath`
2. 如果为空，读 `HKCU\SOFTWARE\GitForWindows` 的 `InstallPath`

拿到路径后拼两个候选：
- `<InstallPath>\bin\bash.exe`
- `<InstallPath>\usr\bin\bash.exe`

依次 `verifyBashPath` 验证。

#### 策略 3：`where bash` 在 PATH 中查找

**函数：** [findBashInPath()](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/git-bash-detector.ts#L126-L163)

1. 执行 `execSync("where bash")`，5s 超时
2. 输出可能有多个结果，**优先选路径里含 `git`（不区分大小写）的**
3. 都不含 `git` 则取第一个
4. 拿到后 `verifyBashPath` 验证

#### 全部失败

[git-bash-detector.ts:257-265](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/git-bash-detector.ts#L257-L265)

```
console.warn('[Git Bash 检测] 未找到可用的 Git Bash 环境')
return { available: false, path: null, version: null, error: '未找到 Git Bash 环境，请安装 Git for Windows' }
```

### 3.3 结果使用

| 消费点 | 文件 | 行号 | 用途 |
|---|---|---|---|
| Agent preflight 校验 | [agent-orchestrator.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/agent-orchestrator.ts) | L244-262 | Windows 下检查 `gitBash.available`，不可用则阻止 Agent 运行并弹提示 |
| Shell 路径注入 SDK | [sdk-env.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/orchestrator/sdk-env.ts) | L83-87 | 把 `gitBash.path` 写入 `CLAUDE_CODE_SHELL` 环境变量传给 SDK 子进程 |
| UI 环境检测面板 | [EnvironmentCheckPanel.tsx](file:///d:/AiWorkbench-workmate/apps/electron/src/renderer/components/environment/EnvironmentCheckPanel.tsx) | L35-49 | 展示 Git Bash 状态，提供"重新检测"按钮 |
| IPC 接口 | [ipc.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/ipc.ts) | L794-799 | 暴露 `REINIT_RUNTIME` 通道给渲染进程调用 |
| 重新初始化 | [runtime-init.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/runtime-init.ts) | L168-172 | `reinitializeRuntime()` 清空缓存后重新检测 |

### 3.4 关键日志

| 日志来源 | 标签 | 触发条件 |
|---|---|---|
| git-bash-detector.ts | `[Git Bash 检测]` | 仅失败时 `console.warn` |
| git-bash-detector.ts | `[GitBashDebug]` | **临时调试日志**，每个候选路径、每次 verify、每条策略命中/未命中都打印 |
| runtime-init.ts | `[运行时初始化] 完成` | 初始化完成汇总，含 `shell=git-bash/none/skipped` |
| sdk-env.ts | `[Agent 编排] 配置 Shell 环境` | 实际注入 `CLAUDE_CODE_SHELL` 时打印具体路径 |
| agent-orchestrator.ts | 无 console | preflight 失败时通过 `reportPreflightError` 向用户展示 |

---

## 4. 解决方案

### 4.1 方案 A：`ensureSystemShell`（推荐）

**思路：** 在 `loadWindowsEnv` 的最开头（任何 `execSync` 之前），用 `SystemRoot` 把 `ComSpec` 和 `System32` 兜底回填。

**修改文件：** [windows-env.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/windows-env.ts)

**新增函数**：

```typescript
function ensureSystemShell(): void {
  const systemRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
  const system32 = join(systemRoot, 'System32')
  const cmdPath = join(system32, 'cmd.exe')

  // 修复 ComSpec：为空或指向不存在的文件时，回填真实 cmd.exe
  const comSpec = process.env.ComSpec
  if (!comSpec || !existsSync(comSpec)) {
    if (existsSync(cmdPath)) {
      process.env.ComSpec = cmdPath
      console.log(`[Windows 环境] ComSpec 失效，已修复为: ${cmdPath}`)
    }
  }

  // 确保 System32 在 PATH 中
  const currentPath = process.env.PATH || ''
  const hasSystem32 = currentPath
    .split(PATH_SEP)
    .some((p) => normalizePathForCompare(p) === normalizePathForCompare(system32))
  if (!hasSystem32 && existsSync(system32)) {
    process.env.PATH = currentPath ? `${system32}${PATH_SEP}${currentPath}` : system32
    console.log(`[Windows 环境] PATH 缺少 System32，已补回: ${system32}`)
  }
}
```

**调用时机：** 在 `loadWindowsEnv()` 函数内、任何 `execSync` 调用（包括 `readRegistryValue` 中的 `reg query`）之前执行。

### 4.2 方案 B：`verifyBashPath` 改用 `execFileSync`

**修改文件：** [git-bash-detector.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/git-bash-detector.ts) L88-92

将：
```typescript
const output = execSync(`"${bashPath}" --version`, { timeout: 5000, ... })
```
改为：
```typescript
const output = execFileSync(bashPath, ['--version'], { timeout: 5000, ... })
```

`bash.exe` 是已知的绝对路径，`execFileSync` 直接创建进程，不需要 `cmd.exe` 中介。这个改动量最小、无副作用，可以直接落地。

**不适用场景：** 策略 3 的 `where bash` 仍需要 `execSync`（因为它需要 `cmd.exe` 的 `where` 命令查找 PATH）。但策略 1 修复后通常能直接命中，策略 3 实际用不到。

### 4.3 推荐组合

**方案 A + 方案 B 同时落地：**

- 方案 A 修复全局的环境缺陷，避免其他模块（git/node/bun/node-detector）也踩同样的坑
- 方案 B 使 `verifyBashPath` 不再依赖 `cmd.exe`，从根本上提高检测健壮性

---

## 5. 临时调试日志

为定位此问题而向 [git-bash-detector.ts](file:///d:/AiWorkbench-workmate/apps/electron/src/main/lib/git-bash-detector.ts) 添加了以 `[GitBashDebug]` 为前缀的调试日志，覆盖：

| 日志位置 | 函数 | 行号 | 内容 |
|---|---|---|---|
| 函数入口 | `detectGitBash()` | L178-182 | `platform`、`PATH` 截断 |
| 环境变量快照 | `getCommonGitBashPaths()` | L33-37 | `SCOOP`、`LOCALAPPDATA`、`ProgramFiles` |
| 候选路径列表 | `getCommonGitBashPaths()` | L62-65 | 全部候选路径 |
| 逐路径验证 | `verifyBashPath()` | L79-81, L84-86, L94-97, L104-106 | 是否存在、执行 `--version`、原始输出、通过 |
| 验证失败 | `verifyBashPath()` | L110-111, L113-116 | 无法解析版本或执行抛错 |
| `where bash` | `findBashInPath()` | L136-140, L147L154-155, L159-161 | 原始输出、优先选择、回退、失败 |
| 策略路由 | `detectGitBash()` | L196, L200, L209, L212 | 策略 1/2/3 的进入和命中/未命中 |

**这些日志需在问题修复后删除。**

---

## 6. 修改计划（暂未落地）

以下修改**已设计但尚未落实**到代码中：

| 待办 | 文件 | 预期行号 | 说明 |
|---|---|---|---|
| 新增 `import { join } from 'path'` | `windows-env.ts` | L2 | 当前已有 `from 'fs'`，需追加 `path` |
| 新增 `function ensureSystemShell()` | `windows-env.ts` | 添加在 `loadWindowsEnv()` 之前 | 兜底修复 ComSpec / System32 |
| 在 `loadWindowsEnv()` 开头调用 | `windows-env.ts:152` | 在 `if (process.platform !== 'win32')` 之后、`if (!app.isPackaged)` 之前 | 必须在开发模式判断之前执行 |
| `verifyBashPath` 改用 `execFileSync` | `git-bash-detector.ts:88` | 替换 `execSync` → `execFileSync` | 从 `node:child_process` 增加 `execFileSync` 导入 |
| 删除 `[GitBashDebug]` 临时调试日志 | `git-bash-detector.ts` | 所有含 `[GitBashDebug]` 的行 | 问题修复后清理 |

---

## 附录：相关文件索引

| 文件 | 说明 |
|---|---|
| `apps/electron/src/main/lib/git-bash-detector.ts` | Git Bash 检测主逻辑（267 行） |
| `apps/electron/src/main/lib/windows-env.ts` | Windows 环境变量加载、注册表读取（194 行） |
| `apps/electron/src/main/lib/windows-command-output.ts` | 外部命令输出解码（GBK 回退）（19 行） |
| `apps/electron/src/main/lib/runtime-init.ts` | 运行时初始化编排、缓存管理（178 行） |
| `apps/electron/src/main/lib/git-detector.ts` | Git 运行时检测（含 `detectGitBashWindows()` 未使用版本）（299 行） |
| `apps/electron/src/main/lib/orchestrator/sdk-env.ts` | Shell 路径注入 SDK（`CLAUDE_CODE_SHELL`） |
| `apps/electron/src/main/lib/agent-orchestrator.ts` | Agent preflight 环境校验 |
| `apps/electron/src/main/ipc.ts` | IPC 通道注册（GET_RUNTIME_STATUS / REINIT_RUNTIME） |
| `apps/electron/src/renderer/components/environment/EnvironmentCheckPanel.tsx` | UI 环境检测面板 |
| `apps/electron/src/renderer/atoms/environment.ts` | 渲染进程运行时状态原子状态 |
| `packages/shared/src/types/runtime.ts` | `RuntimeStatus` / `GitBashStatus` / `ShellEnvironmentStatus` 类型定义 |
