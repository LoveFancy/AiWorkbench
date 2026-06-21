import type { AgentPluginCapability, AgentPluginInfo, PluginCategory } from '../types/agent'
import { EXPERT_GROUP_CAPABILITY_TYPE } from '../types/agent'

/** 根据插件能力列表计算插件分类。 */
export function classifyPlugin(capabilities: AgentPluginCapability[]): PluginCategory {
  return capabilities.some((capability) => capability.type === EXPERT_GROUP_CAPABILITY_TYPE)
    ? 'expert-group'
    : 'general'
}

/** 是否为专家团插件。 */
export function isExpertGroupPlugin(plugin: AgentPluginInfo): boolean {
  return plugin.category === 'expert-group'
}

/** 是否为普通插件。 */
export function isGeneralPlugin(plugin: AgentPluginInfo): boolean {
  return plugin.category === 'general'
}

/** 是否应在前端"已安装技能"视图中展示。 */
export function isVisibleInSkillsView(plugin: AgentPluginInfo): boolean {
  return isGeneralPlugin(plugin)
}

/** 是否应进入普通 WorkMate 会话 runtime。 */
export function shouldLoadInGeneralRuntime(plugin: AgentPluginInfo): boolean {
  return isGeneralPlugin(plugin)
}

/** 是否应在专家团召唤 runtime 中加载。 */
export function shouldLoadInExpertRuntime(plugin: AgentPluginInfo, expertPluginId: string): boolean {
  return plugin.id === expertPluginId && isExpertGroupPlugin(plugin)
}
