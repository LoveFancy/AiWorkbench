import type { RuleType } from '../types'

export type { RuleType }

export interface WhitelistRule {
  ruleType: RuleType
  ruleValue: string
}

export interface MatcherResult {
  matched: boolean
  matchedRule?: WhitelistRule
}

export function matchWhitelist(jobId: string, rules: WhitelistRule[]): MatcherResult {
  for (const rule of rules) {
    switch (rule.ruleType) {
      case 'list': {
        const ids = rule.ruleValue.split(',').map((id) => id.trim())
        if (ids.includes(jobId)) {
          return { matched: true, matchedRule: rule }
        }
        break
      }
      case 'range': {
        const parts = rule.ruleValue.split('-')
        if (parts.length === 2) {
          const start = parts[0].trim()
          const end = parts[1].trim()
          if (jobId >= start && jobId <= end) {
            return { matched: true, matchedRule: rule }
          }
        }
        break
      }
      case 'prefix': {
        const prefix = rule.ruleValue.replace(/\*$/, '')
        if (jobId.startsWith(prefix)) {
          return { matched: true, matchedRule: rule }
        }
        break
      }
      case 'suffix': {
        const suffix = rule.ruleValue.replace(/^\*/, '')
        if (jobId.endsWith(suffix)) {
          return { matched: true, matchedRule: rule }
        }
        break
      }
    }
  }
  return { matched: false }
}

export function matchAnyRule(jobId: string, rules: WhitelistRule[]): boolean {
  return matchWhitelist(jobId, rules).matched
}