/**
 * MemorySettings - 记忆设置页
 *
 * 管理本地 MemOS 服务配置和个人记忆创建。
 * Chat 和 Agent 模式共享同一份记忆配置。
 */

import * as React from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { toast } from 'sonner'
import { Brain, CheckCircle2, XCircle, Loader2, Lightbulb, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { MemoryConfig, QueryCubeResult } from '@proma/shared'
import { SettingsSection, SettingsCard } from './primitives'
import { chatToolsAtom } from '@/atoms/chat-tool-atoms'
import { isLoggedInAtom, authStateAtom } from '@/auth/renderer'
import { userProfileAtom } from '@/atoms/user-profile'

/** 刷新全局工具列表 atom */
async function refreshChatTools(setter: (tools: Awaited<ReturnType<typeof window.electronAPI.getChatTools>>) => void): Promise<void> {
  try {
    const tools = await window.electronAPI.getChatTools()
    setter(tools)
  } catch (err) {
    console.error('[MemorySettings] 刷新工具列表失败:', err)
  }
}

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

export function MemorySettings(): React.ReactElement {
  const [config, setConfig] = React.useState<MemoryConfig>({
    enabled: false,
    serverUrl: 'http://168.64.22.211:8000',
    cubeId: '',
    ownerId: 'root',
    cubeName: '',
    apiKey: '',
    userId: '',
  })
  const [saving, setSaving] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [creatingCube, setCreatingCube] = React.useState(false)
  const setChatTools = useSetAtom(chatToolsAtom)
  const isLoggedIn = useAtomValue(isLoggedInAtom)
  const authState = useAtomValue(authStateAtom)
  const userProfile = useAtomValue(userProfileAtom)
  const displayName = authState.jobId?.trim() || userProfile.userName

  // 连接测试状态
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<{ success: boolean; message: string; data?: QueryCubeResult } | null>(null)

  // 加载全局配置
  React.useEffect(() => {
    window.electronAPI.getMemoryConfig()
      .then((c) => setConfig(c))
      .catch((err) => console.error('[记忆设置] 加载失败:', err))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (updated: MemoryConfig): Promise<void> => {
    setSaving(true)
    try {
      await window.electronAPI.setMemoryConfig(updated)
      await window.electronAPI.updateChatToolState('memory', { enabled: updated.enabled })
      setConfig(updated)
      await refreshChatTools(setChatTools)
      toast.success('记忆设置已保存')
    } catch (error) {
      console.error('[记忆设置] 保存失败:', error)
    } finally {
      setSaving(false)
    }
  }

  /** 确保个人记忆空间已创建（名称由后端自动处理） */
  const ensurePersonalMemoryCreated = async (): Promise<MemoryConfig> => {
    if (config.cubeId) return config

    setCreatingCube(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.createMemoryCube()
      const updated = {
        ...config,
        cubeId: result.cubeId,
        ownerId: result.ownerId,
        cubeName: result.cubeName,
      }
      setConfig(updated)
      return updated
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[记忆设置] 初始化个人记忆失败:', error)
      setTestResult({ success: false, message: `初始化个人记忆失败: ${msg}` })
      throw error
    } finally {
      setCreatingCube(false)
    }
  }

  const handleToggle = async (checked: boolean): Promise<void> => {
    setTestResult(null)
    try {
      const nextConfig = checked ? await ensurePersonalMemoryCreated() : config
      await handleSave({ ...nextConfig, enabled: checked })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setTestResult({ success: false, message: `开启个人记忆失败: ${msg}` })
    }
  }

  /** 查询个人记忆内容（偏好和事实） */
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

  // 只要有 cubeId 即视为已创建个人记忆（名称仅系统内部使用）
  const hasCube = !!config.cubeId

  return (
    <div className="space-y-8">
      <SettingsSection
        title="个人记忆"
        description="跨会话保存你的偏好、事实和长期上下文"
        action={
          <Switch
            checked={config.enabled}
            onCheckedChange={handleToggle}
            disabled={saving || creatingCube || !isLoggedIn}
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
                {/* 展示偏好和事实详情 */}
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
    </div>
  )
}
