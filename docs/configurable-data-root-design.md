# 可配置应用数据目录方案

## 背景

当前 Proma 的本地数据根目录由主进程统一计算：

- 开发模式：`~/.proma-dev`
- 正式版本：`~/.proma`

工作区路径如：

```text
~/.proma-dev/agent-workspaces/default/{sessionId}/
```

该路径不是单独的工作区配置，而是从应用数据根目录派生。`settings.json`、渠道配置、Agent 会话、SDK 配置、附件、默认 Skills、Scratch Pad 以及各类集成配置都依赖同一个根目录。

因此需求应定义为：在通用设置中支持用户配置“应用数据目录”，而不是只配置 `agent-workspaces` 目录。

## 目标

1. 用户可以在通用设置中查看当前应用数据目录。
2. 用户可以选择一个自定义目录作为新的应用数据根目录。
3. 用户可以恢复默认目录。
4. 修改后提示重启生效，避免运行中迁移和服务重载风险。
5. 第一版不自动迁移旧数据，旧目录保留不删除。

## 非目标

1. 不在第一版实现自动数据迁移。
2. 不支持运行时热切换数据目录。
3. 不把配置拆成多个目录，例如单独配置工作区、附件、SDK 数据等。
4. 不把自定义目录配置存入 `settings.json`。

## 关键约束

不能把自定义数据目录存入 `settings.json`。

原因是 `settings.json` 本身位于应用数据目录下。启动时如果需要先读取 `settings.json` 才能知道数据目录，会产生循环依赖：

```text
读取 settings.json -> 需要知道应用数据目录
知道应用数据目录 -> 又依赖 settings.json 中的配置
```

因此需要一个位置稳定的 bootstrap 配置文件，用来保存自定义数据根目录。

## 推荐方案

保留当前默认目录作为 bootstrap 目录：

```text
开发模式：~/.proma-dev/config-root.json
正式版本：~/.proma/config-root.json
```

文件内容：

```json
{
  "customConfigDir": "/Users/qinxiao/WorkSpace/proma-data"
}
```

启动时流程：

1. 根据运行模式确定默认目录名：`.proma-dev` 或 `.proma`。
2. 读取默认目录下的 `config-root.json`。
3. 如果 `customConfigDir` 存在且合法，则后续 `getConfigDir()` 返回该目录。
4. 如果配置不存在、格式错误、路径非法或不可访问，则回退默认目录。
5. 回退时打印中文日志，便于排查。

## 数据流

```text
应用启动
  -> getConfigDirName()
  -> defaultConfigDir = ~/ .proma-dev 或 ~/ .proma
  -> 读取 defaultConfigDir/config-root.json
  -> 校验 customConfigDir
  -> getConfigDir() 返回当前进程实际使用的数据目录
```

设置页修改路径：

```text
通用设置
  -> 选择目录
  -> IPC settings:choose-config-root
  -> 主进程校验目录
  -> 写入 defaultConfigDir/config-root.json
  -> 返回 pendingPath
  -> UI 提示重启后生效
```

## IPC 设计

新增 Settings IPC：

```ts
settings:get-config-root
settings:choose-config-root
settings:set-config-root
settings:reset-config-root
```

建议返回类型：

```ts
export interface ConfigRootInfo {
  defaultPath: string
  currentPath: string
  customPath?: string
  pendingPath?: string
  requiresRestart: boolean
}
```

字段含义：

- `defaultPath`：当前运行模式下的默认目录，例如 `/Users/qinxiao/.proma-dev`。
- `currentPath`：当前进程正在使用的数据目录。
- `customPath`：bootstrap 文件中保存的自定义目录。
- `pendingPath`：本次修改后、下次重启才会生效的目录。
- `requiresRestart`：是否存在待生效的目录变更。

## 主进程模块设计

建议新增 `config-root-service.ts`，避免继续扩大 `config-paths.ts` 的职责。

职责：

1. 读取 bootstrap 配置。
2. 写入 bootstrap 配置。
3. 清除 bootstrap 配置。
4. 校验自定义目录。
5. 返回当前目录信息。

`config-paths.ts` 保持路径派生职责，但 `getConfigDir()` 改为读取 `config-root-service` 的解析结果。

## 路径校验规则

设置自定义目录时应校验：

1. 必须是绝对路径。
2. 如果目录不存在，尝试创建。
3. 必须可写。
4. 不允许选择文件路径。
5. 不建议选择系统根目录 `/`。
6. 不建议选择当前项目源码目录，避免把运行数据写入仓库。

校验失败时返回明确中文错误，例如：

```text
请选择一个可写入的文件夹
```

## 通用设置 UI

在 `GeneralSettings` 中新增“数据目录”设置项：

```text
数据目录
当前路径：/Users/qinxiao/.proma-dev
[选择目录] [恢复默认]
```

交互规则：

1. 点击“选择目录”打开系统目录选择器。
2. 选择成功后展示待生效目录。
3. 展示提示：`重启应用后生效`。
4. 点击“恢复默认”清除自定义目录配置。
5. 当前目录与待生效目录不一致时，突出显示待生效状态。

## 重启生效

第一版采用重启生效，不做运行时热切换。

原因：

1. 工作区文件监听器在启动时绑定目录。
2. Agent 会话、SDK 配置、默认 Skills 初始化都依赖启动时路径。
3. 运行时切换可能导致部分服务读旧目录、部分服务写新目录。
4. 避免运行中复制数据导致状态不一致。

## 数据迁移策略

第一版不自动迁移数据。

用户选择新目录后：

- 旧数据仍保留在原目录。
- 重启后应用使用新目录。
- 如果新目录为空，会表现为新的空数据空间。

后续可以单独设计“迁移现有数据到新目录”功能。迁移功能应包含复制前检查、冲突处理、进度展示、失败回滚或恢复指引。

## 影响范围

主要涉及文件：

```text
apps/electron/src/main/lib/config-paths.ts
apps/electron/src/main/lib/config-root-service.ts
apps/electron/src/types/settings.ts
apps/electron/src/main/ipc.ts
apps/electron/src/preload/index.ts
apps/electron/src/renderer/components/settings/GeneralSettings.tsx
```

可能需要同步调整路径展示：

```text
apps/electron/src/renderer/components/settings/AgentSettings.tsx
apps/electron/src/main/lib/agent-prompt-builder.ts
```

避免用户设置自定义目录后，界面或提示词中仍显示写死的 `~/.proma-dev` 路径。

## 测试建议

单元测试：

1. 未配置 bootstrap 时返回默认目录。
2. bootstrap 存在且路径合法时返回自定义目录。
3. bootstrap JSON 损坏时回退默认目录。
4. 自定义路径不是绝对路径时拒绝保存。
5. reset 后恢复默认目录。

集成验证：

1. 通用设置能显示当前目录。
2. 选择目录后提示重启生效。
3. 重启后 `agent-workspaces`、`settings.json` 等文件写入新目录。
4. 恢复默认后重启，路径回到 `~/.proma-dev` 或 `~/.proma`。

## 推荐实施顺序

1. 新增 `config-root-service.ts` 和对应测试。
2. 修改 `config-paths.ts`，让 `getConfigDir()` 支持自定义目录。
3. 增加 Settings IPC 和 preload API。
4. 在通用设置中增加数据目录 UI。
5. 调整路径展示，使用真实数据目录而不是固定 `~/.proma-dev` 文案。
6. 运行相关单元测试和 `bun run typecheck`。

## 结论

推荐采用“bootstrap 配置 + 统一应用数据目录 + 重启生效 + 不自动迁移”的方案。

该方案能覆盖用户希望自定义 `~/.proma-dev` 位置的需求，同时保持现有本地文件存储架构简单、清晰，避免运行时热切换和自动迁移带来的数据一致性风险。
