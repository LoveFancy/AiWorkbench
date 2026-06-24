# 工作区文件树美化 — 间距与色彩层次

**日期**: 2026-06-24
**范围**: `FileBrowser.tsx` — `FileTreeItem` 组件样式

---

## 目标

优化工作区/会话文件树的视觉体验，提升可读性和操作反馈清晰度。

## 范围

仅两个改动方向：

1. **间距留白** — 行高、缩进
2. **色彩层次** — 选中态、hover 态

## 改动清单

### A. 间距留白

全部在 `FileTreeItem` 组件的 `paddingLeft` 和行高 `className` 中修改：

| 属性 | 现状 | 改进后 |
|------|------|--------|
| 行高 | `h-[28px]` | `h-[32px]` |
| 缩进步长 | 16px | 20px |
| 引导线 left 位置 | `left: paddingLeft + 10` | 同步适配新缩进 |
| 底部留白 | 上一轮已设 `pb-6 min-h-[40px]` | 保持不变 |

具体位置：
- `paddingLeft` 计算方程: `const paddingLeft = 12 + depth * indentSize`
- `indentSize`: 16 → 20
- 行高 className: `h-[28px]` → `h-[32px]`
- 引导线 `guideLeft`: 依赖 `paddingLeft` 自动同步

### B. 色彩层次

| 属性 | 现状 | 改进后 |
|------|------|--------|
| 选中态背景 | `bg-accent` | `bg-primary/10` |
| 选中态左边条 | 无 | `border-l-[3px] border-primary` |
| 选中态文字 | 无特殊处理 | `text-foreground` |
| hover 态 | `hover:bg-accent/40` | 保持不变 |
| 未选中行文字 | 默认 | 保持 `text-muted-foreground` |

仅影响 `isSelected` 为 true 时的 className 条件分支。

## 不涉及

- 标题栏（"工作区文件"/"会话文件"区域头部）
- 文件类型图标颜色
- 动效/过渡（现有 transition-colors 保持）
- 最近修改标记样式
- 剪切态虚线样式

## 实现复杂度

- 改动集中在 `FileTreeItem` 组件内部，约 5-8 行 CSS class 调整
- 不涉及逻辑变更、不新增组件、不修改 props 接口
- 无测试文件需更新
