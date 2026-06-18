/**
 * AgentSettings - Agent 配置页
 *
 * 此页仅保留内置工具概览。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Brain, ImagePlus, Pencil, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { settingsTabAtom } from '@/atoms/settings-tab'
import { chatToolsAtom } from '@/atoms/chat-tool-atoms'
import { SettingsSection, SettingsCard } from './primitives'

interface BuiltinToolItem {
  id: string
  name: string
  description: string
  icon: React.ReactElement
  enabled: boolean
  available: boolean
}

export function AgentSettings(): React.ReactElement {
  const tools = useAtomValue(chatToolsAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)

  const memoryTool = tools.find((tool) => tool.meta.id === 'memory')
  const nanoBananaTool = tools.find((tool) => tool.meta.id === 'nano-banana')
  const webSearchTool = tools.find((tool) => tool.meta.id === 'web-search')

  const builtinTools: BuiltinToolItem[] = [
    {
      id: 'memory',
      name: '记忆',
      description: '长期记忆存储与检索',
      icon: <Brain className="size-4" />,
      enabled: memoryTool?.enabled ?? false,
      available: memoryTool?.available ?? false,
    },
    {
      id: 'nano-banana',
      name: 'Nano Banana',
      description: 'AI 图片生成与编辑',
      icon: <ImagePlus className="size-4" />,
      enabled: nanoBananaTool?.enabled ?? false,
      available: nanoBananaTool?.available ?? false,
    },
    {
      id: 'web-search',
      name: '联网搜索',
      description: '实时搜索互联网获取最新信息',
      icon: <Search className="size-4" />,
      enabled: webSearchTool?.enabled ?? false,
      available: webSearchTool?.available ?? false,
    },
  ]

  return (
    <div className="space-y-8">
      <SettingsSection
        title="内置工具"
        description="启用后自动注入到 Agent 会话，在工具设置中配置。"
        action={
          <Button size="sm" variant="outline" onClick={() => setSettingsTab('tools')}>
            <Pencil size={14} />
            <span>配置</span>
          </Button>
        }
      >
        <SettingsCard divided>
          {builtinTools.map((tool) => {
            const isActive = tool.enabled && tool.available
            return (
              <div key={tool.id} className="flex items-center justify-between p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={cn('shrink-0', !isActive && 'opacity-40')}>{tool.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-medium', !isActive && 'text-muted-foreground')}>{tool.name}</span>
                      <span className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px]',
                        isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                      )}>
                        {isActive ? '已启用' : !tool.available ? '需配置' : '未启用'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
