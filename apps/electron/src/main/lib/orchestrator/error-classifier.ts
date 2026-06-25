/**
 * 统一错误分类器
 *
 * 所有 SDK 错误（assistant.error / catch 异常 / api_retry）都经过此文件分类。
 * 产出两个维度的信息：
 * - category: 编排器用做恢复决策（重试 / 换模型 / 清除 session 等）
 * - display:  前端渲染用户可见的错误展示
 *
 * 新增错误类型只需在此文件和 claude-agent-adapter.ts 的 FRIENDLY_ERROR_MESSAGES 添加。
 */

import {
  isPromptTooLongError,
  isThinkingSignatureError,
  friendlyErrorMessage,
} from '../adapters/claude-agent-adapter'
import {
  THINKING_SIGNATURE_ERROR_CODE,
  THINKING_SIGNATURE_ERROR_MESSAGE,
  THINKING_SIGNATURE_ERROR_TITLE,
} from '@proma/shared'
import { isSessionNotFoundError } from './agent-sdk-retry-loop'

// ---- 类型 ----

export interface ApiErrorInfo {
  statusCode: number
  message: string
}

/** 恢复策略类别 */
export type ErrorCategory =
  | 'session_not_found'
  | 'thinking_signature'
  | 'api_retryable'
  | 'api_fatal'

/** 用户可见的错误展示 */
export interface ErrorDisplay {
  errorCode: string
  errorTitle: string
  errorContent: string
  errorActions?: Array<{ key: string; label: string; action: string }>
}

/** 统一分类输入 */
export interface ClassifyInput {
  /** 错误消息文本（catch 的 error.message 或 assistant.error 的 detailedMessage） */
  rawErrorMessage: string
  /** 完整的错误堆栈/原文（catch 的 error.stack 或 assistant.error 的 originalError） */
  rawStack: string
  /** stderr 累积文本 */
  stderrOutput: string
  /** 从 stderr 解析出的 API 错误 */
  apiError: ApiErrorInfo | null
  /** 当前 SDK session ID（用于 session_not_found 判断） */
  existingSdkSessionId?: string
}

/** 统一分类输出 */
export interface ClassifyResult {
  category: ErrorCategory
  display: ErrorDisplay
  /** 是否为 "empty or malformed" 模式（网关/代理拦截） */
  isMalformedResponse: boolean
  /** 用于记录日志的原始信息 */
  rawErrorMessage: string
  apiError: ApiErrorInfo | null
}

// ---- 分类逻辑 ----

export function classifySdkError(input: ClassifyInput): ClassifyResult {
  const { rawErrorMessage, rawStack, stderrOutput, apiError, existingSdkSessionId } = input

  // ===== 1. Session 不存在 =====
  if (
    existingSdkSessionId &&
    isSessionNotFoundError(rawErrorMessage, stderrOutput)
  ) {
    return {
      category: 'session_not_found',
      display: {
        errorCode: 'session_not_found',
        errorTitle: '会话已过期',
        errorContent: 'SDK 会话已过期，将自动重建并回填上下文',
      },
      isMalformedResponse: false,
      rawErrorMessage,
      apiError,
    }
  }

  // ===== 2. Thinking signature =====
  if (isThinkingSignatureError(apiError?.message ?? '', rawErrorMessage, rawStack, stderrOutput)) {
    return {
      category: 'thinking_signature',
      display: {
        errorCode: THINKING_SIGNATURE_ERROR_CODE,
        errorTitle: THINKING_SIGNATURE_ERROR_TITLE,
        errorContent: `${THINKING_SIGNATURE_ERROR_TITLE}：${THINKING_SIGNATURE_ERROR_MESSAGE}`,
        errorActions: [
          { key: 'n', label: '在新对话继续', action: 'retry_in_new_session' },
          { key: 'r', label: '重试', action: 'retry' },
        ],
      },
      isMalformedResponse: false,
      rawErrorMessage,
      apiError,
    }
  }

  // ===== 3. Prompt too long =====
  if (isPromptTooLongError(rawErrorMessage, rawStack, stderrOutput)) {
    return {
      category: 'api_fatal',
      display: {
        errorCode: 'prompt_too_long',
        errorTitle: '上下文过长',
        errorContent: '上下文过长：当前对话的上下文已超出模型限制，请压缩上下文或开启新会话',
      },
      isMalformedResponse: false,
      rawErrorMessage,
      apiError,
    }
  }

  // ===== 4. 子进程退出（SDK 进程启动/运行时的瞬态故障） =====
  const processExitedMatch = /process exited with code\s+(\d+)/i.exec(rawErrorMessage)
  if (processExitedMatch) {
    const exitCode = parseInt(processExitedMatch[1]!, 10)
    return {
      category: 'api_retryable',
      display: {
        errorCode: 'process_exit',
        errorTitle: '暂时性错误',
        errorContent: `Agent 进程异常退出 (code ${exitCode})，将自动重试`,
        errorActions: [{ key: 'r', label: '重试', action: 'retry' }],
      },
      isMalformedResponse: false,
      rawErrorMessage,
      apiError,
    }
  }

  // ===== 5. "empty or malformed" 响应（不依赖 apiError，防止误匹配的假 apiError 导致分支被跳过） =====
  const isMalformed = rawErrorMessage.includes('empty or malformed')
  if (isMalformed) {
    return {
      category: 'api_retryable',
      display: {
        errorCode: 'malformed_response',
        errorTitle: '暂时性错误',
        errorContent: friendlyErrorMessage(rawErrorMessage),
        errorActions: [{ key: 'r', label: '重试', action: 'retry' }],
      },
      isMalformedResponse: true,
      rawErrorMessage,
      apiError,
    }
  }

  // ===== 6. 可自动重试 =====
  if (isAutoRetryable(apiError, rawErrorMessage, stderrOutput)) {
    return {
      category: 'api_retryable',
      display: {
        errorCode: 'api_retryable',
        errorTitle: '暂时性错误',
        errorContent: friendlyErrorMessage(rawErrorMessage),
      },
      isMalformedResponse: false,
      rawErrorMessage,
      apiError,
    }
  }

  // ===== 7. API 4xx 客户端错误（非 429）→ 不可重试 =====
  if (apiError && apiError.statusCode >= 400 && apiError.statusCode < 500 && apiError.statusCode !== 429) {
    return {
      category: 'api_fatal',
      display: {
        errorCode: 'api_client_error',
        errorTitle: '请求错误',
        errorContent: friendlyErrorMessage(`API 错误 (${apiError.statusCode}):\n${apiError.message}`),
      },
      isMalformedResponse: false,
      rawErrorMessage,
      apiError,
    }
  }

  // ===== 8. 其余错误 → 可重试 =====
  const userFacing = apiError
    ? friendlyErrorMessage(`API 错误 (${apiError.statusCode}):\n${apiError.message}`)
    : friendlyErrorMessage(rawErrorMessage) || '未知错误'
  return {
    category: 'api_retryable',
    display: {
      errorCode: 'unknown_error',
      errorTitle: '暂时性错误',
      errorContent: userFacing,
      errorActions: [{ key: 'r', label: '重试', action: 'retry' }],
    },
    isMalformedResponse: false,
    rawErrorMessage,
    apiError,
  }
}

// ---- 可重试判断 ----

function isAutoRetryable(
  apiError: ApiErrorInfo | null,
  rawErrorMessage: string,
  stderrOutput: string,
): boolean {
  if (apiError) {
    if (apiError.statusCode === 429 || apiError.statusCode >= 500) return true
  }
  if (rawErrorMessage.includes('context_management')) return true
  const text = `${rawErrorMessage}\n${stderrOutput}`
  if (/\b502\b|\b529\b|overloaded/i.test(text)) return true
  return false
}

// ===== 辅助：从 assistant.error 的 TypedError 构建 fatal 结果 =====
// 用于 agent-sdk-retry-loop 中 assistant.error 不可重试分支 ——
// mapSDKErrorToTypedError 已经完成了分类，只需包装为 ClassifyResult 供 orchestrator 使用。

export function classifyFromTypedError(
  typedError: { code: string; title: string; message: string; actions?: Array<{ key: string; label: string; action: string }> },
  rawErrorMessage: string,
  apiError: ApiErrorInfo | null,
): ClassifyResult {
  const isThinking = typedError.code === THINKING_SIGNATURE_ERROR_CODE
  const friendlyMsg = friendlyErrorMessage(typedError.message)
  const isMalformed = typedError.message.includes('empty or malformed')

  return {
    category: isThinking
      ? 'thinking_signature'
      : isMalformed
        ? 'api_retryable'
        : 'api_fatal',
    display: {
      errorCode: typedError.code || 'unknown_error',
      errorTitle: typedError.title || '执行错误',
      errorContent: typedError.title
        ? `${typedError.title}: ${friendlyMsg}`
        : friendlyMsg,
      errorActions: typedError.actions
        ?? (isMalformed ? [{ key: 'r', label: '重试', action: 'retry' }] : undefined),
    },
    isMalformedResponse: isMalformed,
    rawErrorMessage,
    apiError,
  }
}
