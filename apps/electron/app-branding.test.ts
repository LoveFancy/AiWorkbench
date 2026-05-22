import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'
import pkg from './package.json'

const mainSource = readFileSync(join(import.meta.dir, 'src/main/index.ts'), 'utf-8')
const traySource = readFileSync(join(import.meta.dir, 'src/main/tray.ts'), 'utf-8')
const builderConfig = readFileSync(join(import.meta.dir, 'electron-builder.yml'), 'utf-8')

test('Electron 应用品牌名统一为 HtAiWorkBench', () => {
  expect(pkg.description).toContain('HtAiWorkBench')
  expect(pkg.description).not.toContain('DevAssist')

  expect(builderConfig).toContain('productName: HtAiWorkBench')
  expect(mainSource).toContain("app.setName('HtAiWorkBench')")
  expect(traySource).toContain("tray.setToolTip('HtAiWorkBench')")
  expect(traySource).not.toContain('DevAssist')
})
