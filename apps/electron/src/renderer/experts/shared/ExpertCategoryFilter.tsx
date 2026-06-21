import * as React from 'react'
import { ChevronLeft, ChevronRight, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ExpertCategoryFilterProps {
  categories: string[]
  value: string
  onChange: (category: string) => void
}

export function ExpertCategoryFilter({ categories, value, onChange }: ExpertCategoryFilterProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  const checkScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  React.useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (!el) return
    const obs = new ResizeObserver(checkScroll)
    obs.observe(el)
    return () => obs.disconnect()
  }, [categories, checkScroll])

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' })
  }

  if (categories.length === 0) return null

  return (
    <div className="flex items-center gap-1">
      <Tag size={14} className="text-muted-foreground shrink-0" />
      {canScrollLeft && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => scroll('left')}>
          <ChevronLeft size={14} />
        </Button>
      )}
      <div
        ref={scrollRef}
        className="flex min-w-0 items-center gap-1 overflow-hidden"
        onScroll={checkScroll}
      >
        <button
          onClick={() => onChange('all')}
          className={cn(
            'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0',
            value === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
          )}
        >
          全部
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => onChange(cat)}
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0',
              value === cat
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
            )}
          >
            {cat}
          </button>
        ))}
      </div>
      {canScrollRight && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => scroll('right')}>
          <ChevronRight size={14} />
        </Button>
      )}
    </div>
  )
}
