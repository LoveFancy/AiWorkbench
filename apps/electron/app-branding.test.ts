import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'
import pkg from './package.json'

const mainSource = readFileSync(join(import.meta.dir, 'src/main/index.ts'), 'utf-8')
const traySource = readFileSync(join(import.meta.dir, 'src/main/tray.ts'), 'utf-8')
const builderConfig = readFileSync(join(import.meta.dir, 'electron-builder.yml'), 'utf-8')
const indexHtml = readFileSync(join(import.meta.dir, 'src/renderer/index.html'), 'utf-8')
const aboutSource = readFileSync(join(import.meta.dir, 'src/renderer/components/settings/AboutSettings.tsx'), 'utf-8')

test('Electron 应用品牌名统一为 WorkMate', () => {
  expect(pkg.description).toContain('WorkMate')
  expect(pkg.description).not.toContain('DevAssist')

  expect(builderConfig).toContain('productName: WorkMate')
  expect(mainSource).toContain("app.setName('WorkMate')")
  expect(mainSource).toContain("const SAFE_STORAGE_USER_DATA_NAME = 'HtAiWorkBench'")
  expect(mainSource).toContain("app.setPath('userData', join(app.getPath('appData'), SAFE_STORAGE_USER_DATA_NAME))")
  expect(traySource).toContain("tray.setToolTip('WorkMate 伴行')")
  expect(traySource).not.toContain('DevAssist')
  expect(indexHtml).toContain('<title>WorkMate 伴行</title>')
  expect(aboutSource).toContain('关于 WorkMate 伴行')
  expect(aboutSource).toContain('label="联系人"')
  expect(aboutSource).not.toContain('label="作者"')
  expect(aboutSource).toContain('信息技术部运营管理室AI研发效能管理团队 秦晓012950')
})
