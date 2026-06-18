import * as React from 'react'
import { FolderInput, Search, WandSparkles } from 'lucide-react'
import type { SkillMeta } from '@proma/shared'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface AgentSkillPickerProps {
  skills: SkillMeta[]
  disabled?: boolean
  onSelectSkill: (skill: SkillMeta) => void
  onOpenSkillManager: () => void
}

export function filterEnabledSkillsForPicker(skills: SkillMeta[], query: string): SkillMeta[] {
  const normalized = query.trim().toLowerCase()
  return skills
    .filter((skill) => skill.enabled)
    .filter((skill) => {
      if (!normalized) return true
      return [
        skill.name,
        skill.slug,
        skill.description ?? '',
      ].some((text) => text.toLowerCase().includes(normalized))
    })
}

export function AgentSkillPicker({
  skills,
  disabled = false,
  onSelectSkill,
  onOpenSkillManager,
}: AgentSkillPickerProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const filteredSkills = React.useMemo(
    () => filterEnabledSkillsForPicker(skills, query),
    [skills, query],
  )

  const handleSelect = React.useCallback((skill: SkillMeta): void => {
    onSelectSkill(skill)
    setOpen(false)
    setQuery('')
  }, [onSelectSkill])

  const handleOpenSkillManager = React.useCallback((): void => {
    setOpen(false)
    setQuery('')
    onOpenSkillManager()
  }, [onOpenSkillManager])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'h-8 shrink-0 rounded-full px-2.5 text-foreground/70 hover:text-foreground',
                open && 'bg-muted text-foreground',
              )}
              disabled={disabled}
            >
              <WandSparkles className="size-4" />
              <span className="text-[13px] font-medium">技能</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>选择技能</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        align="center"
        sideOffset={10}
        className="w-[330px] overflow-hidden rounded-xl border bg-popover p-0 shadow-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          requestAnimationFrame(() => inputRef.current?.focus())
        }}
      >
        <div className="flex h-10 items-center gap-2 border-b px-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索技能"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
          <Search className="size-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="max-h-[320px] overflow-y-auto py-1 scrollbar-thin">
          {filteredSkills.length > 0 ? (
            filteredSkills.map((skill) => (
              <button
                key={skill.slug}
                type="button"
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent"
                onClick={() => handleSelect(skill)}
              >
                <WandSparkles className="mt-0.5 size-4 shrink-0 text-violet-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-5 text-foreground">
                    {skill.name || skill.slug}
                  </span>
                  {skill.description && (
                    <span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">
                      {skill.description}
                    </span>
                  )}
                </span>
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              没有匹配的技能
            </div>
          )}
        </div>

        <button
          type="button"
          className="flex h-10 w-full items-center gap-2.5 border-t px-3 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
          onClick={handleOpenSkillManager}
        >
          <FolderInput className="size-4" />
          <span>导入技能</span>
        </button>
      </PopoverContent>
    </Popover>
  )
}
