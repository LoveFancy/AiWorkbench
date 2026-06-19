/**
 * 问题反馈弹窗
 *
 * 描述输入 + 截图选择（预览/删除/添加）+ 提交，
 * 通过 @radix-ui/react-dialog 实现浮窗展示。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { X, Headset, Loader2, Plus, Trash2 } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { issueReportOpenAtom } from '@/atoms/issue-report'

const MAX_DESC_LENGTH = 5000
const MAX_IMAGES = 9
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

interface ImageEntry {
  file: File
  previewUrl: string
}

export function IssueReportDialog(): React.ReactElement {
  const [open, setOpen] = useAtom(issueReportOpenAtom)
  const [description, setDescription] = React.useState('')
  const [images, setImages] = React.useState<ImageEntry[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  const hasContent = description.trim().length > 0 || images.length > 0

  // 关闭时若有内容则确认
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next && hasContent) {
        if (!window.confirm('有未提交的内容，确定关闭吗？')) return
      }
      setOpen(next)
      if (!next) {
        // 延迟清空，避免关闭动画时看到空表单
        setTimeout(() => resetForm(), 200)
      }
    },
    [hasContent, setOpen],
  )

  const resetForm = React.useCallback(() => {
    setDescription('')
    // 释放预览 URL
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    setImages([])
  }, [images])

  const canSubmit = description.trim().length > 0 && !submitting

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? [])
    const valid: ImageEntry[] = []
    for (const f of selectedFiles) {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase()
      if (!ALLOWED_TYPES.includes(f.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
        toast.error(`不支持的图片格式: ${f.name}`)
        continue
      }
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`图片过大（单张不超过 10MB）: ${f.name}`)
        continue
      }
      valid.push({ file: f, previewUrl: URL.createObjectURL(f) })
    }
    const remaining = MAX_IMAGES - images.length
    if (valid.length > remaining) {
      toast.error(`最多还能添加 ${remaining} 张图片`)
      setImages((prev) => [...prev, ...valid.slice(0, remaining)])
    } else {
      setImages((prev) => [...prev, ...valid])
    }
    // 重置 input 以便重复选择同一文件
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    setImages((prev) => {
      const image = prev[index]
      if (image) {
        URL.revokeObjectURL(image.previewUrl)
      }
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const files = await Promise.all(
        images.map(async (img) => {
          const buf = await img.file.arrayBuffer()
          return {
            name: img.file.name,
            data: Array.from(new Uint8Array(buf)),
            mimeType: img.file.type || 'image/png',
          }
        }),
      )

      const result = await window.electronAPI.submitIssue({
        description: description.trim(),
        files,
      })

      if (result.success) {
        toast.success('问题已提交，感谢反馈！')
        resetForm()
        setOpen(false)
      } else {
        toast.error(result.error || '提交失败，请重试')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const descCount = description.length

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/20 titlebar-no-drag" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[100] translate-x-[-50%] translate-y-[-50%] w-[520px] max-h-[85vh] bg-dialog text-dialog-foreground shadow-2xl rounded-xl overflow-hidden titlebar-no-drag">
          {/* Header */}
          <div className="flex items-center justify-between px-5 h-12 border-b border-border/50">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Headset size={16} />
              问题反馈
            </h2>
            <button
              onClick={() => handleOpenChange(false)}
              className="rounded-md p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[calc(85vh-48px)]">
            {/* 问题描述 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                问题描述 <span className="text-red-400">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={MAX_DESC_LENGTH}
                placeholder="请描述遇到的问题（1-5000 字）"
                className="w-full h-28 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div
                className={`text-xs text-right ${
                  descCount > MAX_DESC_LENGTH * 0.9 ? 'text-red-400' : 'text-muted-foreground'
                }`}
              >
                {descCount}/{MAX_DESC_LENGTH}
              </div>
            </div>

            {/* 图片附件 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                截图附件 <span className="text-muted-foreground font-normal">（可选，最多 {MAX_IMAGES} 张）</span>
              </label>

              {/* 图片列表 */}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative group w-20 h-20 rounded-md overflow-hidden border border-border">
                      <img
                        src={img.previewUrl}
                        alt={`截图 ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                      <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-black/40 text-white py-0.5">
                        {i + 1}
                      </span>
                    </div>
                  ))}

                  {/* 添加按钮 */}
                  {images.length < MAX_IMAGES && (
                    <label className="w-20 h-20 rounded-md border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
                      <Plus size={20} className="text-muted-foreground" />
                      <input
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                  )}
                </div>
              )}

              {/* 空状态：上传区域 */}
              {images.length === 0 && (
                <label className="flex flex-col items-center justify-center gap-1 h-24 rounded-md border-2 border-dashed border-border cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
                  <Plus size={20} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">添加截图</span>
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>

            {/* 提交按钮 */}
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full"
            >
              {submitting && <Loader2 size={14} className="animate-spin mr-1" />}
              {submitting ? '提交中...' : '提交反馈'}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
