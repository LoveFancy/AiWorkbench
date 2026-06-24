import { describe, expect, test } from 'bun:test'
import {
  FILE_TREE_DRAG_MIME,
  readFileTreeDragPayload,
  eventHasFileTreeDrag,
  eventHasExternalFiles,
  isPointerInsideElement,
} from './file-drag-utils'

// ============================================================
// 常量
// ============================================================
describe('FILE_TREE_DRAG_MIME 常量', () => {
  test('MIME 类型正确', () => {
    expect(FILE_TREE_DRAG_MIME).toBe('application/x-proma-file-tree-entry')
  })
})

// ============================================================
// readFileTreeDragPayload
// ============================================================
describe('readFileTreeDragPayload', () => {
  test('有效 payload 解析成功', () => {
    const event = {
      dataTransfer: {
        getData: (type: string) =>
          type === FILE_TREE_DRAG_MIME
            ? JSON.stringify({ paths: ['/a/b.txt', '/c/d.txt'] })
            : '',
      },
    } as unknown as React.DragEvent

    const result = readFileTreeDragPayload(event)
    expect(result).not.toBeNull()
    expect(result!.paths).toEqual(['/a/b.txt', '/c/d.txt'])
  })

  test('无效 JSON 返回 null', () => {
    const event = {
      dataTransfer: {
        getData: () => 'not-json',
      },
    } as unknown as React.DragEvent

    expect(readFileTreeDragPayload(event)).toBeNull()
  })

  test('无数据返回 null', () => {
    const event = {
      dataTransfer: {
        getData: () => '',
      },
    } as unknown as React.DragEvent

    expect(readFileTreeDragPayload(event)).toBeNull()
  })

  test('paths 字段缺失返回 null', () => {
    const event = {
      dataTransfer: {
        getData: () => JSON.stringify({ other: true }),
      },
    } as unknown as React.DragEvent

    expect(readFileTreeDragPayload(event)).toBeNull()
  })

  test('paths 为空数组返回 null', () => {
    const event = {
      dataTransfer: {
        getData: () => JSON.stringify({ paths: [] }),
      },
    } as unknown as React.DragEvent

    expect(readFileTreeDragPayload(event)).toBeNull()
  })

  test('paths 含非字符串项 — 只保留字符串', () => {
    const event = {
      dataTransfer: {
        getData: () =>
          JSON.stringify({ paths: ['/a.txt', 123, null, '/b.txt'] }),
      },
    } as unknown as React.DragEvent

    const result = readFileTreeDragPayload(event)
    expect(result).not.toBeNull()
    expect(result!.paths).toEqual(['/a.txt', '/b.txt'])
  })

  test('paths 含空字符串被过滤', () => {
    const event = {
      dataTransfer: {
        getData: () =>
          JSON.stringify({ paths: ['', '/a.txt', ''] }),
      },
    } as unknown as React.DragEvent

    const result = readFileTreeDragPayload(event)
    expect(result).not.toBeNull()
    expect(result!.paths).toEqual(['/a.txt'])
  })

  test('单个路径', () => {
    const event = {
      dataTransfer: {
        getData: () => JSON.stringify({ paths: ['/single.txt'] }),
      },
    } as unknown as React.DragEvent

    const result = readFileTreeDragPayload(event)
    expect(result).not.toBeNull()
    expect(result!.paths).toEqual(['/single.txt'])
  })
})

// ============================================================
// isPointerInsideElement
// ============================================================
describe('isPointerInsideElement', () => {
  test('元素为 null 返回 false', () => {
    const event = { clientX: 100, clientY: 100 } as React.DragEvent
    expect(isPointerInsideElement(event, null)).toBe(false)
  })

  test('指针在元素内返回 true', () => {
    const el = {
      getBoundingClientRect: () => ({
        left: 0,
        right: 200,
        top: 0,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => {},
      }),
    } as HTMLElement

    const event = { clientX: 100, clientY: 100 } as React.DragEvent
    expect(isPointerInsideElement(event, el)).toBe(true)
  })

  test('指针在边界上返回 true', () => {
    const el = {
      getBoundingClientRect: () => ({
        left: 0,
        right: 200,
        top: 0,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => {},
      }),
    } as HTMLElement

    expect(isPointerInsideElement({ clientX: 0, clientY: 0 } as React.DragEvent, el)).toBe(true)
    expect(isPointerInsideElement({ clientX: 200, clientY: 200 } as React.DragEvent, el)).toBe(true)
  })

  test('指针在元素外返回 false', () => {
    const el = {
      getBoundingClientRect: () => ({
        left: 100,
        right: 200,
        top: 100,
        bottom: 200,
        width: 100,
        height: 100,
        x: 100,
        y: 100,
        toJSON: () => {},
      }),
    } as HTMLElement

    // left side
    expect(isPointerInsideElement({ clientX: 50, clientY: 150 } as React.DragEvent, el)).toBe(false)
    // right side
    expect(isPointerInsideElement({ clientX: 250, clientY: 150 } as React.DragEvent, el)).toBe(false)
    // top
    expect(isPointerInsideElement({ clientX: 150, clientY: 50 } as React.DragEvent, el)).toBe(false)
    // bottom
    expect(isPointerInsideElement({ clientX: 150, clientY: 250 } as React.DragEvent, el)).toBe(false)
  })
})
