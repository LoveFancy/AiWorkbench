/**
 * MemorySettings - 记忆设置页
 *
 * 管理本地 MemOS 服务配置和记忆立方创建。
 * Chat 和 Agent 模式共享同一份记忆配置。
 */

import * as React from 'react'
import { useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Box, CheckCircle2, XCircle, Loader2, Lightbulb, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { MemoryConfig, QueryCubeResult } from '@proma/shared'
import { SettingsSection, SettingsCard } from './primitives'
import { chatToolsAtom } from '@/atoms/chat-tool-atoms'

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

  /** 创建记忆立方（名称由后端自动处理） */
  const handleCreateCube = async (): Promise<void> => {
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
      await handleSave({ ...updated, enabled: true })
      toast.success('记忆立方创建成功')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[记忆设置] 创建立方失败:', error)
      setTestResult({ success: false, message: `创建立方失败: ${msg}` })
    } finally {
      setCreatingCube(false)
    }
  }

  /** 查询记忆立方内容（偏好和事实） */
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

  // 只要有 cubeId 即视为已创建立方（名称仅系统内部使用）
  const hasCube = !!config.cubeId

  return (
    <div className="space-y-8">
      <SettingsSection
        title="记忆"
        description="启用后 Chat 和 Agent 模式都可跨会话记住重要信息"
        action={
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => handleSave({ ...config, enabled: checked })}
            disabled={saving || !hasCube}
          />
        }
      >
        <SettingsCard divided={false}>
          <div className="space-y-4 p-4">
            {/* 引导说明 */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground space-y-1">
              <p>记忆功能由本地的 <span className="font-medium text-foreground">MemOS 服务</span> 提供。创建记忆立方后即可使用本功能，如有问题，可联系鲍亮(015562)。</p>
            </div>

            {/* 服务地址（只读展示） */}
            <div className="rounded-lg bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Info size={15} className="text-muted-foreground" />
                  服务地址
                </div>
                <code className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                  {config.serverUrl || 'http://168.64.22.211:8000'}
                </code>
              </div>
            </div>

            {/* 立方状态 */}
            <div className="rounded-lg bg-muted/30 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Box size={15} className="text-muted-foreground" />
                  记忆立方
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
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>ID: <code className="text-foreground/80">{config.cubeId}</code></div>
                </div>
              )}

              <div className="flex items-center gap-2">
                {!hasCube && (
                  <Button size="sm" onClick={handleCreateCube} disabled={creatingCube}>
                    {creatingCube ? <><Loader2 size={14} className="animate-spin mr-1.5" />创建中...</> : '创建记忆立方'}
                  </Button>
                )}
                {hasCube && (
                  <Button size="sm" variant="outline" disabled={testing} onClick={handleQueryCube}>
                    {testing ? <><Loader2 size={14} className="animate-spin mr-1.5" />查询中...</> : '测试连接'}
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
                    <span>立方已就绪，暂无记忆内容。使用 Chat 或 Agent 进行对话后将自动记录。</span>
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
