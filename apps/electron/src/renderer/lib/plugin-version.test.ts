import { describe, expect, test } from 'bun:test'

import { isPluginUpdateAvailable } from './plugin-version'

describe('插件版本比较', () => {
  test('市场版本等于本地版本时不展示更新', () => {
    expect(isPluginUpdateAvailable('2.7.0', '2.7.0')).toBe(false)
  })

  test('市场版本大于本地版本时展示更新', () => {
    expect(isPluginUpdateAvailable('2.8.0', '2.7.0')).toBe(true)
  })

  test('缺少版本信息时不展示更新', () => {
    expect(isPluginUpdateAvailable(undefined, '2.7.0')).toBe(false)
    expect(isPluginUpdateAvailable('2.8.0', undefined)).toBe(false)
  })
})
