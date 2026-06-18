import { expect, test } from 'bun:test'
import { getRemoteConnectionPlatforms } from './BotHubSettings'

test('远程连接菜单只保留飞书渠道', () => {
  const platforms = getRemoteConnectionPlatforms()

  expect(platforms.map((platform) => platform.id)).toEqual(['feishu'])
  expect(platforms[0]?.name).toBe('飞书')
})
