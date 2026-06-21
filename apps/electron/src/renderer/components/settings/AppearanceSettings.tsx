/**
 * AppearanceSettings - 外观设置页
 *
 * 特殊风格选择 + 主题模式切换（浅色/深色/跟随系统/特殊风格）。
 * 通过 Jotai atom 管理状态，持久化到 ~/.proma/settings.json。
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Check } from 'lucide-react'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsSegmentedControl,
} from './primitives'
import {
  themeModeAtom,
  themeStyleAtom,
  systemIsDarkAtom,
  updateThemeMode,
  updateThemeStyle,
  applyThemeToDOM,
} from '@/atoms/theme'
import {
  markdownFontSizeAtom,
  updateMarkdownFontSize,
} from '@/atoms/markdown-font-size'
import { cn } from '@/lib/utils'
import type { ThemeMode, ThemeStyle, MarkdownFontSize } from '../../../types'

// ===== 主题预览图片导入 =====
import themeCloudDancer from '@/assets/theme-previews/theme-cloud-dancer.webp'
import themeOceanLight from '@/assets/theme-previews/theme-ocean-light.webp'
import themeForestMorning from '@/assets/theme-previews/theme-forest-morning.webp'
import themeOceanDark from '@/assets/theme-previews/theme-ocean-dark.webp'
import themeForestNight from '@/assets/theme-previews/theme-forest-night.webp'
import themeMorandiNight from '@/assets/theme-previews/theme-morandi-night.webp'

/** 主题选项 */
const THEME_OPTIONS = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
  { value: 'special', label: '特殊风格' },
]

/** Markdown 字号选项 */
const MARKDOWN_FONT_SIZE_OPTIONS = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
]

/** 特殊风格 ID（排除 default） */
type SpecialStyleId = Exclude<ThemeStyle, 'default'>

/** 特殊风格定义 */
interface SpecialStyle {
  id: SpecialStyleId
  name: string
  variant: 'light' | 'dark'
  /** 主题预览图 */
  image: string
  /** 图片裁剪位置（默认居中） */
  objectPosition?: string
  /** 图片缩放比例（默认 1） */
  imageScale?: number
}

const SPECIAL_STYLES: readonly SpecialStyle[] = [
  {
    id: 'slate-light',
    name: '云朵舞者',
    variant: 'light',
    image: themeCloudDancer,
    imageScale: 1.3,
  },
  {
    id: 'ocean-light',
    name: '晴空碧海',
    variant: 'light',
    image: themeOceanLight,
  },
  {
    id: 'forest-light',
    name: '森息晨光',
    variant: 'light',
    image: themeForestMorning,
    imageScale: 1.45,
  },
  {
    id: 'ocean-dark',
    name: '苍穹暮色',
    variant: 'dark',
    image: themeOceanDark,
  },
  {
    id: 'forest-dark',
    name: '森息夜语',
    variant: 'dark',
    image: themeForestNight,
  },
  {
    id: 'slate-dark',
    name: '莫兰迪夜',
    variant: 'dark',
    image: themeMorandiNight,
    imageScale: 1.15,
    objectPosition: '44% 58%',
  },
]

/** 各主题遮罩颜色（实心背景 + 浅色文字，与 CSS --primary 对应） */
const STYLE_MASK_COLORS: Record<SpecialStyleId, { bg: string; text: string }> = {
  'slate-light':  { bg: 'hsl(18, 20%, 67%)',  text: 'hsl(18, 20%, 88%)' },
  'ocean-light':  { bg: 'hsl(205, 50%, 50%)', text: 'hsl(205, 50%, 82%)' },
  'forest-light': { bg: 'hsl(150, 35%, 38%)', text: 'hsl(150, 35%, 75%)' },
  'ocean-dark':   { bg: 'rgba(0,0,0,0.8)', text: 'hsl(205, 50%, 82%)' },
  'forest-dark':  { bg: 'rgba(0,0,0,0.8)', text: 'hsl(150, 35%, 75%)' },
  'slate-dark':   { bg: 'rgba(0,0,0,0.8)', text: 'hsl(18, 20%, 88%)' },
}

/** 根据平台返回缩放快捷键提示 */
const isMac = navigator.userAgent.includes('Mac')
const ZOOM_HINT = isMac
  ? '使用 ⌘+ 放大、⌘- 缩小、⌘0 恢复默认大小'
  : '使用 Ctrl++ 放大、Ctrl+- 缩小、Ctrl+0 恢复默认大小'

export function AppearanceSettings(): React.ReactElement {
  const [themeMode, setThemeMode] = useAtom(themeModeAtom)
  const [themeStyle, setThemeStyle] = useAtom(themeStyleAtom)
  const systemIsDark = useAtomValue(systemIsDarkAtom)
  const [markdownFontSize, setMarkdownFontSize] = useAtom(markdownFontSizeAtom)

  /** 切换主题模式 */
  const handleThemeChange = React.useCallback((value: string) => {
    const mode = value as ThemeMode
    setThemeMode(mode)
    updateThemeMode(mode)
    // 切换回普通模式时，重置特殊风格
    if (mode !== 'special') {
      setThemeStyle('default')
      updateThemeStyle('default')
      applyThemeToDOM(mode, 'default', systemIsDark)
    }
  }, [setThemeMode, setThemeStyle, systemIsDark])

  /** 选择特殊风格 */
  const handleStyleSelect = React.useCallback((style: ThemeStyle) => {
    // 同时切换到特殊风格模式
    setThemeMode('special')
    setThemeStyle(style)
    updateThemeMode('special')
    updateThemeStyle(style)
    applyThemeToDOM('special', style, systemIsDark)
  }, [setThemeMode, setThemeStyle, systemIsDark])

  /** 切换 Markdown 字号 */
  const handleMarkdownFontSizeChange = React.useCallback((value: string) => {
    const size = value as MarkdownFontSize
    setMarkdownFontSize(size)
    updateMarkdownFontSize(size)
  }, [setMarkdownFontSize])

  return (
    <div className="space-y-6">
      <SettingsSection
        title="外观设置"
        description="自定义应用的视觉风格"
      >
        <SettingsCard>
          {/* 主题模式 - 最上面 */}
          <SettingsSegmentedControl
            label="主题模式"
            description="选择应用的配色方案"
            value={themeMode}
            onValueChange={handleThemeChange}
            options={THEME_OPTIONS}
          />

          {/* 特殊风格 - 标签在上，卡片在下 */}
          <div className="px-4 py-3 space-y-2">
            <div className="text-sm font-medium text-foreground">特殊风格</div>
            <div className="grid grid-cols-6 gap-3">
              {SPECIAL_STYLES.map((style) => (
                <StyleCard
                  key={style.id}
                  style={style}
                  isSelected={themeMode === 'special' && themeStyle === style.id}
                  onSelect={() => handleStyleSelect(style.id)}
                />
              ))}
            </div>
          </div>

          <SettingsRow
            label="界面缩放"
            description={ZOOM_HINT}
          />

          <SettingsSegmentedControl
            label="Markdown 字号"
            description="调整 AI 回复与 Markdown 编辑器的正文字号"
            value={markdownFontSize}
            onValueChange={handleMarkdownFontSizeChange}
            options={MARKDOWN_FONT_SIZE_OPTIONS}
          />
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}

/** 特殊风格卡片 - 竖长条图片预览 */
function StyleCard({
  style,
  isSelected,
  onSelect,
}: {
  style: SpecialStyle
  isSelected: boolean
  onSelect: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative rounded-lg overflow-hidden',
        'w-[99px] h-[183px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        isSelected
          ? 'ring-2 ring-primary shadow-lg shadow-primary/20'
          : 'ring-1 ring-border/50 hover:ring-border'
      )}
    >
      <div
        className="w-full h-full"
        style={style.imageScale ? { transform: `scale(${style.imageScale})` } : undefined}
      >
        <img
          src={style.image}
          alt={style.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          style={style.objectPosition ? { objectPosition: style.objectPosition } : undefined}
          draggable={false}
        />
      </div>
      <div
        className="absolute bottom-0 left-0 right-0 h-5 flex items-end justify-center pb-0.5"
        style={{ background: STYLE_MASK_COLORS[style.id].bg }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: STYLE_MASK_COLORS[style.id].text }}
        >
          {style.name}
        </span>
      </div>
      {isSelected && (
        <div className="absolute top-1 right-1 size-4 rounded-full bg-primary flex items-center justify-center z-10">
          <Check className="size-2.5 text-primary-foreground" />
        </div>
      )}
    </button>
  )
}
