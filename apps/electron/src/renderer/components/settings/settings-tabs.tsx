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
  Keyboard,
  Palette,
  Info,
  Wrench,
  TerminalSquare,
  MessageCircle,
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

const TOOLS_TAB: TabItem = {
  id: 'tools',
  label: '内置工具',
  icon: <Wrench size={16} />,
}

const BOTS_TAB: TabItem = {
  id: 'bots',
  label: '远程连接',
  icon: <MessageCircle size={16} />,
}

const SYSTEM_LOG_TAB: TabItem = {
  id: 'system-log',
  label: '系统日志',
  icon: <TerminalSquare size={16} />,
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
    ? [...BASE_TABS, TOOLS_TAB, BOTS_TAB, SHORTCUTS_TAB, ...TAIL_TABS, SYSTEM_LOG_TAB]
    : [...BASE_TABS, TOOLS_TAB, BOTS_TAB, SHORTCUTS_TAB, ...TAIL_TABS, SYSTEM_LOG_TAB]
}
