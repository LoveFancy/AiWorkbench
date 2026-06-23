/**
 * LocalApiSettings - 本地 API 服务设置页
 */

import * as React from 'react'
import { Copy, KeyRound, RefreshCw, RotateCcw, Server, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { SettingsCard, SettingsInput, SettingsRow, SettingsSection, SettingsSelect, SettingsToggle } from './primitives'
import { buildLocalApiCurlExample, getApiTokenActionLabel, getLocalApiExampleBaseUrl, getLocalApiStatusDisplay } from './LocalApiSettings.utils'
import type { PromaPermissionMode } from '@proma/shared'
import type { LocalApiPublicSettings, LocalApiSettings as LocalApiSettingsValue } from '../../../main/lib/local-api-types'

type LocalApiStatus = { running: boolean; url: string | null }

const PERMISSION_OPTIONS = [
  { value: 'auto', label: 'Ask（按权限规则确认）' },
  { value: 'plan', label: 'Plan（计划模式）' },
  { value: 'bypassPermissions', label: 'Bypass（跳过权限确认）' },
]

export function LocalApiSettings(): React.ReactElement {
  const [settings, setSettings] = React.useState<LocalApiPublicSettings | null>(null)
  const [status, setStatus] = React.useState<LocalApiStatus>({ running: false, url: null })
  const [portText, setPortText] = React.useState('17373')
  const [corsText, setCorsText] = React.useState('')
  const [maxConcurrentRunsText, setMaxConcurrentRunsText] = React.useState('')
  const [latestToken, setLatestToken] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const [nextSettings, nextStatus] = await Promise.all([
        window.electronAPI.getLocalApiSettings(),
        window.electronAPI.getLocalApiStatus(),
      ])
      setSettings(nextSettings)
      setStatus(nextStatus)
      setPortText(String(nextSettings.port))
      setCorsText(nextSettings.corsOrigins.join('\n'))
      setMaxConcurrentRunsText(nextSettings.maxConcurrentRuns == null ? '' : String(nextSettings.maxConcurrentRuns))
    } catch (error) {
      console.error('[本地 API 设置] 加载失败:', error)
      toast.error('加载本地 API 设置失败')
    }
  }, [])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  const save = React.useCallback(async (updates: Partial<LocalApiSettingsValue>) => {
    setSaving(true)
    try {
      const next = await window.electronAPI.updateLocalApiSettings(updates)
      const nextStatus = await window.electronAPI.getLocalApiStatus()
      setSettings(next)
      setStatus(nextStatus)
      setPortText(String(next.port))
      setCorsText(next.corsOrigins.join('\n'))
      setMaxConcurrentRunsText(next.maxConcurrentRuns == null ? '' : String(next.maxConcurrentRuns))
    } catch (error) {
      console.error('[本地 API 设置] 保存失败:', error)
      toast.error('保存本地 API 设置失败')
    } finally {
      setSaving(false)
    }
  }, [])

  const savePort = React.useCallback(() => {
    const port = Number(portText)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast.error('端口必须是 1-65535 的整数')
      setPortText(settings ? String(settings.port) : '17373')
      return
    }
    save({ port }).catch(() => {})
  }, [portText, save, settings])

  const saveCors = React.useCallback(() => {
    const corsOrigins = corsText
      .split('\n')
      .map((origin) => origin.trim())
      .filter(Boolean)
    save({ corsOrigins }).catch(() => {})
  }, [corsText, save])

  const saveMaxConcurrentRuns = React.useCallback(() => {
    const value = maxConcurrentRunsText.trim()
    if (!value) {
      save({ maxConcurrentRuns: null }).catch(() => {})
      return
    }
    const maxConcurrentRuns = Number(value)
    if (!Number.isInteger(maxConcurrentRuns) || maxConcurrentRuns < 0) {
      toast.error('最大并发会话数必须为空、0 或正整数')
      setMaxConcurrentRunsText(settings?.maxConcurrentRuns == null ? '' : String(settings.maxConcurrentRuns))
      return
    }
    if (maxConcurrentRuns === 0) {
      save({ maxConcurrentRuns: null }).catch(() => {})
      return
    }
    save({ maxConcurrentRuns }).catch(() => {})
  }, [maxConcurrentRunsText, save, settings])

  const resetToken = React.useCallback(async () => {
    const actionText = getApiTokenActionLabel(Boolean(settings?.hasApiToken))
    try {
      const result = await window.electronAPI.resetLocalApiToken()
      setSettings(result.publicSettings)
      setLatestToken(result.token)
      await navigator.clipboard.writeText(result.token)
      toast.success(`Token 已${actionText}并复制`)
    } catch (error) {
      console.error(`[本地 API 设置] ${actionText} Token 失败:`, error)
      toast.error(`${actionText} Token 失败`)
    }
  }, [settings])

  const copyToken = React.useCallback(async () => {
    if (!latestToken) return
    await navigator.clipboard.writeText(latestToken)
    toast.success('Token 已复制')
  }, [latestToken])

  const copyCurlExample = React.useCallback(async () => {
    if (!settings) return
    const baseUrl = getLocalApiExampleBaseUrl({
      statusUrl: status.url,
      settingsHost: settings.host,
      port: settings.port,
    })
    await navigator.clipboard.writeText(buildLocalApiCurlExample({ baseUrl, token: latestToken }))
    toast.success('调用示例已复制')
  }, [latestToken, settings, status.url])

  const saveDefaultPermissionMode = React.useCallback((value: string) => {
    const defaultPermissionMode = value as PromaPermissionMode
    save({
      defaultPermissionMode,
      allowBypassPermissions: defaultPermissionMode === 'bypassPermissions'
        ? true
        : settings?.allowBypassPermissions,
    }).catch(() => {})
  }, [save, settings])

  const saveAllowBypassPermissions = React.useCallback((allowBypassPermissions: boolean) => {
    save({
      allowBypassPermissions,
      defaultPermissionMode: !allowBypassPermissions && settings?.defaultPermissionMode === 'bypassPermissions'
        ? 'auto'
        : settings?.defaultPermissionMode,
    }).catch(() => {})
  }, [save, settings])

  if (!settings) {
    return (
      <SettingsSection title="本地 API 服务" description="正在加载配置...">
        <SettingsCard>
          <SettingsRow label="加载中" description="请稍候" />
        </SettingsCard>
      </SettingsSection>
    )
  }

  const effectiveHost = settings.allowRemoteAccess ? '0.0.0.0' : '127.0.0.1'
  const apiExampleBaseUrl = getLocalApiExampleBaseUrl({
    statusUrl: status.url,
    settingsHost: settings.host,
    port: settings.port,
  })
  const apiCurlExample = buildLocalApiCurlExample({ baseUrl: apiExampleBaseUrl, token: latestToken })
  const serviceStatus = getLocalApiStatusDisplay(status)

  return (
    <div className="space-y-6">
      <SettingsSection
        title="本地 API 服务"
        description="为本机脚本、自动化程序和外部工具提供 Agent REST + SSE 接口。"
      >
        <SettingsCard divided>
          <SettingsRow
            label="启用本地 API 服务"
            description={serviceStatus.description}
          >
            <div className="flex items-center gap-3">
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
                serviceStatus.tone === 'running'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground',
              )}>
                <span className={cn(
                  'size-2 rounded-full',
                  serviceStatus.tone === 'running' ? 'bg-emerald-500' : 'bg-muted-foreground/50',
                )} />
                {serviceStatus.label}
              </span>
              <Switch
                checked={settings.enabled}
                disabled={saving}
                onCheckedChange={(enabled) => save({ enabled }).catch(() => {})}
              />
            </div>
          </SettingsRow>
          <SettingsRow
            label="API Token"
            icon={<Server size={16} className="text-muted-foreground" />}
            description={settings.hasApiToken ? 'Token 已设置；明文只在重置时显示一次。' : '还没有 Token，请先生成后再启用或调用接口。'}
          >
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={resetToken}>
                {settings.hasApiToken ? (
                  <RotateCcw size={14} className="mr-1.5" />
                ) : (
                  <KeyRound size={14} className="mr-1.5" />
                )}
                {getApiTokenActionLabel(settings.hasApiToken)}
              </Button>
              <Button size="sm" variant="outline" disabled={!latestToken} onClick={copyToken}>
                <Copy size={14} className="mr-1.5" />
                复制
              </Button>
            </div>
          </SettingsRow>
          {latestToken && (
            <div className="px-4 py-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">新 Token</div>
              <Input value={latestToken} readOnly className="font-mono text-xs" />
            </div>
          )}
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">调用示例</div>
                <p className="text-xs text-muted-foreground">
                  先创建 Agent 会话；如果未显示明文 Token，请将 <span className="font-mono">&lt;API_TOKEN&gt;</span> 替换为刚生成的 Token。
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={copyCurlExample}>
                <Copy size={14} className="mr-1.5" />
                复制示例
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-md bg-muted/70 p-3 text-xs leading-relaxed text-muted-foreground">
              <code>{apiCurlExample}</code>
            </pre>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="监听与访问" description={settings.allowRemoteAccess ? '远程访问已开启，请确认网络环境可信。' : '当前只开放本机访问；远程访问需要显式开启。'}>
        <SettingsCard divided>
          <SettingsToggle
            label="允许远程访问"
            description={settings.allowRemoteAccess ? '当前将监听 0.0.0.0，请确认网络环境可信。' : '关闭时固定监听 127.0.0.1。'}
            checked={settings.allowRemoteAccess}
            disabled={saving}
            onCheckedChange={(allowRemoteAccess) => save({ allowRemoteAccess, host: allowRemoteAccess ? '0.0.0.0' : '127.0.0.1' }).catch(() => {})}
          />
          {settings.allowRemoteAccess && (
            <SettingsRow
              label="远程访问风险"
              icon={<ShieldAlert size={16} className="text-amber-500" />}
              description="Bearer Token 会保护接口，但远程网络暴露仍可能放大风险。"
            />
          )}
          <SettingsRow label="监听地址" description="由远程访问开关控制。">
            <span className="font-mono text-sm text-muted-foreground">{effectiveHost}</span>
          </SettingsRow>
          <SettingsInput
            label="端口"
            description="端口变化后会热重启 HTTP Server。"
            value={portText}
            type="number"
            onChange={setPortText}
            onBlur={savePort}
            disabled={saving}
          />
          <div className="px-4 py-3 space-y-2">
            <div className="text-sm font-medium">CORS 允许来源</div>
            <textarea
              className="min-h-[96px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={corsText}
              placeholder="https://example.com"
              onChange={(event) => setCorsText(event.target.value)}
              onBlur={saveCors}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">每行一个 Origin；留空时不返回宽松 CORS header。</p>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="权限与运行" description="本地 API 复用 Agent 现有权限和并发边界。">
        <SettingsCard divided>
          <SettingsSelect
            label="默认权限模式"
            description="请求未指定 permissionMode 时使用。Ask/auto 会按桌面端权限规则确认；无人值守写操作才需要 Bypass。"
            value={settings.defaultPermissionMode}
            options={PERMISSION_OPTIONS}
            disabled={saving}
            onValueChange={saveDefaultPermissionMode}
          />
          <SettingsToggle
            label="允许 API 使用 bypassPermissions"
            description={settings.defaultPermissionMode === 'bypassPermissions'
              ? '关闭时会自动把默认权限模式切回 Ask/auto。'
              : '关闭时，请求传入 bypassPermissions 会返回 403；其他权限模式仍可调用。'}
            checked={settings.allowBypassPermissions}
            disabled={saving}
            onCheckedChange={saveAllowBypassPermissions}
          />
          <SettingsInput
            label="最大并发会话数"
            description="留空或 0 表示不额外限制，仍保留同会话互斥。"
            value={maxConcurrentRunsText}
            type="number"
            onChange={setMaxConcurrentRunsText}
            onBlur={saveMaxConcurrentRuns}
            disabled={saving}
          />
          <SettingsToggle
            label="请求日志"
            description="记录路径、状态码、耗时、sessionId/runId，不记录完整 prompt 或 token。"
            checked={settings.requestLoggingEnabled}
            disabled={saving}
            onCheckedChange={(requestLoggingEnabled) => save({ requestLoggingEnabled }).catch(() => {})}
          />
        </SettingsCard>
      </SettingsSection>

      <div className="flex justify-end">
        <Button variant="outline" onClick={load}>
          <RefreshCw size={14} className="mr-1.5" />
          刷新状态
        </Button>
      </div>
    </div>
  )
}
