export interface CandidateModelCapabilityRef {
  modelId: string
  supportsMultimodal?: boolean
}

export interface AutoModeCapabilityFilter {
  requiresMultimodal?: boolean
}

export function candidateSatisfiesCapabilities(
  candidate: CandidateModelCapabilityRef,
  requiredCapabilities: AutoModeCapabilityFilter,
): boolean {
  if (requiredCapabilities.requiresMultimodal && candidate.supportsMultimodal !== true) return false
  return true
}

export function filterCandidatePoolByCapabilities<T extends CandidateModelCapabilityRef>(
  candidatePool: T[],
  requiredCapabilities: AutoModeCapabilityFilter,
): T[] {
  if (!requiredCapabilities.requiresMultimodal) return candidatePool
  return candidatePool.filter((candidate) => candidateSatisfiesCapabilities(candidate, requiredCapabilities))
}
