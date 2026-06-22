/**
 * 问题反馈侧边栏按钮
 *
 * 独立封装，LeftSidebar 只需 import + 挂载一行。
 */

import * as React from 'react'
import { Headset } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useSetAtom } from 'jotai'
import { issueReportOpenAtom } from '@/atoms/issue-report'

export function IssueReportButton(): React.ReactElement {
  const setOpen = useSetAtom(issueReportOpenAtom)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 min-w-0 px-3 py-2 rounded-[10px] transition-colors titlebar-no-drag text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        >
          <Headset className="size-5 flex-shrink-0" />
          <span className="flex-1 text-sm truncate text-left">问题反馈</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">提交问题反馈</TooltipContent>
    </Tooltip>
  )
}
