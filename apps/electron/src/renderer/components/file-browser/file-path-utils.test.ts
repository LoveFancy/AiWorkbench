import { describe, expect, test } from 'bun:test'
import {
  normalizeFsPath,
  getParentPath,
  isSameOrChildPath,
  isPathUnderRoot,
  computeRevealAncestors,
  filterMovablePaths,
} from './file-path-utils'

// ============================================================
// normalizeFsPath
// ============================================================
describe('normalizeFsPath', () => {
  test('去掉尾部斜杠', () => {
    expect(normalizeFsPath('/a/b/')).toBe('/a/b')
    expect(normalizeFsPath('/a/b\\')).toBe('/a/b')
    expect(normalizeFsPath('C:\\foo\\bar\\')).toBe('C:\\foo\\bar')
  })

  test('多个尾部斜杠', () => {
    expect(normalizeFsPath('/a/b///')).toBe('/a/b')
    expect(normalizeFsPath('C:\\foo\\\\')).toBe('C:\\foo')
  })

  test('无尾部斜杠原样返回', () => {
    expect(normalizeFsPath('/a/b')).toBe('/a/b')
    expect(normalizeFsPath('C:\\foo\\bar')).toBe('C:\\foo\\bar')
  })

  test('根路径（单斜杠）', () => {
    expect(normalizeFsPath('/')).toBe('')
    expect(normalizeFsPath('/')).toBe('')
  })

  test('空字符串', () => {
    expect(normalizeFsPath('')).toBe('')
  })
})

// ============================================================
// getParentPath
// ============================================================
describe('getParentPath', () => {
  test('unix 路径获取父目录', () => {
    expect(getParentPath('/a/b/c.txt')).toBe('/a/b')
    expect(getParentPath('/a/b/')).toBe('/a')
  })

  test('windows 路径获取父目录', () => {
    expect(getParentPath('C:\\foo\\bar.txt')).toBe('C:\\foo')
    expect(getParentPath('C:\\foo\\bar\\')).toBe('C:\\foo')
  })

  test('根下一层文件', () => {
    expect(getParentPath('/a')).toBe('/a')
    expect(getParentPath('C:\\foo')).toBe('C:')
  })

  test('路径末尾无分隔符的文件', () => {
    expect(getParentPath('/a/b/c')).toBe('/a/b')
  })

  test('深度嵌套', () => {
    expect(getParentPath('/a/b/c/d/e/f')).toBe('/a/b/c/d/e')
  })
})

// ============================================================
// isSameOrChildPath
// ============================================================
describe('isSameOrChildPath', () => {
  test('相同路径返回 true', () => {
    expect(isSameOrChildPath('/a/b', '/a/b')).toBe(true)
    expect(isSameOrChildPath('/a/b/', '/a/b')).toBe(true)
    expect(isSameOrChildPath('/a/b', '/a/b/')).toBe(true)
  })

  test('子路径返回 true', () => {
    expect(isSameOrChildPath('/a', '/a/b')).toBe(true)
    expect(isSameOrChildPath('/a', '/a/b/c')).toBe(true)
    expect(isSameOrChildPath('/a', '/a/b.txt')).toBe(true)
  })

  test('windows 子路径', () => {
    expect(isSameOrChildPath('C:\\foo', 'C:\\foo\\bar')).toBe(true)
    expect(isSameOrChildPath('C:\\foo', 'C:\\foo\\bar\\baz.txt')).toBe(true)
  })

  test('非子路径返回 false', () => {
    expect(isSameOrChildPath('/a', '/b')).toBe(false)
    expect(isSameOrChildPath('/a/b', '/a/c')).toBe(false)
    expect(isSameOrChildPath('/a', '/ab')).toBe(false) // 前缀但不是分隔符
  })

  test('祖先路径返回 false', () => {
    expect(isSameOrChildPath('/a/b', '/a')).toBe(false)
  })

  test('完全不同根', () => {
    expect(isSameOrChildPath('C:\\foo', 'D:\\bar')).toBe(false)
    expect(isSameOrChildPath('/home', '/var')).toBe(false)
  })
})

// ============================================================
// isPathUnderRoot
// ============================================================
describe('isPathUnderRoot', () => {
  test('根路径自身返回 true', () => {
    expect(isPathUnderRoot('/a/b', '/a/b')).toBe(true)
    expect(isPathUnderRoot('/a/b/', '/a/b')).toBe(true)
  })

  test('根下的子路径返回 true', () => {
    expect(isPathUnderRoot('/a/b', '/a/b/c')).toBe(true)
    expect(isPathUnderRoot('/a/b', '/a/b/c/d.txt')).toBe(true)
    expect(isPathUnderRoot('/a/b/', '/a/b/c/d.txt')).toBe(true)
  })

  test('windows 根下的子路径', () => {
    expect(isPathUnderRoot('C:\\Users', 'C:\\Users\\file.txt')).toBe(true)
    expect(isPathUnderRoot('C:\\Users', 'C:\\Users\\sub\\file.txt')).toBe(true)
  })

  test('非根下的路径返回 false', () => {
    expect(isPathUnderRoot('/a/b', '/c/d')).toBe(false)
    expect(isPathUnderRoot('/a/b', '/a/c')).toBe(false)
    expect(isPathUnderRoot('/a/b', '/ab/c')).toBe(false) // 前缀但不是分隔符
  })

  test('空路径', () => {
    expect(isPathUnderRoot('', '/a')).toBe(false)
    expect(isPathUnderRoot('/a', '')).toBe(false)
    expect(isPathUnderRoot('', '')).toBe(false)
  })
})

// ============================================================
// computeRevealAncestors
// ============================================================
describe('computeRevealAncestors', () => {
  test('单层子路径的祖先', () => {
    const result = computeRevealAncestors('/root', '/root/sub')
    expect(result.size).toBe(0) // sub 是 target，不含自身
  })

  test('多层嵌套的祖先集合', () => {
    const result = computeRevealAncestors('/root', '/root/a/b/c/file.txt')
    expect(result.has('/root/a')).toBe(true)
    expect(result.has('/root/a/b')).toBe(true)
    expect(result.has('/root/a/b/c')).toBe(true)
    expect(result.has('/root/a/b/c/file.txt')).toBe(false) // 不含 target 自身
    expect(result.has('/root')).toBe(false)                // 不含 root 自身
    expect(result.size).toBe(3)
  })

  test('target 等于 root 时返回空', () => {
    expect(computeRevealAncestors('/root', '/root').size).toBe(0)
    expect(computeRevealAncestors('/root/', '/root').size).toBe(0)
  })

  test('target 不在 root 下返回空', () => {
    expect(computeRevealAncestors('/root', '/other/file').size).toBe(0)
  })

  test('空路径返回空', () => {
    expect(computeRevealAncestors('', '/a/b').size).toBe(0)
    expect(computeRevealAncestors('/a', '').size).toBe(0)
  })

  test('windows 路径', () => {
    const result = computeRevealAncestors('C:\\work', 'C:\\work\\src\\utils\\helper.ts')
    expect(result.has('C:\\work\\src')).toBe(true)
    expect(result.has('C:\\work\\src\\utils')).toBe(true)
    expect(result.size).toBe(2)
  })

  test('带尾部斜杠的 root', () => {
    const result = computeRevealAncestors('/root/', '/root/a/b/c')
    expect(result.has('/root/a')).toBe(true)
    expect(result.has('/root/a/b')).toBe(true)
    expect(result.size).toBe(2)
  })
})

// ============================================================
// filterMovablePaths
// ============================================================
describe('filterMovablePaths', () => {
  test('普通移动 — 全部可移动', () => {
    const result = filterMovablePaths(['/a/1.txt', '/a/2.txt'], '/b')
    expect(result).toEqual(['/a/1.txt', '/a/2.txt'])
  })

  test('去重', () => {
    const result = filterMovablePaths(['/a/1.txt', '/a/1.txt', '/a/2.txt'], '/b')
    expect(result).toEqual(['/a/1.txt', '/a/2.txt'])
  })

  test('已在目标目录中的文件跳过（相同父目录）', () => {
    const result = filterMovablePaths(['/target/a.txt', '/b/c.txt'], '/target')
    expect(result).toEqual(['/b/c.txt'])
  })

  test('目标目录是自身的祖先 — 不移动自己到自己下面', () => {
    const result = filterMovablePaths(['/root/sub'], '/root')
    // /root 是 /root/sub 的祖先，移动 /root/sub 到 /root 没意义
    expect(result).toEqual([])
  })

  test('混合场景', () => {
    const result = filterMovablePaths(
      ['/src/a.txt', '/target/b.txt', '/src/c.txt'],
      '/target',
    )
    // /target/b.txt 已在 /target 中，跳过
    expect(result).toEqual(['/src/a.txt', '/src/c.txt'])
  })

  test('全部可移动 — 不同父目录', () => {
    const result = filterMovablePaths(['/src/a.txt', '/lib/b.txt'], '/dest')
    expect(result).toEqual(['/src/a.txt', '/lib/b.txt'])
  })

  test('空列表', () => {
    expect(filterMovablePaths([], '/dest')).toEqual([])
  })

  test('只有一个文件且在目标目录中', () => {
    expect(filterMovablePaths(['/dest/a.txt'], '/dest')).toEqual([])
  })

  test('已去重 + 已在目标目录中的组合', () => {
    const result = filterMovablePaths(
      ['/dst/a.txt', '/dst/a.txt', '/other/b.txt'],
      '/dst',
    )
    expect(result).toEqual(['/other/b.txt'])
  })
})
