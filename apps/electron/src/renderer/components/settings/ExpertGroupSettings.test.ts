import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const expertGroupSettingsSource = await Bun.file(join(import.meta.dir, 'ExpertGroupSettings.tsx')).text()

describe('专家团设置页', () => {
  test('支持上传专家团 zip，底层复用插件安装能力', () => {
    expect(expertGroupSettingsSource).toContain('uploadingExpertGroupZip')
    expect(expertGroupSettingsSource).toContain('installAgentPluginZip')
    expect(expertGroupSettingsSource).toContain('上传专家团 Zip')
    expect(expertGroupSettingsSource).toContain('专家团插件已安装')
  })

  test('召唤专家团成功后关闭设置页', () => {
    expect(expertGroupSettingsSource).toContain("import { settingsOpenAtom } from '@/atoms/settings-tab'")
    expect(expertGroupSettingsSource).toContain('const setSettingsOpen = useSetAtom(settingsOpenAtom)')
    expect(expertGroupSettingsSource).toContain('setSettingsOpen(false)')
  })
})
