import { expect, test } from 'bun:test'
import pkg from './package.json'

test('dev electron script uses workspace electronmon instead of bunx', () => {
  expect(pkg.scripts['dev:electron']).toContain('"electronmon ."')
  expect(pkg.scripts['dev:electron']).not.toContain('bunx electronmon')
})

test('build resources copies DPAPI prebuilds for Windows Feishu connector', () => {
  expect(pkg.scripts['build:resources']).toContain('copy-dpapi-prebuilds')
})
