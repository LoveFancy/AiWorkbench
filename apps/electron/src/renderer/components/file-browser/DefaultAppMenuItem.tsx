/**
 * DefaultAppMenuItem — DropdownMenuItem 形式的"用默认 App 打开"。
 *
 * 探测本机为该文件类型注册的默认 App，菜单项文案动态显示「用 XX 打开」并带 App Logo。
 * 探测失败（图标读取失败、文件类型未注册默认 App、平台不支持）时整个菜单项不渲染。
 */

import * as React from 'react'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useDefaultAppForFile } from '@/hooks/useDefaultAppForFile'

interface DefaultAppMenuItemProps {
  filePath: string
  className?: string
  menuKind?: 'context' | 'dropdown'
}

export function DefaultAppMenuItem({
  filePath,
  className,
  menuKind = 'dropdown',
}: DefaultAppMenuItemProps): React.ReactElement | null {
  const info = useDefaultAppForFile(filePath)

  if (!info) return null

  const Item = menuKind === 'context' ? ContextMenuItem : DropdownMenuItem

  return (
    <Item
      className={className}
      onSelect={() => {
        window.electronAPI.systemOpenFile(filePath).catch((err) => {
          console.error('[DefaultAppMenuItem] 打开文件失败:', err)
        })
      }}
    >
      <img
        src={info.iconDataUrl}
        alt=""
        className="size-3.5 shrink-0"
        draggable={false}
      />
      <span className="truncate">用 {info.name} 打开</span>
    </Item>
  )
}
