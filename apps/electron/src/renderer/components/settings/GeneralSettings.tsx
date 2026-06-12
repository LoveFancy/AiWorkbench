/**
 * GeneralSettings - 通用设置页
 *
 * 顶部：用户档案编辑（头像 + 用户名）
 * 下方：语言等通用设置
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { Camera, FolderOpen, ImagePlus, RotateCw, Volume2 } from 'lucide-react'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsToggle,
} from './primitives'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { UserAvatar } from '../chat/UserAvatar'
import { userProfileAtom } from '@/atoms/user-profile'
import {
  notificationsEnabledAtom,
  notificationSoundEnabledAtom,
  notificationSoundsAtom,
  updateNotificationsEnabled,
  updateNotificationSoundEnabled,
  updateNotificationSound,
  playNotificationSound,
  NOTIFICATION_SOUNDS,
  DEFAULT_NOTIFICATION_SOUNDS,
} from '@/atoms/notifications'
import {
  stickyUserMessageEnabledAtom,
  updateStickyUserMessageEnabled,
} from '@/atoms/ui-preferences'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { ProxySettings } from './ProxySettings'
import { StorageSettings } from './StorageSettings'
import type { ConfigRootInfo, NotificationSoundId, NotificationSoundType, NotificationSoundSettings } from '@/types/settings'

/** emoji-mart 选择回调的 emoji 对象类型 */
interface EmojiMartEmoji {
  id: string
  name: string
  native: string
  unified: string
  keywords: string[]
  shortcodes: string
}

export function GeneralSettings(): React.ReactElement {
  const [userProfile, setUserProfile] = useAtom(userProfileAtom)
  const [notificationsEnabled, setNotificationsEnabled] = useAtom(notificationsEnabledAtom)
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useAtom(notificationSoundEnabledAtom)
  const [notificationSounds, setNotificationSounds] = useAtom(notificationSoundsAtom)
  const [stickyUserMessageEnabled, setStickyUserMessageEnabled] = useAtom(stickyUserMessageEnabledAtom)
  const [isEditingName, setIsEditingName] = React.useState(false)
  const [nameInput, setNameInput] = React.useState(userProfile.userName)
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false)
  const [archiveAfterDays, setArchiveAfterDays] = React.useState<number>(7)
  const [configRootInfo, setConfigRootInfo] = React.useState<ConfigRootInfo | null>(null)
  const [configRootError, setConfigRootError] = React.useState<string | null>(null)
  const [isConfigRootBusy, setIsConfigRootBusy] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // 快捷导航
  const sectionRefs = React.useRef<Record<string, HTMLDivElement | null>>({})
  const navItems = [
    { id: 'profile', label: '用户档案' },
    { id: 'basic', label: '基本配置' },
    { id: 'proxy', label: '代理配置' },
    { id: 'storage', label: '磁盘管理' },
  ]
  const scrollToSection = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 加载归档天数设置
  React.useEffect(() => {
    Promise.all([
      window.electronAPI.getSettings(),
      window.electronAPI.getConfigRootInfo(),
    ]).then(([settings, rootInfo]) => {
      setArchiveAfterDays(settings.archiveAfterDays ?? 7)
      setConfigRootInfo(rootInfo)
    }).catch(console.error)
  }, [])

  /** 更新归档天数 */
  const handleArchiveDaysChange = async (value: string): Promise<void> => {
    const days = parseInt(value, 10)
    setArchiveAfterDays(days)
    try {
      await window.electronAPI.updateSettings({ archiveAfterDays: days })
    } catch (error) {
      console.error('[通用设置] 更新归档天数失败:', error)
    }
  }

  /** 更新头像 */
  const handleAvatarChange = async (avatar: string): Promise<void> => {
    try {
      const updated = await window.electronAPI.updateUserProfile({ avatar })
      setUserProfile(updated)
      setShowEmojiPicker(false)
    } catch (error) {
      console.error('[通用设置] 更新头像失败:', error)
    }
  }

  /** 上传图片作为头像 */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      await handleAvatarChange(dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  /** 保存用户名 */
  const handleSaveName = async (): Promise<void> => {
    const trimmed = nameInput.trim()
    if (!trimmed) return

    try {
      const updated = await window.electronAPI.updateUserProfile({ userName: trimmed })
      setUserProfile(updated)
      setIsEditingName(false)
    } catch (error) {
      console.error('[通用设置] 更新用户名失败:', error)
    }
  }

  /** 选择应用数据目录 */
  const handleChooseConfigRoot = async (): Promise<void> => {
    setIsConfigRootBusy(true)
    setConfigRootError(null)
    try {
      const info = await window.electronAPI.chooseConfigRoot()
      if (info) setConfigRootInfo(info)
    } catch (error) {
      console.error('[通用设置] 设置数据目录失败:', error)
      setConfigRootError(error instanceof Error ? error.message : '设置数据目录失败')
    } finally {
      setIsConfigRootBusy(false)
    }
  }

  /** 完整重启应用，使数据目录变更真正生效 */
  const handleRelaunchApp = async (): Promise<void> => {
    setIsConfigRootBusy(true)
    try {
      await window.electronAPI.relaunchApp()
    } catch (error) {
      console.error('[通用设置] 重启应用失败:', error)
      setConfigRootError(error instanceof Error ? error.message : '重启应用失败')
      setIsConfigRootBusy(false)
    }
  }

  /** 用户名编辑键盘事件 */
  const handleNameKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      handleSaveName()
    } else if (e.key === 'Escape') {
      setNameInput(userProfile.userName)
      setIsEditingName(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 快捷导航 */}
      <div className="sticky top-0 z-10 -mx-2 px-2 pt-2 pb-1 bg-content-area/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              className="shrink-0 px-3 py-1.5 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 用户档案区域 */}
      <div ref={(el) => { sectionRefs.current['profile'] = el }}>
      <SettingsSection
        title="用户档案"
        description="设置你的头像和显示名称"
      >
        <SettingsCard>
          <div className="flex items-center gap-5 px-4 py-4">
            {/* 头像 + Popover emoji 选择器 */}
            <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
              <PopoverTrigger asChild>
                <div className="relative group/avatar cursor-pointer">
                  <UserAvatar avatar={userProfile.avatar} size={64} />
                  {/* 编辑覆盖层 */}
                  <div
                    className={cn(
                      'absolute inset-0 rounded-[20%] flex items-center justify-center',
                      'bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity'
                    )}
                  >
                    <Camera className="size-5 text-white" />
                  </div>
                </div>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                sideOffset={12}
                className="w-auto p-0 border-none shadow-xl"
              >
                <Picker
                  data={data}
                  onEmojiSelect={(emoji: EmojiMartEmoji) => handleAvatarChange(emoji.native)}
                  locale="zh"
                  theme="auto"
                  previewPosition="none"
                  skinTonePosition="search"
                  perLine={8}
                />
                {/* 上传自定义图片 */}
                <div className="px-3 p-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px]',
                      'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] transition-colors'
                    )}
                  >
                    <ImagePlus className="size-4" />
                    上传自定义图片
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              </PopoverContent>
            </Popover>

            {/* 用户名 */}
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={handleNameKeyDown}
                  maxLength={30}
                  autoFocus
                  className={cn(
                    'text-lg font-semibold text-foreground bg-transparent border-b-2 border-primary',
                    'outline-none w-full max-w-[200px] pb-0.5'
                  )}
                />
              ) : (
                <button
                  onClick={() => {
                    setNameInput(userProfile.userName)
                    setIsEditingName(true)
                  }}
                  className="text-lg font-semibold text-foreground hover:text-primary transition-colors text-left"
                >
                  {userProfile.userName}
                </button>
              )}
              <p className="text-[12px] text-foreground/40 mt-0.5">
                点击头像更换，点击名字编辑
              </p>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>
      </div>

      {/* 基本配置 */}
      <div ref={(el) => { sectionRefs.current['basic'] = el }}>
      <SettingsSection
        title="基本配置"
        description="应用的基本配置"
      >
        <SettingsCard>
          <SettingsRow
            label="语言"
            description="更多语言支持即将推出"
          >
            <span className="text-[13px] text-foreground/40">简体中文</span>
          </SettingsRow>
          <SettingsRow
            label="数据目录"
            description="保存会话、工作区、附件、SDK 配置和集成配置"
          >
            <div className="flex w-[480px] max-w-[52vw] items-center justify-end gap-3">
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden">
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    configRootInfo?.pendingPath
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'bg-foreground/5 text-foreground/50'
                  )}
                >
                  {configRootInfo?.pendingPath ? '待生效' : '当前'}
                </span>
                <span
                  className="min-w-0 truncate font-mono text-[13px] text-foreground/75"
                  title={configRootInfo?.pendingPath ?? configRootInfo?.currentPath}
                >
                  {configRootInfo?.pendingPath ?? configRootInfo?.currentPath ?? '加载中...'}
                </span>
                {configRootError ? (
                  <span className="shrink-0 text-[12px] text-destructive">{configRootError}</span>
                ) : configRootInfo?.requiresRestart ? (
                  <span className="shrink-0 text-[12px] text-amber-600 dark:text-amber-400">重启后生效</span>
                ) : null}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5 rounded-md px-3 text-[12px]"
                disabled={isConfigRootBusy}
                onClick={handleChooseConfigRoot}
              >
                <FolderOpen size={14} />
                选择目录
              </Button>
              {configRootInfo?.requiresRestart && (
                <Button
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 rounded-md px-3 text-[12px]"
                  disabled={isConfigRootBusy}
                  onClick={handleRelaunchApp}
                >
                  <RotateCw size={14} />
                  立即重启
                </Button>
              )}
            </div>
          </SettingsRow>
          <SettingsToggle
            label="桌面通知"
            description="Agent 完成任务或需要操作时发送通知"
            checked={notificationsEnabled}
            onCheckedChange={(checked) => {
              setNotificationsEnabled(checked)
              updateNotificationsEnabled(checked)
            }}
          />
          <SettingsToggle
            label="通知提示音"
            description="阻塞操作（权限确认、问题回答、计划审批）触发时播放提示音"
            checked={notificationSoundEnabled}
            disabled={!notificationsEnabled}
            onCheckedChange={(checked) => {
              setNotificationSoundEnabled(checked)
              updateNotificationSoundEnabled(checked)
            }}
          />
          <SoundPicker
            label="任务完成音效"
            type="taskComplete"
            sounds={notificationSounds}
            disabled={!notificationsEnabled || !notificationSoundEnabled}
            onSoundChange={async (type, soundId) => {
              const newSounds = await updateNotificationSound(type, soundId, notificationSounds)
              setNotificationSounds(newSounds)
            }}
          />
          <SoundPicker
            label="权限审批音效"
            type="permissionRequest"
            sounds={notificationSounds}
            disabled={!notificationsEnabled || !notificationSoundEnabled}
            onSoundChange={async (type, soundId) => {
              const newSounds = await updateNotificationSound(type, soundId, notificationSounds)
              setNotificationSounds(newSounds)
            }}
          />
          <SoundPicker
            label="计划审批音效"
            type="exitPlanMode"
            sounds={notificationSounds}
            disabled={!notificationsEnabled || !notificationSoundEnabled}
            onSoundChange={async (type, soundId) => {
              const newSounds = await updateNotificationSound(type, soundId, notificationSounds)
              setNotificationSounds(newSounds)
            }}
          />
          <SettingsRow
            label="自动归档"
            description="超过指定天数未更新的对话将自动归档（置顶对话除外）"
          >
            <Select value={String(archiveAfterDays)} onValueChange={handleArchiveDaysChange}>
              <SelectTrigger className="w-[120px] h-8 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">禁用</SelectItem>
                <SelectItem value="7">7 天</SelectItem>
                <SelectItem value="14">14 天</SelectItem>
                <SelectItem value="30">30 天</SelectItem>
                <SelectItem value="60">60 天</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsToggle
            label="消息悬浮置顶条"
            description="滚动浏览对话时，在顶部显示最近的用户消息摘要"
            checked={stickyUserMessageEnabled}
            onCheckedChange={(checked) => {
              setStickyUserMessageEnabled(checked)
              updateStickyUserMessageEnabled(checked)
            }}
          />
        </SettingsCard>
      </SettingsSection>
      </div>

      {/* 代理配置 */}
      <div ref={(el) => { sectionRefs.current['proxy'] = el }}>
      <ProxySettings />
      </div>

      {/* 磁盘管理 */}
      <div ref={(el) => { sectionRefs.current['storage'] = el }}>
      <StorageSettings />
      </div>
    </div>
  )
}

// ===== SoundPicker 内部组件 =====

interface SoundPickerProps {
  label: string
  type: NotificationSoundType
  sounds: NotificationSoundSettings
  disabled: boolean
  onSoundChange: (type: NotificationSoundType, soundId: NotificationSoundId) => void
}

/** 单个场景的通知音选择器（下拉 + 试听按钮） */
function SoundPicker({ label, type, sounds, disabled, onSoundChange }: SoundPickerProps): React.ReactElement {
  const currentId = sounds[type] ?? DEFAULT_NOTIFICATION_SOUNDS[type]

  return (
    <SettingsRow label={label}>
      <div className="flex items-center gap-1.5">
        <Select
          value={currentId}
          onValueChange={(value) => onSoundChange(type, value as NotificationSoundId)}
          disabled={disabled}
        >
          <SelectTrigger className="w-[130px] h-8 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NOTIFICATION_SOUNDS.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
            <SelectItem value="none">无</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={disabled || currentId === 'none'}
          onClick={() => playNotificationSound(currentId)}
          title="试听"
        >
          <Volume2 size={14} />
        </Button>
      </div>
    </SettingsRow>
  )
}
