import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const pickerSource = await Bun.file(join(import.meta.dir, 'ExpertGroupPicker.tsx')).text()
const cardSource = await Bun.file(join(import.meta.dir, '..', 'expert-groups', 'ExpertGroupCard.tsx')).text()
const statusBadgeSource = await Bun.file(join(import.meta.dir, '..', 'expert-groups', 'ExpertGroupStatusBadge.tsx')).text()

describe('召唤专家弹框布局', () => {
  test('弹框宽度收敛到内容友好的尺寸且最多展示两列专家团卡片', () => {
    expect(pickerSource).toContain('w-[min(92vw,760px)]')
    expect(pickerSource).toContain('max-w-3xl')
    expect(pickerSource).toContain('md:grid-cols-2')
    expect(pickerSource).not.toContain('xl:grid-cols-3')
  })

  test('召唤弹框中的紧凑卡片不展示专家团 ID chip', () => {
    expect(cardSource).toContain('!compact &&')
    expect(cardSource).toContain('专家团 ID')
  })

  test('可用状态使用绿色强调', () => {
    expect(statusBadgeSource).toContain('bg-emerald')
    expect(statusBadgeSource).toContain('可用')
  })

  test('专家团卡片能力摘要使用中文和图标项', () => {
    expect(cardSource).toContain('个子智能体')
    expect(cardSource).toContain('个技能')
    expect(cardSource).toContain('个 MCP')
    expect(cardSource).toContain('Wrench')
    expect(cardSource).toContain('Network')
  })

  test('弹框说明文案简洁说明会创建专家会话', () => {
    expect(pickerSource).toContain('选择一个专家团，创建带专属主角色和协作能力的新 Agent 会话。')
    expect(pickerSource).not.toContain('并绑定对应的主角色、SubAgents 和插件能力')
  })

  test('搜索框不占满整个弹框宽度', () => {
    expect(pickerSource).toContain('relative max-w-xl')
  })
})
