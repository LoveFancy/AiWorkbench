import { describe, it, expect } from 'vitest'
import { matchWhitelist, matchAnyRule } from '../utils/whitelist-matcher'

describe('matchWhitelist', () => {
  describe('list 类型', () => {
    it('应匹配逗号分隔工号列表中的工号', () => {
      const rules = [{ ruleType: 'list' as const, ruleValue: '022480,021220,012333' }]
      expect(matchWhitelist('022480', rules).matched).toBe(true)
      expect(matchWhitelist('021220', rules).matched).toBe(true)
      expect(matchWhitelist('012333', rules).matched).toBe(true)
    })

    it('不应匹配不在列表中的工号', () => {
      const rules = [{ ruleType: 'list' as const, ruleValue: '022480,021220' }]
      expect(matchWhitelist('999999', rules).matched).toBe(false)
    })

    it('应处理空格', () => {
      const rules = [{ ruleType: 'list' as const, ruleValue: '022480, 021220 , 012333' }]
      expect(matchWhitelist('022480', rules).matched).toBe(true)
      expect(matchWhitelist('021220', rules).matched).toBe(true)
      expect(matchWhitelist('012333', rules).matched).toBe(true)
    })
  })

  describe('range 类型', () => {
    it('应匹配区间内的工号', () => {
      const rules = [{ ruleType: 'range' as const, ruleValue: '022480-023480' }]
      expect(matchWhitelist('022480', rules).matched).toBe(true)
      expect(matchWhitelist('023000', rules).matched).toBe(true)
      expect(matchWhitelist('023480', rules).matched).toBe(true)
    })

    it('不应匹配区间外的工号', () => {
      const rules = [{ ruleType: 'range' as const, ruleValue: '022480-023480' }]
      expect(matchWhitelist('022479', rules).matched).toBe(false)
      expect(matchWhitelist('023481', rules).matched).toBe(false)
    })
  })

  describe('prefix 类型', () => {
    it('应匹配前缀工号', () => {
      const rules = [{ ruleType: 'prefix' as const, ruleValue: '022*' }]
      expect(matchWhitelist('022123', rules).matched).toBe(true)
      expect(matchWhitelist('022999', rules).matched).toBe(true)
    })

    it('不应匹配不同前缀的工号', () => {
      const rules = [{ ruleType: 'prefix' as const, ruleValue: '022*' }]
      expect(matchWhitelist('023123', rules).matched).toBe(false)
      expect(matchWhitelist('123456', rules).matched).toBe(false)
    })
  })

  describe('suffix 类型', () => {
    it('应匹配后缀工号', () => {
      const rules = [{ ruleType: 'suffix' as const, ruleValue: '*022' }]
      expect(matchWhitelist('123022', rules).matched).toBe(true)
      expect(matchWhitelist('999022', rules).matched).toBe(true)
    })

    it('不应匹配不同后缀的工号', () => {
      const rules = [{ ruleType: 'suffix' as const, ruleValue: '*022' }]
      expect(matchWhitelist('022123', rules).matched).toBe(false)
      expect(matchWhitelist('123023', rules).matched).toBe(false)
    })
  })

  describe('多规则组合', () => {
    it('应匹配多种规则中的任意一条', () => {
      const rules = [
        { ruleType: 'list' as const, ruleValue: '022480' },
        { ruleType: 'prefix' as const, ruleValue: '023*' },
        { ruleType: 'suffix' as const, ruleValue: '*999' },
      ]
      expect(matchWhitelist('022480', rules).matched).toBe(true)
      expect(matchWhitelist('023123', rules).matched).toBe(true)
      expect(matchWhitelist('888999', rules).matched).toBe(true)
      expect(matchWhitelist('077777', rules).matched).toBe(false)
    })

    it('应返回第一个匹配的规则', () => {
      const rules = [
        { ruleType: 'list' as const, ruleValue: '022480' },
        { ruleType: 'prefix' as const, ruleValue: '022*' },
      ]
      const result = matchWhitelist('022480', rules)
      expect(result.matched).toBe(true)
      expect(result.matchedRule!.ruleType).toBe('list')
    })
  })

  describe('空规则列表', () => {
    it('空规则列表不匹配任何工号', () => {
      expect(matchWhitelist('022480', []).matched).toBe(false)
    })
  })
})

describe('matchAnyRule', () => {
  it('应返回布尔值', () => {
    const rules = [{ ruleType: 'list' as const, ruleValue: '022480' }]
    expect(matchAnyRule('022480', rules)).toBe(true)
    expect(matchAnyRule('999999', rules)).toBe(false)
  })
})