import { expect, test } from 'bun:test'
import pkg from './package.json'

test('dev electron script uses workspace electronmon instead of bunx', () => {
  expect(pkg.scripts['dev:electron']).toContain('"electronmon ."')
  expect(pkg.scripts['dev:electron']).not.toContain('bunx electronmon')
})
