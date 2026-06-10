import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const formSource = await Bun.file(join(import.meta.dir, 'AutomationFormView.tsx')).text()
const listSource = await Bun.file(join(import.meta.dir, 'AutomationsListView.tsx')).text()

describe('定时任务表单文案', () => {
  test('推荐说明引导用户在普通 Agent 模式会话中说清楚目标', () => {
    expect(formSource).toContain('推荐：让 WorkMate Agent 创建')
    expect(formSource).toContain('在普通 Agent 模式会话中说清楚目标、周期和期望结果')
    expect(formSource).not.toContain('让 Proma Agent 创建')
    expect(formSource).not.toContain('在左侧会话里')
  })

  test('手动编写示例不再出现 Proma 品牌名', () => {
    expect(formSource).toContain('检查项目仓库新增 issue')
    expect(formSource).not.toContain('检查 Proma 仓库新增 issue')
  })

  test('表单不展示飞书通知选项', () => {
    expect(formSource).not.toContain('飞书通知')
    expect(formSource).not.toContain('auto-feishu-notify')
    expect(formSource).not.toContain('listFeishuBindings')
  })

  test('空列表说明使用 WorkMate 品牌', () => {
    expect(listSource).toContain('让 WorkMate 自动识别并创建')
    expect(listSource).not.toContain('让 Proma 自动识别并创建')
  })
})
