/**
 * ToolSettings - 工具设置页
 *
 * Chat 模式工具统一管理 tab。
 * 当前只展示联网搜索工具配置。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { Loader2, CheckCircle2, XCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingsSection, SettingsCard } from './primitives'
import { chatToolsAtom } from '@/atoms/chat-tool-atoms'

type WebSearchTimeRange = 'OneDay' | 'OneWeek' | 'OneMonth' | 'OneYear'

interface ToolTestResult {
  success: boolean
  message: string
  details?: string
}

const TIME_RANGE_OPTIONS: Array<{ value: WebSearchTimeRange; label: string }> = [
  { value: 'OneDay', label: '近一天' },
  { value: 'OneWeek', label: '近一周' },
  { value: 'OneMonth', label: '近一个月' },
  { value: 'OneYear', label: '近一年' },
]

/** 刷新全局工具列表 atom */
async function refreshChatTools(setter: (tools: Awaited<ReturnType<typeof window.electronAPI.getChatTools>>) => void): Promise<void> {
  try {
    const tools = await window.electronAPI.getChatTools()
    setter(tools)
  } catch (err) {
    console.error('[ToolSettings] 刷新工具列表失败:', err)
  }
}

/** 联网搜索工具设置区域 */
export function WebSearchSettings(): React.ReactElement {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [testQuery, setTestQuery] = React.useState('')
  const [testTimeRange, setTestTimeRange] = React.useState<WebSearchTimeRange>('OneMonth')
  const [testResult, setTestResult] = React.useState<ToolTestResult | null>(null)
  const [chatTools, setChatTools] = useAtom(chatToolsAtom)
  const searchTool = chatTools.find((t) => t.meta.id === 'web-search')
  const enabled = searchTool?.enabled ?? false

  // 从主进程加载当前开关状态；开关状态以 chatToolsAtom 为唯一前端状态源。
  React.useEffect(() => {
    window.electronAPI.getChatTools().then((tools) => {
      setChatTools(tools)
    }).catch((err: unknown) => {
      console.error('[联网搜索设置] 加载失败:', err)
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  const handleToggle = async (checked: boolean): Promise<void> => {
    setSaving(true)
    try {
      await window.electronAPI.updateChatToolState('web-search', { enabled: checked })
      await refreshChatTools(setChatTools)
    } catch (error) {
      console.error('[联网搜索设置] 切换失败:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (): Promise<void> => {
    const query = testQuery.trim()
    if (!query) return

    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.testChatTool('web-search', { query, timeRange: testTimeRange })
      setTestResult(result)
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : String(error) })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">加载中...</div>
  }

  return (
    <SettingsSection
      title="联网搜索"
      description="启用后 AI 可以实时搜索互联网获取最新信息"
      action={
        <Switch
          checked={enabled}
          disabled={saving}
          onCheckedChange={handleToggle}
        />
      }
    >
      <SettingsCard divided={false}>
        <div className="space-y-4 p-4">
          {/* 引导说明 */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm text-muted-foreground">
            <p>联网搜索由 <span className="font-medium text-foreground">泰为平台</span> 提供，启用后 AI 可以搜索互联网获取实时信息。</p>
          </div>

          <div className="rounded-lg bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Search size={15} className="text-muted-foreground" />
              搜索测试
            </div>
            <div className="mt-3 grid grid-cols-[1fr_128px_auto] gap-2">
              <Input
                value={testQuery}
                placeholder="输入测试关键字"
                disabled={testing}
                onChange={(event) => {
                  setTestQuery(event.target.value)
                  setTestResult(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleTest().catch(console.error)
                  }
                }}
              />
              <Select
                value={testTimeRange}
                disabled={testing}
                onValueChange={(value) => {
                  setTestTimeRange(value as WebSearchTimeRange)
                  setTestResult(null)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={testing || !testQuery.trim()}
                onClick={handleTest}
              >
                {testing ? <><Loader2 size={14} className="animate-spin mr-1.5" />测试中...</> : '测试'}
              </Button>
            </div>
          </div>

          {testResult && (
            <div className={`rounded-lg p-3 text-sm ${testResult.success ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
              <div className="flex items-start gap-2">
                {testResult.success ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
              {testResult.details && (
                <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-background/80 p-3 text-xs leading-relaxed text-foreground">
                  {testResult.details}
                </pre>
              )}
            </div>
          )}
        </div>
      </SettingsCard>
    </SettingsSection>
  )
}

export function ToolSettings(): React.ReactElement {
  return (
    <div className="space-y-8">
      <WebSearchSettings />
    </div>
  )
}
