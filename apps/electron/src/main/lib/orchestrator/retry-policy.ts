import {
  MAX_AUTO_RETRIES,
} from './agent-sdk-retry-loop'

export const MAX_MALFORMED_RESPONSE_RETRIES = 5

export function getRetryLimitForCategory(category: string | undefined): number {
  if (category === 'api_retryable') return MAX_MALFORMED_RESPONSE_RETRIES
  return MAX_AUTO_RETRIES
}
