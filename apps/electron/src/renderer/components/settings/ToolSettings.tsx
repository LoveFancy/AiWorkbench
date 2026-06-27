/**
 * ToolSettings - 工具设置页
 *
 * Chat 模式工具统一管理 tab。
 * 当前只展示联网搜索工具配置。
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, XCircle, Search, Brain, Lightbulb, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingsSection, SettingsCard } from './primitives'
import { chatToolsAtom } from '@/atoms/chat-tool-atoms'
import { isLoggedInAtom, authStateAtom } from '@/auth/renderer'
import { userProfileAtom } from '@/atoms/user-profile'
import type { QueryCubeResult } from '@proma/shared'

/** 格式化偏好和事实的展示文本 */
function formatQueryResult(data: QueryCubeResult): string {
  const lines: string[] = []
  if (data.facts.length > 0) {
    lines.push(`• 事实 (${data.facts.length} 条)`)
    for (const f of data.facts) {
      const time = f.createTime ? new Date(f.createTime).toLocaleString('zh-CN') : ''
      lines.push(`  ${time ? `[${time}] ` : ''}${f.text.slice(0, 60)}${f.text.length > 60 ? '…' : ''}`)
    }
  }
  if (data.preferences.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`• 偏好 (${data.preferences.length} 条)`)
    for (const p of data.preferences) {
      lines.push(`  ${p.type ? `(${p.type}) ` : ''}${p.text.slice(0, 60)}${p.text.length > 60 ? '…' : ''}`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : '暂无数据'
}

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

/**
 * PersonalMemorySettings - 个人记忆设置
 *
 * 管理本地 MemOS 服务配置和个人记忆创建。
 * Chat 和 Agent 模式共享同一份记忆配置。
 */
function PersonalMemorySettings(): React.ReactElement {
  const [loading, setLoading] = React.useState(true)
  const [creatingCube, setCreatingCube] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<{ success: boolean; message: string; data?: QueryCubeResult } | null>(null)
  const [chatTools, setChatTools] = useAtom(chatToolsAtom)

  const memoryTool = chatTools.find((t) => t.meta.id === 'memory')
  const enabled = memoryTool?.enabled ?? false

  const [hasCube, setHasCube] = React.useState(false)
  const [cubeId, setCubeId] = React.useState('')
  const [cubeName, setCubeName] = React.useState('')
  const isLoggedIn = useAtomValue(isLoggedInAtom)
  const authState = useAtomValue(authStateAtom)
  const userProfile = useAtomValue(userProfileAtom)
  const displayName = authState.jobId?.trim() || userProfile.userName
  React.useEffect(() => {
    window.electronAPI.getMemoryConfig()
      .then((c) => {
        setHasCube(!!c.cubeId)
        setCubeId(c.cubeId)
        setCubeName(c.cubeName)
      })
      .catch((err) => console.error('[MemoryCube] 加载配置失败:', err))
      .finally(() => setLoading(false))
  }, [])

  const refreshTools = React.useCallback(async () => {
    try {
      const tools = await window.electronAPI.getChatTools()
      setChatTools(tools)
    } catch (err) {
      console.error('[MemoryCube] 刷新工具列表失败:', err)
    }
  }, [setChatTools])

  const ensurePersonalMemoryCreated = async (): Promise<void> => {
    const config = await window.electronAPI.getMemoryConfig()
    if (config.cubeId) {
      setHasCube(true)
      setCubeId(config.cubeId)
      setCubeName(config.cubeName)
      return
    }

    setCreatingCube(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.createMemoryCube()
      setHasCube(true)
      setCubeId(result.cubeId)
      setCubeName(result.cubeName)
    } finally {
      setCreatingCube(false)
    }
  }

  const handleToggle = async (checked: boolean): Promise<void> => {
    setTestResult(null)
    try {
      if (checked) {
        await ensurePersonalMemoryCreated()
      }
      const config = await window.electronAPI.getMemoryConfig()
      await window.electronAPI.setMemoryConfig({ ...config, enabled: checked })
      await window.electronAPI.updateChatToolState('memory', { enabled: checked })
      await refreshTools()
      toast.success(checked ? '记忆已开启' : '记忆已关闭')
    } catch (error) {
      console.error('[MemoryCube] 切换失败:', error)
      const msg = error instanceof Error ? error.message : String(error)
      setTestResult({ success: false, message: `开启个人记忆失败: ${msg}` })
    }
  }

  const handleQueryCube = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.testMemoryConnection()
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
      title="个人记忆"
      description="跨会话保存你的偏好、事实和长期上下文"
      action={
        <Switch
          checked={enabled}
          disabled={creatingCube || !isLoggedIn}
          onCheckedChange={handleToggle}
        />
      }
    >
      <SettingsCard divided={false}>
        <div className="space-y-4 p-4">
          <div className="rounded-lg bg-gradient-to-br from-emerald-500/10 via-sky-500/10 to-background p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/80 text-emerald-600 shadow-sm dark:text-emerald-400">
                <Brain size={18} />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium text-foreground">让 AI 记住真正有用的信息</div>
                <p className="text-sm leading-6 text-muted-foreground">
                  个人记忆会保存你明确让 AI 记住的偏好、事实和长期上下文。开启后，Chat 和 Agent 会在后续对话中按需回忆这些内容。
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles size={12} />
                  <span>使用方式：在对话中说“请记住……”，或让 AI 回忆之前记录过的信息。</span>
                </div>
              </div>
            </div>
          </div>

          {/* 未登录提示 */}
          {!isLoggedIn && (
            <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              登录后可使用本功能
            </div>
          )}

          {/* 记忆空间状态 */}
          <div className="rounded-lg bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Brain size={15} className="text-emerald-600 dark:text-emerald-400" />
                记忆空间
              </div>
              {hasCube ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  已创建
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">未创建</span>
              )}
            </div>

            {hasCube && (
              <div className="text-xs leading-5 text-muted-foreground">
                当前用户：{displayName || '未设置'}
              </div>
            )}
            {!hasCube && (
              <div className="text-xs leading-5 text-muted-foreground">
                开启后会自动创建记忆空间，无需手动配置。
              </div>
            )}

            <div className="flex items-center gap-2">
              {hasCube && (
                <Button size="sm" variant="outline" disabled={testing || !isLoggedIn} onClick={handleQueryCube}>
                  {testing ? <><Loader2 size={14} className="animate-spin mr-1.5" />检查中...</> : '检查记忆'}
                </Button>
              )}
            </div>
          </div>

          {/* 查询/创建结果 */}
          {testResult && (
            <div className={`rounded-lg p-3 text-sm ${testResult.success ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
              <div className={`flex items-start gap-2 ${testResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                {testResult.success ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
                <span className="font-medium">{testResult.message}</span>
              </div>
              {testResult.success && testResult.data && (testResult.data.facts.length > 0 || testResult.data.preferences.length > 0) && (
                <div className="mt-2 pl-6">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
                    {formatQueryResult(testResult.data)}
                  </pre>
                </div>
              )}
              {testResult.success && testResult.data && testResult.data.facts.length === 0 && testResult.data.preferences.length === 0 && (
                <div className="mt-2 pl-6 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lightbulb size={12} />
                  <span>个人记忆已就绪，暂无记忆内容。在 Chat 或 Agent 中说“请记住……”后会写入。</span>
                </div>
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
      <PersonalMemorySettings />
      <WebSearchSettings />
    </div>
  )
}
