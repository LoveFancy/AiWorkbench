import { describe, expect, test } from 'bun:test'
import { computeTreeRowLayout, canBeSticky } from './tree-row-layout'

// ============================================================
// computeTreeRowLayout
// ============================================================
describe('computeTreeRowLayout', () => {
  test('depth=0 根层布局', () => {
    const layout = computeTreeRowLayout(0)
    // paddingLeft = 8(外边距) + 8 + 0*20 = 16
    expect(layout.paddingLeft).toBe(16)
    // guideLeft = paddingLeft + 7 = 23
    expect(layout.guideLeft).toBe(23)
    expect(layout.stickyTop).toBe(0)
    expect(layout.stickyZIndex).toBe(10)
  })

  test('depth=1 第一层子项布局', () => {
    const layout = computeTreeRowLayout(1)
    expect(layout.paddingLeft).toBe(36) // 8+8 + 1*20
    expect(layout.guideLeft).toBe(43)
    expect(layout.stickyTop).toBe(32) // 1 * TREE_ROW_HEIGHT (32)
    expect(layout.stickyZIndex).toBe(9)
  })

  test('depth=2 第二层子项布局', () => {
    const layout = computeTreeRowLayout(2)
    expect(layout.paddingLeft).toBe(56)
    expect(layout.guideLeft).toBe(63)
    expect(layout.stickyTop).toBe(64)
    expect(layout.stickyZIndex).toBe(8)
  })

  test('depth=7 最大 sticky 深度', () => {
    const layout = computeTreeRowLayout(7)
    expect(layout.paddingLeft).toBe(156) // 8+8 + 7*20
    expect(layout.stickyTop).toBe(224)
    expect(layout.stickyZIndex).toBe(3)
  })

  test('depth 递增 paddingLeft 线性增长', () => {
    for (let depth = 0; depth < 10; depth++) {
      const layout = computeTreeRowLayout(depth)
      expect(layout.paddingLeft).toBe(16 + depth * 20)
    }
  })

  test('zIndex 随 depth 递减', () => {
    for (let depth = 0; depth < 10; depth++) {
      const layout = computeTreeRowLayout(depth)
      expect(layout.stickyZIndex).toBe(Math.max(1, 10 - depth))
    }
  })

  test('stickyTop 为 TREE_ROW_HEIGHT * depth', () => {
    for (let depth = 0; depth < 10; depth++) {
      const layout = computeTreeRowLayout(depth)
      expect(layout.stickyTop).toBe(depth * 32)
    }
  })

  test('zIndex 最小值不低于 1', () => {
    const layout = computeTreeRowLayout(100)
    expect(layout.stickyZIndex).toBe(1)
  })
})

// ============================================================
// canBeSticky
// ============================================================
describe('canBeSticky', () => {
  test('depth < 8 允许 sticky', () => {
    expect(canBeSticky(0)).toBe(true)
    expect(canBeSticky(1)).toBe(true)
    expect(canBeSticky(7)).toBe(true)
  })

  test('depth >= 8 不允许 sticky', () => {
    expect(canBeSticky(8)).toBe(false)
    expect(canBeSticky(9)).toBe(false)
    expect(canBeSticky(100)).toBe(false)
  })

  test('负数 depth', () => {
    expect(canBeSticky(-1)).toBe(true) // < 8
  })
})
