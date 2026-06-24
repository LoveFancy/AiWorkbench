import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const fileBrowserSource = await Bun.file(join(import.meta.dir, 'FileBrowser.tsx')).text()
const fileTreeItemSource = await Bun.file(join(import.meta.dir, 'FileTreeItem.tsx')).text()
const keyboardHookSource = await Bun.file(join(import.meta.dir, 'useFileBrowserKeyboard.ts')).text()

// ============================================================
// 布局与嵌入模式
// ============================================================
describe('FileBrowser 布局与嵌入模式', () => {
  test('嵌入模式的文件树不撑满外部滚动区域', () => {
    expect(fileBrowserSource).not.toContain("embedded && 'min-h-full'")
    expect(fileBrowserSource).toContain("embedded ? 'min-h-0' : 'h-full'")
  })

  test('嵌入模式下文件树容器使用 py-1 padding', () => {
    expect(fileBrowserSource).toContain('py-1')
  })

  test('非嵌入模式使用 ScrollArea 包裹', () => {
    expect(fileBrowserSource).toContain('<ScrollArea')
    expect(fileBrowserSource).toContain('className="flex-1"')
  })

  test('文件树容器为 flex flex-col', () => {
    expect(fileBrowserSource).toContain("'flex flex-col outline-none transition-colors'")
  })

  test('底部留白确保右键可触发', () => {
    expect(fileBrowserSource).toContain('底部留白')
    expect(fileBrowserSource).toContain('className="h-8"')
  })

  test('工具栏可被外部接管 (hideToolbar)', () => {
    expect(fileBrowserSource).toContain('hideToolbar')
    expect(fileBrowserSource).toContain('{!hideToolbar &&')
  })

  test('隐藏空目录提示 (hideEmpty)', () => {
    expect(fileBrowserSource).toContain('hideEmpty')
    expect(fileBrowserSource).toContain('!hideEmpty')
  })
})

// ============================================================
// 选中交互
// ============================================================
describe('FileBrowser 选中交互', () => {
  test('Shift+Click 范围选择逻辑存在', () => {
    expect(fileBrowserSource).toContain("const isShift = event.shiftKey")
    expect(fileBrowserSource).toContain('// Shift+Click: 范围选择')
    expect(fileBrowserSource).toContain('lastClickedPathRef.current')
  })

  test('Shift+Click 无锚点时退化为普通点击', () => {
    expect(fileBrowserSource).toContain('if (!anchor)')
    expect(fileBrowserSource).toContain('// 无锚点，退化为普通点击')
  })

  test('Shift+Click 通过 entryMetaMapRef 获取可见列表', () => {
    expect(fileBrowserSource).toContain('entryMetaMapRef.current.keys()')
    expect(fileBrowserSource).toContain('visiblePaths.slice(start, end + 1)')
  })

  test('Shift+Ctrl+Click 合并范围到现有选中', () => {
    expect(fileBrowserSource).toContain('Shift+Ctrl+Click: 合并范围到现有选中')
    expect(fileBrowserSource).toContain('next.add(p)')
  })

  test('Ctrl/Cmd+Click 切换单个项', () => {
    expect(fileBrowserSource).toContain('const isMulti = event.metaKey || event.ctrlKey')
    expect(fileBrowserSource).toContain('next.delete(entry.path)')
    expect(fileBrowserSource).toContain('next.add(entry.path)')
  })

  test('普通点击单选并更新锚点', () => {
    expect(fileBrowserSource).toContain('lastClickedPathRef.current = entry.path')
    expect(fileBrowserSource).toContain("setSelectedPaths(new Set([entry.path]))")
  })

  test('Shift+Click 不更新锚点（保持范围起点）', () => {
    expect(fileBrowserSource).toContain('// 不更新锚点，保持范围选择的起始点')
  })

  test('选中列表清空时自动重置锚点', () => {
    expect(fileBrowserSource).toContain('selectedPaths.size === 0')
    expect(fileBrowserSource).toContain('lastClickedPathRef.current = null')
  })
})

// ============================================================
// 右键菜单
// ============================================================
describe('FileBrowser 右键菜单', () => {
  test('根目录空白区域右键菜单存在', () => {
    expect(fileBrowserSource).toContain('根目录空白区域右键菜单')
    expect(fileBrowserSource).toContain('<ContextMenuContent')
    expect(fileBrowserSource).toContain('</ContextMenuTrigger>')
    expect(fileBrowserSource).toContain('</ContextMenu>')
  })

  test('根目录菜单支持新建文件', () => {
    expect(fileBrowserSource).toContain('onCreateEntry(rootPath, \'file\')')
    expect(fileBrowserSource).toContain('<FilePlus />')
  })

  test('根目录菜单支持新建文件夹', () => {
    expect(fileBrowserSource).toContain('onCreateEntry(rootPath, \'directory\')')
    expect(fileBrowserSource).toContain('<FolderPlus />')
  })

  test('根目录菜单新建项受 onCreateEntry 控制', () => {
    expect(fileBrowserSource).toContain('{onCreateEntry &&')
  })

  test('根目录菜单支持粘贴到根目录', () => {
    expect(fileBrowserSource).toContain('粘贴到根目录')
    expect(fileBrowserSource).toContain('<ClipboardPaste />')
  })

  test('根目录菜单粘贴项受 fileClipboard 控制', () => {
    expect(fileBrowserSource).toContain('{fileClipboard &&')
  })

  test('无剪贴板时显示提示文字', () => {
    expect(fileBrowserSource).toContain('复制文件后可使用 Ctrl+V 粘贴')
  })

  test('剪贴板有内容且无选中时根目录显示虚线边框', () => {
    expect(fileBrowserSource).toContain('ring-1 ring-dashed ring-primary/40 rounded-md')
    expect(fileBrowserSource).toContain('fileClipboard && selectedPaths.size === 0')
  })
})

// ============================================================
// 文件操作
// ============================================================
describe('FileBrowser 文件操作', () => {
  test('删除确认对话框存在', () => {
    expect(fileBrowserSource).toContain('<AlertDialog')
    expect(fileBrowserSource).toContain('<AlertDialogTitle>确认删除</AlertDialogTitle>')
    expect(fileBrowserSource).toContain('此操作不可撤销')
  })

  test('多选删除显示数量', () => {
    expect(fileBrowserSource).toContain('deleteCount > 1')
    expect(fileBrowserSource).toContain('确定要删除选中的')
  })

  test('支持原位重命名', () => {
    expect(fileBrowserSource).toContain("setRenamingPath(entry.path)")
    expect(fileBrowserSource).toContain('handleRename')
    expect(fileBrowserSource).toContain('同名文件已存在')
  })

  test('移动文件支持多选', () => {
    expect(fileBrowserSource).toContain('selectedPaths.size > 1')
    expect(fileBrowserSource).toContain('window.electronAPI.moveFile')
  })

  test('support transferTarget 快捷转移', () => {
    expect(fileBrowserSource).toContain('transferTarget')
    expect(fileBrowserSource).toContain('handleTransfer')
  })

  test('showInFolder 功能', () => {
    expect(fileBrowserSource).toContain('showInFolder')
    expect(fileBrowserSource).toContain('在 Finder 中打开')
  })

  test('自动刷新 (filesVersion)', () => {
    expect(fileBrowserSource).toContain('filesVersion')
    expect(fileBrowserSource).toContain('[loadRoot, filesVersion]')
  })

  test('加载状态与错误处理', () => {
    expect(fileBrowserSource).toContain('setLoading')
    expect(fileBrowserSource).toContain('setError')
    expect(fileBrowserSource).toContain('目录为空')
    expect(fileBrowserSource).toContain('text-destructive')
  })
})

// ============================================================
// 剪贴板操作
// ============================================================
describe('FileBrowser 剪贴板操作', () => {
  test('内部剪贴板复制', () => {
    expect(fileBrowserSource).toContain("mode: 'copy'")
    expect(fileBrowserSource).toContain('setFileClipboard')
  })

  test('内部剪贴板剪切', () => {
    expect(fileBrowserSource).toContain("'cut'")
    expect(fileBrowserSource).toContain('cutPathsSet')
  })

  test('同时写入系统剪贴板', () => {
    expect(fileBrowserSource).toContain('writePathsToSystemClipboard')
    expect(fileBrowserSource).toContain('clearSystemClipboard')
  })

  test('粘贴目标目录计算', () => {
    expect(fileBrowserSource).toContain('getPasteTargetDir')
    expect(fileBrowserSource).toContain('meta?.isDirectory')
  })

  test('系统剪贴板粘贴处理', () => {
    expect(fileBrowserSource).toContain('handlePasteEvent')
    expect(fileBrowserSource).toContain('clipboardData?.files')
  })

  test('外部文件粘贴支持', () => {
    expect(fileBrowserSource).toContain('onExternalFilesPaste')
    expect(fileBrowserSource).toContain('getPathForFile')
  })

  test('内部剪贴板粘贴调用 pastePathsToTarget', () => {
    expect(fileBrowserSource).toContain('pastePathsToTarget')
  })

  test('复制粘贴进度追踪', () => {
    expect(fileBrowserSource).toContain('upsertPasteProgress')
    expect(fileBrowserSource).toContain('clearPasteProgress')
  })

  test('组件卸载时清理粘贴进度', () => {
    expect(fileBrowserSource).toContain('return () => { clearPasteProgress() }')
  })
})

// ============================================================
// 键盘快捷键
// ============================================================
describe('FileBrowser 键盘快捷键', () => {
  test('键盘快捷键 hook 调用', () => {
    expect(fileBrowserSource).toContain('useFileBrowserKeyboard')
  })

  test('Ctrl+C 复制', () => {
    expect(keyboardHookSource).toContain("e.key === 'c'")
    expect(keyboardHookSource).toContain("copyOrCutToClipboardRef.current('copy')")
  })

  test('Ctrl+X 剪切', () => {
    expect(keyboardHookSource).toContain("e.key === 'x'")
    expect(keyboardHookSource).toContain("copyOrCutToClipboardRef.current('cut')")
  })

  test('Delete 键删除', () => {
    expect(keyboardHookSource).toContain("e.key === 'Delete'")
    expect(keyboardHookSource).toContain('handleRequestDeleteRef')
  })

  test('多选 Delete 调用 onRequestMultiDelete', () => {
    expect(keyboardHookSource).toContain('onRequestMultiDelete')
    expect(keyboardHookSource).toContain('selectedPathsRef.current.size > 1')
  })

  test('F2 重命名', () => {
    expect(keyboardHookSource).toContain("e.key === 'F2'")
    expect(keyboardHookSource).toContain('setRenamingPath')
  })

  test('Enter 打开文件/展开文件夹', () => {
    expect(keyboardHookSource).toContain("e.key === 'Enter'")
    expect(keyboardHookSource).toContain('setKeyboardToggleSignal')
    expect(keyboardHookSource).toContain('onFilePreviewRef')
  })

  test('Escape 取消选中并清空剪贴板', () => {
    expect(keyboardHookSource).toContain("e.key === 'Escape'")
    expect(keyboardHookSource).toContain('clearSelectionRef')
    expect(keyboardHookSource).toContain('setFileClipboardRef.current(null)')
  })

  test('Ctrl+A 全选', () => {
    expect(keyboardHookSource).toContain("e.key === 'a'")
    expect(keyboardHookSource).toContain('entriesRef.current.map')
    expect(keyboardHookSource).toContain('lastClickedPathRef.current = null')
  })

  test('重命名中不响应快捷键', () => {
    expect(keyboardHookSource).toContain('if (renamingPath) return')
  })

  test('输入法组合中不响应快捷键', () => {
    expect(keyboardHookSource).toContain('e.nativeEvent.isComposing')
  })

  test('Mac 下 Ctrl 映射到 metaKey', () => {
    expect(keyboardHookSource).toContain("navigator.userAgent.includes('Mac')")
  })

  test('Mac 下 Backspace 等同于 Delete', () => {
    expect(keyboardHookSource).toContain("e.key === 'Backspace'")
  })
})

// ============================================================
// 拖拽交互
// ============================================================
describe('FileBrowser 拖拽交互', () => {
  test('目录行支持外部文件拖入', () => {
    expect(fileBrowserSource).toContain('onExternalFilesDropToDirectory')
  })

  test('内部文件树拖拽 MIME', () => {
    expect(fileBrowserSource).toContain('FILE_TREE_DRAG_MIME')
  })

  test('根目录拖放支持', () => {
    expect(fileBrowserSource).toContain('handleRootDragOver')
    expect(fileBrowserSource).toContain('handleRootDrop')
    expect(fileBrowserSource).toContain("event.dataTransfer.dropEffect = 'move'")
  })

  test('拖拽移动路径过滤 (filterMovablePaths)', () => {
    expect(fileBrowserSource).toContain('filterMovablePaths')
  })
})

// ============================================================
// FileTreeItem 交互
// ============================================================
describe('FileTreeItem 交互', () => {
  test('Shift+Click 不展开文件夹', () => {
    expect(fileTreeItemSource).toContain('const isShift = e.shiftKey')
    expect(fileTreeItemSource).toContain('if (isMulti || isShift) return')
  })

  test('Ctrl+Click 不展开文件夹', () => {
    expect(fileTreeItemSource).toContain('const isMulti = e.metaKey || e.ctrlKey')
    expect(fileTreeItemSource).toContain('if (isMulti || isShift) return')
  })

  test('普通单击文件夹展开/收起', () => {
    expect(fileTreeItemSource).toContain('void toggleDir()')
  })

  test('普通单击文件预览', () => {
    expect(fileTreeItemSource).toContain('onFilePreview?.(entry.path)')
  })

  test('文件行有 data-file-tree-item 标记', () => {
    expect(fileTreeItemSource).toContain('data-file-tree-item="true"')
  })

  test('右键菜单包含新建文件/文件夹', () => {
    expect(fileTreeItemSource).toContain('<FilePlus />')
    expect(fileTreeItemSource).toContain('<FolderPlus />')
    expect(fileTreeItemSource).toContain('新建文件')
    expect(fileTreeItemSource).toContain('新建文件夹')
  })

  test('右键菜单包含删除', () => {
    expect(fileTreeItemSource).toContain('<Trash2 />')
    expect(fileTreeItemSource).toContain('删除')
  })

  test('右键菜单包含复制/剪切/粘贴', () => {
    expect(fileTreeItemSource).toContain('<Copy />')
    expect(fileTreeItemSource).toContain('<Scissors />')
    expect(fileTreeItemSource).toContain('<ClipboardPaste />')
  })

  test('右键菜单包含添加到聊天', () => {
    expect(fileTreeItemSource).toContain('<MessageSquarePlus />')
    expect(fileTreeItemSource).toContain('添加到聊天')
  })

  test('右键菜单包含在文件夹中显示', () => {
    expect(fileTreeItemSource).toContain('<FolderSearch />')
    expect(fileTreeItemSource).toContain('在文件夹中显示')
  })

  test('选中态样式', () => {
    expect(fileTreeItemSource).toContain('bg-primary/10 border-l-primary')
  })

  test('剪切态样式 (opacity-50)', () => {
    expect(fileTreeItemSource).toContain('cutPathsSet.has(entry.path)')
    expect(fileTreeItemSource).toContain("isCutTarget && 'opacity-50'")
  })

  test('拖拽悬停高亮', () => {
    expect(fileTreeItemSource).toContain('isDropTarget')
    expect(fileTreeItemSource).toContain("'bg-primary/15 text-foreground shadow-sm ring-2 ring-primary/60 ring-inset'")
  })

  test('空文件夹提示', () => {
    expect(fileTreeItemSource).toContain('空文件夹')
  })

  test('子项递归渲染 FileTreeItem', () => {
    expect(fileTreeItemSource).toContain('children.map((child) =>')
    expect(fileTreeItemSource).toContain('depth={depth + 1}')
  })

  test('展开/收起箭头旋转动画', () => {
    expect(fileTreeItemSource).toContain('rotate-90')
    expect(fileTreeItemSource).toContain('transition-transform duration-150')
  })

  test('懒加载子目录', () => {
    expect(fileTreeItemSource).toContain('childrenLoaded')
    expect(fileTreeItemSource).toContain('listDirectory')
  })

  test('最近修改标记 (recentlyModified)', () => {
    expect(fileTreeItemSource).toContain('recentlyModifiedSet')
    expect(fileTreeItemSource).toContain('最近被 Agent 修改')
  })

  test('原位重命名输入框', () => {
    expect(fileTreeItemSource).toContain('renameInputRef')
    expect(fileTreeItemSource).toContain('onKeyDown={handleRenameKeyDown}')
  })

  test('重命名同名检查错误提示', () => {
    expect(fileTreeItemSource).toContain('renameError')
  })
})

// ============================================================
// 自动定位 (auto-reveal)
// ============================================================
describe('FileBrowser 自动定位 (auto-reveal)', () => {
  test('autoReveal 功能存在', () => {
    expect(fileBrowserSource).toContain('fileBrowserAutoRevealAtom')
    expect(fileBrowserSource).toContain('revealAncestors')
    expect(fileBrowserSource).toContain('revealTarget')
  })

  test('仅响应本实例 rootPath 内的目标', () => {
    expect(fileBrowserSource).toContain('isPathUnderRoot')
  })

  test('带 select 标记的 reveal 将目标加入选中态', () => {
    expect(fileBrowserSource).toContain('revealSelect')
    expect(fileBrowserSource).toContain('consumedSelectTsRef')
  })

  test('祖先目录自动展开', () => {
    expect(fileTreeItemSource).toContain('revealAncestors.has(entry.path)')
  })

  test('目标行高亮脉冲', () => {
    expect(fileTreeItemSource).toContain("setFlash(true)")
    expect(fileTreeItemSource).toContain('file-browser-row-flash')
  })

  test('目标行滚动到视图中心', () => {
    expect(fileTreeItemSource).toContain('scrollIntoView')
    expect(fileTreeItemSource).toContain("behavior: 'smooth'")
  })
})

// ============================================================
// Props 接口
// ============================================================
describe('FileBrowser Props 接口', () => {
  const expectedProps = [
    'rootPath',
    'hideToolbar',
    'embedded',
    'hideEmpty',
    'displayRoots',
    'clearSelectionSignal',
    'onAddToChat',
    'onFilePreview',
    'onSelectedDirectoryChange',
    'onCreateEntry',
    'transferTarget',
    'onFilesMoved',
    'onExternalFilesDropToDirectory',
    'onExternalFilesPaste',
    'onDirectoryDropTargetActive',
  ]

  for (const prop of expectedProps) {
    test(`prop: ${prop}`, () => {
      expect(fileBrowserSource).toContain(prop)
    })
  }
})

// ============================================================
// 面包屑 & 展示路径
// ============================================================
describe('FileBrowser 面包屑 & 展示路径', () => {
  test('面包屑使用 formatManagedPath', () => {
    expect(fileBrowserSource).toContain('formatManagedPath')
  })

  test('路径过长时显示省略号', () => {
    expect(fileBrowserSource).toContain('slice(-2)')
    expect(fileBrowserSource).toContain('.../')
  })

  test('面包屑有 title 属性显示完整路径', () => {
    expect(fileBrowserSource).toContain('title={rootPath}')
  })
})
