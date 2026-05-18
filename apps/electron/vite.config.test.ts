import { expect, test } from 'bun:test'
import config from './vite.config'

test('Vite dev server uses IPv4 loopback to avoid IPv6 listen EPERM', () => {
  const server = typeof config === 'function' ? undefined : config.server

  expect(server?.host).toBe('127.0.0.1')
  expect(server?.port).toBe(5173)
  expect(server?.strictPort).toBe(true)
})
