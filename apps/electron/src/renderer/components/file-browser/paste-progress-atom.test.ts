import { describe, expect, test } from 'bun:test'
import {
  pasteProgressAtom,
  upsertPasteProgressAtom,
  removePasteProgressAtom,
  clearPasteProgressAtom,
} from './paste-progress-atom'

// ============================================================
// pasteProgressAtom — atom 定义验证
// ============================================================
describe('pasteProgressAtom', () => {
  test('atom 已定义', () => {
    expect(pasteProgressAtom).toBeDefined()
  })

  test('upsertPasteProgressAtom 已定义', () => {
    expect(upsertPasteProgressAtom).toBeDefined()
  })

  test('removePasteProgressAtom 已定义', () => {
    expect(removePasteProgressAtom).toBeDefined()
  })

  test('clearPasteProgressAtom 已定义', () => {
    expect(clearPasteProgressAtom).toBeDefined()
  })
})
