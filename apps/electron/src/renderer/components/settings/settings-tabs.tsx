/**
 * Settings tabs - 设置标签定义
 *
 * 将设置页导航抽成纯模块，方便复用和测试。
 */

import * as React from 'react'
import type { ReactNode } from 'react'
import {
  Settings,
  Radio,
  BookOpen,
  Plug,
  GraduationCap,
  Keyboard,
  Palette,
  Info,
  Wrench,
  Package,
  UsersRound,
  TerminalSquare,
} from 'lucide-react'
import type { SettingsTab } from '@/atoms/settings-tab'

export interface TabItem {
  id: SettingsTab
  label: string
  icon: ReactNode
}

/** 基础 Tabs（所有模式都有） */
const BASE_TABS: TabItem[] = [
  { id: 'general', label: '通用设置', icon: <Settings size={16} /> },
  { id: 'channels', label: '模型配置', icon: <Radio size={16} /> },
  { id: 'prompts', label: '提示词管理', icon: <BookOpen size={16} /> },
]

/** Agent 模式专属 Tab */
const AGENT_TAB: TabItem = {
  id: 'agent',
  label: 'SKILL/MCP',
  icon: <Plug size={16} />,
}

const PLUGINS_TAB: TabItem = {
  id: 'plugins',
  label: '插件管理',
  icon: <Package size={16} />,
}

const EXPERTS_TAB: TabItem = {
  id: 'experts',
  label: '专家团',
  icon: <UsersRound size={16} />,
}

const TOOLS_TAB: TabItem = {
  id: 'tools',
  label: 'Chat 工具',
  icon: <Wrench size={16} />,
}

const SYSTEM_LOG_TAB: TabItem = {
  id: 'system-log',
  label: '系统日志',
  icon: <TerminalSquare size={16} />,
}

const TUTORIAL_TAB: TabItem = {
  id: 'tutorial',
  label: '使用教程',
  icon: <GraduationCap size={16} />,
}

const SHORTCUTS_TAB: TabItem = {
  id: 'shortcuts',
  label: '快捷键管理',
  icon: <Keyboard size={16} />,
}

/** 尾部 Tabs */
const TAIL_TABS: TabItem[] = [
  { id: 'appearance', label: '外观设置', icon: <Palette size={16} /> },
  { id: 'about', label: '关于 / 更新', icon: <Info size={16} /> },
]

export function getSettingsTabs(appMode: 'chat' | 'agent'): TabItem[] {
  return appMode === 'agent'
    ? [...BASE_TABS, TOOLS_TAB, AGENT_TAB, PLUGINS_TAB, EXPERTS_TAB, TUTORIAL_TAB, SHORTCUTS_TAB, ...TAIL_TABS, SYSTEM_LOG_TAB]
    : [...BASE_TABS, TOOLS_TAB, TUTORIAL_TAB, SHORTCUTS_TAB, ...TAIL_TABS, SYSTEM_LOG_TAB]
}
