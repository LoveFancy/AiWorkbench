import * as React from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface ExpertSearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function ExpertSearchBar({ value, onChange, placeholder = '搜索专家、角色、技能...' }: ExpertSearchBarProps): React.ReactElement {
  return (
    <div className="relative mx-auto max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  )
}
