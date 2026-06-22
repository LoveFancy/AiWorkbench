import * as React from 'react'
import { Loader2, Package } from 'lucide-react'
import { useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { loadAgentExpertGroupsAtom } from '@/atoms/agent-atoms'

interface ExpertImportButtonProps {
  label?: string
}

/** "导入 WorkMate 专家团"按钮 — 调用系统文件选择器上传 zip 并安装为插件 */
export function ExpertImportButton({ label = '导入 WorkMate 专家团' }: ExpertImportButtonProps): React.ReactElement {
  const loadGroups = useSetAtom(loadAgentExpertGroupsAtom)
  const [installing, setInstalling] = React.useState(false)

  const handleInstall = React.useCallback(async () => {
    if (installing) return
    setInstalling(true)
    try {
      const installed = await window.electronAPI.installAgentPluginZip()
      if (!installed) return
      toast.success(`插件已安装: ${installed.name}`)
      await loadGroups()
    } catch (error) {
      toast.error('安装插件失败', {
        description: error instanceof Error ? error.message : '未知错误',
      })
    } finally {
      setInstalling(false)
    }
  }, [installing, loadGroups])

  return (
    <Button size="sm" className="h-8" onClick={handleInstall} disabled={installing}>
      {installing ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Package size={14} />
      )}
      {installing ? '安装中' : label}
    </Button>
  )
}
