/**
 * Active View Atom - 主内容区视图状态
 *
 * 控制 MainArea 显示的内容：
 * - conversations: 对话视图
 * - automations: 定时任务列表视图
 * - expert-all: 专家/专家团
 * - agent-skills: Agent 技能（Skills/MCP）全屏管理视图
 */

import { atom } from 'jotai'
import type { CapabilityTab } from '@/components/agent-skills/capability-tabs'

export type ActiveView = 'conversations' | 'automations' | 'expert-all' | 'agent-skills'

/** 当前活跃视图（不持久化，每次启动默认显示对话） */
export const activeViewAtom = atom<ActiveView>('conversations')

/** 打开 Agent 技能视图时希望定位到的一级 Tab。 */
export const agentSkillsInitialTabAtom = atom<CapabilityTab>('experts')
