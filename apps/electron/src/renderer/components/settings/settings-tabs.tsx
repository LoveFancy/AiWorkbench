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
  Globe,
  Plug,
  GraduationCap,
  Keyboard,
  HardDrive,
  Palette,
  Info,
  Wrench,
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
  { id: 'proxy', label: '代理设置', icon: <Globe size={16} /> },
]

/** Agent 模式专属 Tab */
const AGENT_TAB: TabItem = {
  id: 'agent',
  label: 'SKILL/MCP',
  icon: <Plug size={16} />,
}

const TOOLS_TAB: TabItem = {
  id: 'tools',
  label: 'Chat 工具',
  icon: <Wrench size={16} />,
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
  { id: 'storage', label: '磁盘管理', icon: <HardDrive size={16} /> },
  { id: 'appearance', label: '外观设置', icon: <Palette size={16} /> },
  { id: 'about', label: '关于 / 更新', icon: <Info size={16} /> },
]

export function getSettingsTabs(appMode: 'chat' | 'agent'): TabItem[] {
  return appMode === 'agent'
    ? [...BASE_TABS, TOOLS_TAB, AGENT_TAB, TUTORIAL_TAB, SHORTCUTS_TAB, ...TAIL_TABS]
    : [...BASE_TABS, TOOLS_TAB, TUTORIAL_TAB, SHORTCUTS_TAB, ...TAIL_TABS]
}
