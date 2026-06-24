import type { ConnectorEntry, ConnectorsConfig } from '@proma/shared'

/* 连接器元数据均从 default-connectors/{name}/connector.json 动态读取 */
/** 预设连接器展示信息（从 ConnectorEntry 派生） */
export interface PresetConnectorDefinition {
  id: string
  name: string
  description: string
  category: string
  status: 'available' | 'coming-soon'
  serverName?: string
  connectorType: 'mcp' | 'cli'
  /** 来源：preset=WorkMate内置，user=用户自定义 */
  source?: 'preset' | 'user'
}

/**
 * 从 connectors.json 中提取 source === 'preset' 的连接器展示定义
 *
 * 所有字段从 connectors.json 的 ConnectorEntry 派生，不再硬编码。
 * 新增连接器只需在 default-connectors/{name}/connector.json 中写好元数据，
 * 启动时 syncDefaultConnectorsToWorkspace() 同步到工作区 connectors.json 即可。
 */
export function getPresetConnectorDefinitions(
  connectorsConfig: ConnectorsConfig | null,
): PresetConnectorDefinition[] {
  if (!connectorsConfig) return []

  const definitions: PresetConnectorDefinition[] = []
  const entryMap = new Map(Object.entries(connectorsConfig.connectors))

  for (const [id, entry] of entryMap) {
    if (entry.source !== 'preset') continue
    definitions.push({
      id,
      name: entry.displayName ?? id,
      description: entry.description ?? '',
      category: entry.category ?? '其他',
      status: entry.status ?? 'available',
      serverName: entry.serverName,
      connectorType: entry.type,
      source: 'preset',
    })
  }

  definitions.sort((a, b) => {
    const aOrder = (entryMap.get(a.id)?.sortOrder) ?? 999
    const bOrder = (entryMap.get(b.id)?.sortOrder) ?? 999
    return aOrder - bOrder
  })

  return definitions
}

/**
 * 获取所有预设连接器的 MCP server name 集合
 */
export function getPresetConnectorServerNames(
  connectorsConfig: ConnectorsConfig | null,
): Set<string> {
  return new Set(
    getPresetConnectorDefinitions(connectorsConfig)
      .map((def) => def.serverName)
      .filter((name): name is string => Boolean(name)),
  )
}

/**
 * 获取所有连接器定义（预置 + 自定义），用于统一渲染
 */
export function getAllConnectorDefinitions(
  connectorsConfig: ConnectorsConfig | null,
  mcpConfig: Record<string, { enabled: boolean; type: string; command?: string; url?: string; isBuiltin?: boolean; lastTestResult?: { success: boolean; message: string } }> | null,
): Array<
  PresetConnectorDefinition & {
    source?: 'preset' | 'user'
    serverEntry?: unknown
    isBuiltin?: boolean
    lastTestResult?: { success: boolean; message: string }
  }
> {
  if (!connectorsConfig) return []

  const definitions: Array<
    PresetConnectorDefinition & {
      source?: 'preset' | 'user'
      serverEntry?: unknown
      isBuiltin?: boolean
      lastTestResult?: { success: boolean; message: string }
    }
  > = []
  const entryMap = new Map(Object.entries(connectorsConfig.connectors))

  for (const [id, entry] of entryMap) {
    if (entry.source === 'preset') {
      // 预置连接器：复用现有逻辑
      definitions.push({
        id,
        name: entry.displayName ?? id,
        description: entry.description ?? '',
        category: entry.category ?? '其他',
        status: entry.status ?? 'available',
        serverName: entry.serverName,
        connectorType: entry.type,
        source: 'preset',
        serverEntry: entry.serverName && mcpConfig ? mcpConfig[entry.serverName] : undefined,
      })
    } else if (entry.source === 'user') {
      // 自定义 MCP 连接器：从 ConnectorEntry + MCP entry 构造
      const serverName = entry.serverName ?? id
      const serverEntry = serverName && mcpConfig ? mcpConfig[serverName] : undefined
      definitions.push({
        id,
        name: entry.displayName ?? id,
        description: serverEntry
          ? `${serverEntry.type.toUpperCase()} · ${serverEntry.type === 'stdio' ? serverEntry.command : serverEntry.url}`
          : '',
        category: entry.category ?? '用户自定义',
        status: entry.status ?? 'available',
        serverName,
        connectorType: entry.type,
        source: 'user',
        serverEntry,
        isBuiltin: serverEntry?.isBuiltin,
        lastTestResult: serverEntry?.lastTestResult,
      })
    }
  }

  definitions.sort((a, b) => {
    const aOrder = (entryMap.get(a.id)?.sortOrder) ?? (a.source === 'preset' ? 500 : 999)
    const bOrder = (entryMap.get(b.id)?.sortOrder) ?? (b.source === 'preset' ? 500 : 999)
    return aOrder - bOrder
  })

  return definitions
}
