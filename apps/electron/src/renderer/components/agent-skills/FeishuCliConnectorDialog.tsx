/**
 * FeishuCliConnectorDialog — 飞书连接器弹窗
 *
 * QClaw 兼容流程：
 *  1. registerFeishuCliApp() → SDK registerApp → 扫码创建应用 → 拿到 appId + appSecret
 *  2. startFeishuDeviceAuth(appId, appSecret) → device_code + URL
 *  3. 用户浏览器确认授权
 *  4. pollFeishuDeviceAuth → Phase-1/Phase-2 → 拿到 user token
 *
 * 用户全程无需手动填写凭证。
 */

import * as React from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, XCircle, Bird, Copy, ExternalLink } from 'lucide-react'

type AuthStep = 'idle' | 'registering' | 'authorizing' | 'done' | 'error'

export function FeishuCliConnectorDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}): React.ReactElement {
  const [step, setStep] = React.useState<AuthStep>('idle')
  const [verificationUri, setVerificationUri] = React.useState('')
  const [stepLabel, setStepLabel] = React.useState('')
  const [userName, setUserName] = React.useState<string | null>(null)
  const [errorMessage, setErrorMessage] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef = React.useRef(false)
  const curPhaseRef = React.useRef(1)
  const curDeviceCodeRef = React.useRef('')
  const curAppIdRef = React.useRef('')
  const curAppSecretRef = React.useRef('')
  const cleanupListenersRef = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    if (!open) {
      resetState()
      return
    }
    cancelledRef.current = false
    window.electronAPI.getFeishuCliAuthStatus().then((state) => {
      if (state.status === 'connected') {
        setStep('done')
        setUserName(state.userName ?? null)
      }
    }).catch(() => {})
    return () => {
      stopPolling()
      cleanupListenersRef.current?.()
    }
  }, [open])

  const resetState = (): void => {
    cancelledRef.current = true
    stopPolling()
    cleanupListenersRef.current?.()
    cleanupListenersRef.current = null
    window.electronAPI.cancelFeishuCliRegister().catch(() => {})
    setStep('idle')
    setVerificationUri('')
    setStepLabel('')
    setUserName(null)
    setErrorMessage('')
    setLoading(false)
    curPhaseRef.current = 1
    curDeviceCodeRef.current = ''
    curAppIdRef.current = ''
    curAppSecretRef.current = ''
  }

  const stopPolling = (): void => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  const handleCopyUrl = (): void => {
    navigator.clipboard.writeText(verificationUri).then(() => {
      toast.success('链接已复制')
    }).catch(() => {
      toast.error('复制失败')
    })
  }

  const handleOpenUrl = (): void => {
    window.electronAPI.openExternal(verificationUri)
  }

  /** OAuth 设备授权 + 轮询 */
  const startDeviceAuthPolling = (appId: string, appSecret: string, deviceCode: string, phase: number, interval: number): void => {
    stopPolling()
    curDeviceCodeRef.current = deviceCode
    curPhaseRef.current = phase

    let attempts = 0
    const maxAttempts = Math.ceil(600 / interval) + 10

    pollingRef.current = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts) { stopPolling(); fail('授权超时，请重试'); return }

      try {
        const r = await window.electronAPI.pollFeishuDeviceAuth(appId, appSecret, curDeviceCodeRef.current, curPhaseRef.current)

        if (!r.pending) {
          stopPolling()
          if (cancelledRef.current) return
          setStep('done')
          setUserName(r.userName ?? null)
          setLoading(false)
          toast.success('飞书已连接')
          onSaved()
          return
        }

        if (r.phase === 2 && r.deviceCode && r.verificationUri) {
          stopPolling()
          if (cancelledRef.current) return
          setStep('authorizing')
          setStepLabel('请在浏览器中再次确认授权（已自动打开链接）')
          setVerificationUri(r.verificationUri)
          // 自动打开链接
          window.electronAPI.openExternal(r.verificationUri)
          startDeviceAuthPolling(appId, appSecret, r.deviceCode, 2, r.interval ?? 5)
        }
      } catch (e) {
        stopPolling()
        fail(e instanceof Error ? e.message : String(e))
      }
    }, interval * 1000)
  }

  /** 发起设备授权 */
  const startOAuthFlow = async (appId: string, appSecret: string): Promise<void> => {
    if (cancelledRef.current) return
    setStep('authorizing')
    setStepLabel('正在生成授权链接...')

    try {
      const dc = await window.electronAPI.startFeishuDeviceAuth(appId, appSecret)
      if (cancelledRef.current) return
      setVerificationUri(dc.verificationUri)
      setStepLabel('已自动打开浏览器，请在浏览器中确认授权飞书权限')
      // 自动打开链接
      window.electronAPI.openExternal(dc.verificationUri)
      startDeviceAuthPolling(appId, appSecret, dc.deviceCode, 1, dc.interval)
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    }
  }

  /** 开始连接：先检测本地配置，已有则跳过 */
  const startConnect = async (): Promise<void> => {
    resetState()
    cancelledRef.current = false
    setLoading(true)

    // 先检测是否已有有效配置
    try {
      const status = await window.electronAPI.getFeishuCliAuthStatus()
      if (status.status === 'connected') {
        if (cancelledRef.current) return
        setStep('done')
        setUserName(status.userName ?? null)
        setLoading(false)
        toast.success('飞书已连接')
        onSaved()
        return
      }
    } catch { /* 继续正常流程 */ }

    if (cancelledRef.current) return

    setStep('registering')
    setStepLabel('正在初始化...')

    try {
      // 设置 SDK 事件监听
      const unsubQr = window.electronAPI.onFeishuCliRegisterQrcode(({ url }) => {
        setVerificationUri(url)
        setStepLabel('已自动打开浏览器，请扫码创建飞书应用')
        window.electronAPI.openExternal(url)
      })

      const unsubStatus = window.electronAPI.onFeishuCliRegisterStatus(({ status }) => {
        if (status === 'polling') {
          setStepLabel('等待扫码确认...')
        } else if (status === 'slow_down') {
          setStepLabel('扫码确认中，请稍候...')
        } else if (status === 'domain_switched') {
          setStepLabel('正在切换域名...')
        }
      })

      cleanupListenersRef.current = () => {
        unsubQr()
        unsubStatus()
      }

      // 调用 SDK registerApp（阻塞直至用户扫码完成）
      const reg = await window.electronAPI.registerFeishuCliApp()
      if (cancelledRef.current) return
      curAppIdRef.current = reg.appId
      curAppSecretRef.current = reg.appSecret

      // 清理监听器，进入设备授权阶段
      cleanupListenersRef.current?.()
      cleanupListenersRef.current = null

      await startOAuthFlow(reg.appId, reg.appSecret)

    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    }
  }

  const fail = (msg: string): void => {
    if (cancelledRef.current) return
    // 脱敏：隐藏可能包含的 appSecret/token 等敏感信息
    const safe = msg.length > 200 ? msg.slice(0, 200) + '...' : msg
    setStep('error')
    setErrorMessage(safe)
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-2xl border-0 p-8 shadow-2xl">
        <DialogTitle className="text-2xl font-semibold tracking-normal">连接飞书</DialogTitle>
        <DialogDescription className="sr-only">一键连接飞书，Agent 将获得飞书办公协同能力。</DialogDescription>

        <div className="mt-2 flex items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-blue-500/12 text-blue-500">
            <Bird size={28} />
          </div>
          <div className="space-y-2">
            <div className="text-[15px] font-medium text-foreground">飞书连接器</div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              自动创建飞书自建应用并获取授权，无需手动填写凭证。Agent 将以您的身份操作飞书数据。
            </p>
          </div>
        </div>

        {step === 'idle' && (
          <div className="mt-6">
            <Button type="button" className="w-full" disabled={loading} onClick={startConnect}>
              {loading ? <><Loader2 size={16} className="mr-2 animate-spin" />正在初始化...</> : '开始连接'}
            </Button>
          </div>
        )}

        {(step === 'registering' || step === 'authorizing') && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-center py-2">
              <Loader2 size={48} className="animate-spin text-blue-500" />
            </div>
            <div className="text-center text-sm text-foreground font-medium">{stepLabel}</div>
            <div className="text-center text-xs text-muted-foreground">
              {step === 'registering'
                ? '扫码后将自动进入授权步骤'
                : curPhaseRef.current === 2
                  ? 'Phase-2: 再次确认以获取用户令牌'
                  : '授权完成后将自动完成连接'}
            </div>

            {verificationUri && (
              <>
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">授权链接</div>
                  <div className="break-all text-xs text-foreground/80 font-mono leading-relaxed">{verificationUri}</div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={handleCopyUrl}>
                    <Copy size={14} className="mr-1.5" />复制链接
                  </Button>
                  <Button type="button" variant="outline" className="flex-1" onClick={handleOpenUrl}>
                    <ExternalLink size={14} className="mr-1.5" />在浏览器中打开
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-center py-4">
              <CheckCircle2 size={48} className="text-green-500" />
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-foreground">飞书已连接</div>
              {userName && <div className="mt-1 text-xs text-muted-foreground">用户：{userName}</div>}
            </div>
            <div className="rounded-xl bg-green-500/8 p-4">
              <div className="text-xs text-green-700 dark:text-green-400">
                lark-cli 可使用授权凭据调用飞书 API。Agent 将以您的身份操作飞书数据。
              </div>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={startConnect}>更换连接</Button>
          </div>
        )}

        {step === 'error' && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-center py-4">
              <XCircle size={48} className="text-red-500" />
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-foreground">连接失败</div>
              {errorMessage && <div className="mt-1 text-xs text-muted-foreground break-all">{errorMessage}</div>}
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={startConnect}>重试</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
