/**
 * SettingsPanel - 设置面板
 *
 * 顶部 Header（标题 + 关闭按钮）+ 下方（左侧导航 + 右侧 ScrollArea 内容区域）。
 * 使用 Jotai atom 管理当前标签页状态。
 */

import * as React from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { cn } from "@/lib/utils";
import {
  X,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { settingsTabAtom, settingsOpenAtom, channelFormDirtyAtom, settingsCloseRequestedAtom } from "@/atoms/settings-tab";
import { hasUpdateAtom } from "@/atoms/updater";
import type { SettingsTab } from "@/atoms/settings-tab";
import { appModeAtom } from "@/atoms/app-mode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChannelSettings } from "./ChannelSettings";
import { GeneralSettings } from "./GeneralSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { AboutSettings } from "./AboutSettings";
import { PromptSettings } from "./PromptSettings";
import { ToolSettings } from "./ToolSettings";
import { UsageLogSettings } from "./UsageLogSettings";
import { SystemLogSettings } from "./SystemLogSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import { BotHubSettings } from "./BotHubSettings";
import type { TabItem } from "./settings-tabs";
import { getSettingsTabs } from "./settings-tabs";

/** 根据标签页 id 渲染对应内容 */
function renderTabContent(tab: SettingsTab): React.ReactElement {
  switch (tab) {
    case "general":
      return <GeneralSettings />;
    case "channels":
      return <ChannelSettings />;
    case "prompts":
      return <PromptSettings />;
    case "tools":
      return <ToolSettings />;
    case "usage-log":
      return <UsageLogSettings />;
    case "system-log":
      return <SystemLogSettings />;
    case "bots":
      return <BotHubSettings />;
    case "appearance":
      return <AppearanceSettings />;
    case "about":
      return <AboutSettings />;
    case "shortcuts":
      return <ShortcutSettings />;
    default:
      return <GeneralSettings />;
  }
}

interface SettingsPanelProps {
  onClose?: () => void;
}

export function SettingsPanel({
  onClose,
}: SettingsPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useAtom(settingsTabAtom);
  const channelFormDirty = useAtomValue(channelFormDirtyAtom);
  const [closeRequested, setCloseRequested] = useAtom(settingsCloseRequestedAtom);
  const appMode = useAtomValue(appModeAtom);
  const hasUpdate = useAtomValue(hasUpdateAtom);

  /** 统一的退出拦截对话框状态 */
  type PendingAction = { type: 'tab'; tabId: SettingsTab } | { type: 'close' } | null
  const [pendingAction, setPendingAction] = React.useState<PendingAction>(null)
  const showNavDialog = pendingAction !== null

  /** 执行待处理的操作 */
  const executePendingAction = (): void => {
    if (!pendingAction) return
    if (pendingAction.type === 'tab') {
      setActiveTab(pendingAction.tabId)
    } else {
      onClose?.()
    }
    setPendingAction(null)
  }

  /** 取消待处理的操作 */
  const cancelPendingAction = (): void => {
    setPendingAction(null)
  }

  /** 切换标签页时检测是否有未保存内容 */
  const handleTabChange = (tabId: SettingsTab): void => {
    if (tabId === activeTab) return
    if (activeTab === 'channels' && channelFormDirty) {
      setPendingAction({ type: 'tab', tabId })
      return
    }
    setActiveTab(tabId)
  }

  /** 关闭设置面板时检测是否有未保存内容 */
  const handleClose = (): void => {
    if (activeTab === 'channels' && channelFormDirty) {
      setPendingAction({ type: 'close' })
      return
    }
    onClose?.()
  }

  // Cmd+W 等外部关闭请求：弹出确认对话框
  React.useEffect(() => {
    if (closeRequested && activeTab === 'channels') {
      setPendingAction({ type: 'close' })
      setCloseRequested(false)
    }
  }, [closeRequested, activeTab, setCloseRequested])

  // Agent 模式时在渠道后插入 Agent Tab，工具 tab 两种模式都显示
  const tabs = React.useMemo(() => {
    return getSettingsTabs(appMode === 'agent' ? 'agent' : 'chat');
  }, [appMode]);

  React.useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("channels");
    }
  }, [activeTab, setActiveTab, tabs]);

  // 当前 tab 标题
  const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label ?? "设置";

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 Header 栏 */}
      <div className="h-12 flex items-center justify-between px-5 border-b border-border/50 flex-shrink-0">
        <h2 className="text-sm font-medium text-foreground">
          {activeTabLabel}
        </h2>
        {onClose && (
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* 下方主体：左导航 + 右内容 */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧 Tab 导航 */}
        <div className="w-[160px] border-r border-border/50 pt-3 px-2 flex-shrink-0 overflow-y-auto scrollbar-thin">
          <nav className="flex flex-col gap-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "relative flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  activeTab === tab.id
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.id === 'about' && hasUpdate && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* 右侧内容区域 */}
        {activeTab === 'system-log' ? (
          <div className="flex-1 min-w-0 min-h-0 px-6 py-4">
            {renderTabContent(activeTab)}
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="px-6 py-4">{renderTabContent(activeTab)}</div>
          </ScrollArea>
        )}
      </div>

      {/* 退出拦截弹窗（侧边栏导航 / X 关闭 / Cmd+W） */}
      <AlertDialog open={showNavDialog} onOpenChange={(open) => { if (!open) cancelPendingAction() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的更改？</AlertDialogTitle>
            <AlertDialogDescription>
              当前渠道配置尚未保存，确定要离开吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelPendingAction}>留在当前页</AlertDialogCancel>
            <AlertDialogAction onClick={executePendingAction}>放弃并离开</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
