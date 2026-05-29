import { expect, test } from 'bun:test'
import config from './vite.config'

const resolvedConfig = typeof config === 'function' ? undefined : config

test('Vite dev server uses IPv4 loopback to avoid IPv6 listen EPERM', () => {
  const server = resolvedConfig?.server

  expect(server?.host).toBe('127.0.0.1')
  expect(server?.port).toBe(5173)
  expect(server?.strictPort).toBe(true)
})

test('Vite 对 TipTap 和 ProseMirror 运行时包做去重，避免 Mention 插入时 Fragment 跨实例转换', () => {
  expect(resolvedConfig?.resolve?.dedupe).toEqual(expect.arrayContaining([
    '@tiptap/core',
    '@tiptap/pm',
    '@tiptap/react',
    '@tiptap/suggestion',
    '@tiptap/extension-mention',
    'prosemirror-model',
    'prosemirror-state',
    'prosemirror-transform',
    'prosemirror-view',
  ]))
})
