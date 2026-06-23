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

  for (const [id, entry] of Object.entries(connectorsConfig.connectors)) {
    if (entry.source !== 'preset') continue
    definitions.push({
      id,
      name: entry.displayName ?? id,
      description: entry.description ?? '',
      category: entry.category ?? '其他',
      status: entry.status ?? 'available',
      serverName: entry.serverName,
      connectorType: entry.type,
    })
  }

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
