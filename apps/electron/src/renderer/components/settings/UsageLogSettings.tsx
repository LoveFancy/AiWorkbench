/**
 * UsageLogSettings - 用量日志页
 *
 * 恢复设置页中的用量日志入口，后续可接入真实调用记录数据源。
 */

import * as React from 'react'
import { SettingsSegmentedControl, SettingsSection } from './primitives'

type DateFilter = 'today' | 'yesterday' | 'all'
type UsageCategory = 'model' | 'tools' | 'voice' | 'agent-api'

const DATE_OPTIONS = [
  { value: 'today', label: '今日' },
  { value: 'yesterday', label: '昨日' },
  { value: 'all', label: '全部' },
]

const CATEGORY_OPTIONS = [
  { value: 'model', label: '模型调用' },
  { value: 'tools', label: '工具调用' },
  { value: 'voice', label: '语音用量' },
  { value: 'agent-api', label: 'Agent API' },
]

export function UsageLogSettings(): React.ReactElement {
  const [dateFilter, setDateFilter] = React.useState<DateFilter>('today')
  const [category, setCategory] = React.useState<UsageCategory>('model')

  return (
    <SettingsSection
      title="调用日志"
      description="查看各类 API 调用记录和用量统计"
    >
      <div className="space-y-4">
        <SettingsSegmentedControl
          label=""
          value={dateFilter}
          onValueChange={(value) => setDateFilter(value as DateFilter)}
          options={DATE_OPTIONS}
        />
        <SettingsSegmentedControl
          label=""
          value={category}
          onValueChange={(value) => setCategory(value as UsageCategory)}
          options={CATEGORY_OPTIONS}
        />
        <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
          暂无数据
        </div>
      </div>
    </SettingsSection>
  )
}
