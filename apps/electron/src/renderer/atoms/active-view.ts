/**
 * Active View Atom - 主内容区视图状态
 *
 * 控制 MainArea 显示的内容：
 * - conversations: 对话视图（Chat/Agent 模式内容）
 * - automations: 定时任务列表视图
 * - expert-all: 专家/专家团
 * - expert-followed: 已关注专家团
 * - expert-recent: 最近使用专家团
 */

import { atom } from 'jotai'

export type ActiveView = 'conversations' | 'automations' | 'expert-all' | 'expert-followed' | 'expert-recent'

/** 当前活跃视图（不持久化，每次启动默认显示对话） */
export const activeViewAtom = atom<ActiveView>('conversations')
