/**
 * UserAccountMenu - 左下角账户快捷面板
 *
 * 仅承载账户相关快捷操作，避免 LeftSidebar 在展开/收起状态重复维护菜单内容。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import {
  Check,
  Copy,
  HelpCircle,
  LogIn,
  LogOut,
  Palette,
  RefreshCw,
  Settings,
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/chat/UserAvatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { settingsOpenAtom, settingsTabAtom } from '@/atoms/settings-tab'
import { issueReportOpenAtom } from '@/atoms/issue-report'
import { checkForUpdates } from '@/atoms/updater'
import {
  themeModeAtom,
  themeStyleAtom,
  updateThemeMode,
  updateThemeStyle,
} from '@/atoms/theme'
import type { UserProfile } from '../../../types'

interface UserAccountMenuProps {
  userProfile: UserProfile
  jobId?: string
  hasAttention?: boolean
  triggerClassName?: string
  contentAlign?: 'start' | 'center' | 'end'
  collapsed?: boolean
  onOpenChange?: (open: boolean) => void
  onOpenManual: () => void
  onLogout: () => void | Promise<void>
}

interface GuestAccountMenuProps {
  hasAttention?: boolean
  contentAlign?: 'start' | 'center' | 'end'
  collapsed?: boolean
  onOpenManual: () => void
  onLogin: () => void
}

const ACCOUNT_MENU_CONTENT_CLASS = cn(
  'z-[9999] w-[300px] overflow-hidden rounded-[22px] border border-border/70 bg-popover/98 p-0 text-popover-foreground shadow-[0_24px_64px_rgba(15,23,42,0.18)] ring-1 ring-black/5 backdrop-blur-xl',
  'dark:border-white/10 dark:bg-dialog/95 dark:shadow-[0_28px_72px_rgba(0,0,0,0.58)] dark:ring-white/10',
)

export function UserAccountMenu({
  userProfile,
  jobId,
  hasAttention = false,
  triggerClassName,
  contentAlign = 'start',
  collapsed = false,
  onOpenChange,
  onOpenManual,
  onLogout,
}: UserAccountMenuProps): React.ReactElement {
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)
  const setIssueReportOpen = useSetAtom(issueReportOpenAtom)
  const accountText = jobId?.trim() || userProfile.userName

  const openSettings = React.useCallback((tab: 'general' | 'appearance' | 'about' = 'general') => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }, [setSettingsOpen, setSettingsTab])

  const handleCopyAccount = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(accountText)
      toast.success('账号已复制')
    } catch {
      toast.error('复制账号失败')
    }
  }, [accountText])

  const handleCheckUpdates = React.useCallback(() => {
    void checkForUpdates()
    openSettings('about')
  }, [openSettings])

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="用户菜单"
          className={cn(
            'relative titlebar-no-drag transition-colors',
            collapsed
              ? 'size-10 flex items-center justify-center rounded-[12px] hover:bg-foreground/5'
              : 'flex-1 flex items-center gap-3 min-w-0 px-3 py-2 rounded-[10px] text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground',
            triggerClassName,
          )}
        >
          <div className="relative flex-shrink-0">
            <UserAvatar avatar={userProfile.avatar} size={28} />
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
          </div>
          {!collapsed && (
            <span className="flex-1 truncate text-left text-sm">
              {accountText}
            </span>
          )}
          {hasAttention && (
            <span className={cn(
              'absolute size-2 rounded-full bg-red-500',
              collapsed ? 'right-0 top-0' : 'right-2 top-2',
            )} />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align={contentAlign}
        sideOffset={12}
        className={ACCOUNT_MENU_CONTENT_CLASS}
      >
        <div className="px-4 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <UserAvatar avatar={userProfile.avatar} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-lg font-semibold leading-6">
                  {accountText}
                </p>
                <button
                  type="button"
                  aria-label="复制账号"
                  onClick={handleCopyAccount}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  <Copy size={15} />
                </button>
              </div>
              {jobId && userProfile.userName !== jobId && (
                <p className="truncate text-xs text-muted-foreground">
                  {userProfile.userName}
                </p>
              )}
            </div>
          </div>
        </div>

        <DropdownMenuSeparator className="mx-4 my-0 bg-foreground/[0.08]" />

        <div className="space-y-1 p-3">
          <AccountMenuItem
            icon={<Settings size={20} />}
            label="设置"
            onSelect={() => openSettings('general')}
          />
          <AccountMenuItem
            icon={<BookOpen size={20} />}
            label="使用手册"
            onSelect={onOpenManual}
          />

          <ThemeQuickSwitch />

          <AccountMenuItem
            icon={<HelpCircle size={20} />}
            label="帮助与反馈"
            onSelect={() => setIssueReportOpen(true)}
          />
          <AccountMenuItem
            icon={<RefreshCw size={20} />}
            label="检查更新"
            onSelect={handleCheckUpdates}
          />
        </div>

        <DropdownMenuSeparator className="mx-4 my-0 bg-foreground/[0.08]" />

        <div className="p-3">
          <AccountMenuItem
            icon={<LogOut size={20} />}
            label="退出登录"
            danger
            onSelect={onLogout}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function GuestAccountMenu({
  hasAttention = false,
  contentAlign = 'start',
  collapsed = false,
  onOpenManual,
  onLogin,
}: GuestAccountMenuProps): React.ReactElement {
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)
  const setIssueReportOpen = useSetAtom(issueReportOpenAtom)

  const openSettings = React.useCallback((tab: 'general' | 'appearance' | 'about' = 'general') => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }, [setSettingsOpen, setSettingsTab])

  const handleCheckUpdates = React.useCallback(() => {
    void checkForUpdates()
    openSettings('about')
  }, [openSettings])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="账户菜单"
          className={cn(
            'relative titlebar-no-drag transition-colors',
            collapsed
              ? 'size-10 flex items-center justify-center rounded-[12px] text-foreground/55 hover:bg-foreground/5 hover:text-foreground'
              : 'flex-1 flex items-center gap-3 min-w-0 px-3 py-2 rounded-[12px] text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground',
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[10px] bg-foreground/[0.06] text-foreground/65">
            <LogIn size={17} />
          </span>
          {!collapsed && (
            <span className="flex-1 truncate text-left text-sm">
              账户与设置
            </span>
          )}
          {hasAttention && (
            <span className={cn(
              'absolute size-2 rounded-full bg-red-500',
              collapsed ? 'right-0 top-0' : 'right-2 top-2',
            )} />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align={contentAlign}
        sideOffset={12}
        className={ACCOUNT_MENU_CONTENT_CLASS}
      >
        <div className="px-4 pb-3 pt-4">
          <button
            type="button"
            onClick={onLogin}
            className="flex w-full items-center gap-3 rounded-[16px] bg-primary px-4 py-3 text-left text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-primary-foreground/15 text-primary-foreground">
              <LogIn size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold leading-5">登录 OA 账号</span>
              <span className="block truncate text-xs text-primary-foreground/70">登录后同步 OA 账号状态</span>
            </span>
          </button>
        </div>

        <DropdownMenuSeparator className="mx-4 my-0 bg-foreground/[0.08]" />

        <div className="space-y-1 p-3">
          <AccountMenuItem
            icon={<Settings size={20} />}
            label="设置"
            onSelect={() => openSettings('general')}
          />
          <AccountMenuItem
            icon={<BookOpen size={20} />}
            label="使用手册"
            onSelect={onOpenManual}
          />
          <ThemeQuickSwitch />
          <AccountMenuItem
            icon={<HelpCircle size={20} />}
            label="帮助与反馈"
            onSelect={() => setIssueReportOpen(true)}
          />
          <AccountMenuItem
            icon={<RefreshCw size={20} />}
            label="检查更新"
            onSelect={handleCheckUpdates}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ThemeQuickSwitch(): React.ReactElement {
  const themeMode = useAtomValue(themeModeAtom)
  const themeStyle = useAtomValue(themeStyleAtom)
  const setThemeMode = useSetAtom(themeModeAtom)
  const setThemeStyle = useSetAtom(themeStyleAtom)

  const handleLightThemeSelect = React.useCallback(() => {
    setThemeMode('special')
    setThemeStyle('slate-light')
    Promise.all([
      updateThemeMode('special'),
      updateThemeStyle('slate-light'),
    ]).catch(() => {
      toast.error('主题保存失败')
    })
  }, [setThemeMode, setThemeStyle])

  const handleDarkThemeSelect = React.useCallback(() => {
    setThemeMode('dark')
    setThemeStyle('default')
    Promise.all([
      updateThemeMode('dark'),
      updateThemeStyle('default'),
    ]).catch(() => {
      toast.error('主题保存失败')
    })
  }, [setThemeMode, setThemeStyle])

  return (
    <div className="flex min-h-12 items-center gap-3 rounded-[14px] px-3 py-2 text-foreground/80">
      <Palette size={20} className="shrink-0 text-foreground/70" />
      <span className="flex-1 text-[15px]">外观</span>
      <div className="flex rounded-[12px] bg-foreground/[0.06] p-1 dark:bg-foreground/[0.1]">
        <ThemeSegmentButton
          active={themeMode === 'special' && themeStyle === 'slate-light'}
          label="浅色"
          onClick={handleLightThemeSelect}
        />
        <ThemeSegmentButton
          active={themeMode === 'dark'}
          label="深色"
          onClick={handleDarkThemeSelect}
        />
      </div>
    </div>
  )
}

interface AccountMenuItemProps {
  icon: React.ReactNode
  label: string
  danger?: boolean
  onSelect: () => void | Promise<void>
}

function AccountMenuItem({ icon, label, danger = false, onSelect }: AccountMenuItemProps): React.ReactElement {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className={cn(
        'min-h-12 cursor-default rounded-[14px] px-3 text-[15px] outline-none transition-colors focus:bg-foreground/[0.06] dark:focus:bg-foreground/[0.1]',
        danger ? 'text-red-500 focus:text-red-500' : 'text-foreground/80 focus:text-foreground',
      )}
    >
      <span className={cn('text-foreground/70', danger && 'text-red-500')}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
    </DropdownMenuItem>
  )
}

interface ThemeSegmentButtonProps {
  active: boolean
  label: string
  onClick: () => void
}

function ThemeSegmentButton({ active, label, onClick }: ThemeSegmentButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
      className={cn(
        'flex h-9 min-w-14 items-center justify-center gap-1 rounded-[10px] px-3 text-sm font-medium transition-all',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {active && <Check size={14} />}
      {label}
    </button>
  )
}
