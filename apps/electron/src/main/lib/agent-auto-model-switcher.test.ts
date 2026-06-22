import { describe, expect, test } from 'bun:test'
import {
  filterCandidatePoolByCapabilities,
  type CandidateModelCapabilityRef,
} from './agent-auto-model-capabilities'

describe('agent-auto-model-switcher capabilities', () => {
  const pool: CandidateModelCapabilityRef[] = [
    { modelId: 'text-a', supportsMultimodal: false },
    { modelId: 'vision-a', supportsMultimodal: true },
    { modelId: 'text-b', supportsMultimodal: false },
    { modelId: 'vision-b', supportsMultimodal: true },
  ]

  test('需要视觉上下文时过滤纯文本候选', () => {
    expect(filterCandidatePoolByCapabilities(pool, { requiresMultimodal: true }).map((item) => item.modelId))
      .toEqual(['vision-a', 'vision-b'])
  })

  test('不需要视觉上下文时保留完整候选池', () => {
    expect(filterCandidatePoolByCapabilities(pool, {}).map((item) => item.modelId))
      .toEqual(['text-a', 'vision-a', 'text-b', 'vision-b'])
  })
})
