/**
 * 错误展示与分类
 *
 * 将 SDK 运行中产生的原始错误信息（异常、stderr、apiError）转换为结构化的、
 * 可展示给用户的错误描述和日志输出。
 *
 * 两个消费方：
 * - agent-sdk-retry-loop.ts：assistant.error 消息路径
 * - agent-orchestrator.ts：catch 异常路径
 */

import type { SDKMessage } from '@proma/shared'
import {
  THINKING_SIGNATURE_ERROR_CODE,
  THINKING_SIGNATURE_ERROR_MESSAGE,
  THINKING_SIGNATURE_ERROR_TITLE,
} from '@proma/shared'
import {
  isPromptTooLongError,
  isThinkingSignatureError,
  friendlyErrorMessage,
} from '../adapters/claude-agent-adapter'

// ---- 类型 ----

export interface ApiErrorInfo {
  statusCode: number
  message: string
}

export interface ClassifiedError {
  /** 错误分类码（用于前端渲染） */
  errorCode: string
  /** 用户可见的简短标题 */
  errorTitle: string
  /** 用户可见的完整内容 */
  errorContent: string
  /** 前端操作按钮（如"在新对话继续"/"重试"） */
  errorActions?: Array<{ key: string; label: string; action: string }>
  /** 用于日志的原始错误描述 */
  rawMessage: string
  /** 从 stderr 解析出的 API 错误（含状态码） */
  apiError: ApiErrorInfo | null
  /** 是否为 prompt_too_long */
  isPromptTooLong: boolean
  /** 是否为 thinking_signature */
  isThinkingSignature: boolean
}

export interface ErrorSDKMessageFields {
  _errorCode: string
  _errorTitle: string
  _errorActions?: Array<{ key: string; label: string; action: string }>
  error: { message: string; errorType: string }
}

// ---- 日志输出 ----

/**
 * 将 stderr 内容输出到日志。
 * 便于排查问题时从日志中直接看到 SDK 的原始报错。
 */
export function logStderr(stderrChunks: string[]): void {
  const fullStderr = stderrChunks.join('').trim()
  if (fullStderr) {
    console.error(`[Agent 编排] 完整 stderr 输出 (${fullStderr.length} 字符):`)
    console.error(fullStderr)
  } else {
    console.error(`[Agent 编排] stderr 为空`)
  }
}

// ---- 错误分类 ----

/**
 * 对 catch 路径捕获的原始错误进行分类，生成用户可见的错误展示信息。
 *
 * @param rawError    - catch 块捕获的 error 对象
 * @param stderrText  - stderr 累积文本
 * @param apiError    - 从 stderr 解析出的 API 错误（可能为 null）
 */
export function classifyCatchError(
  rawError: unknown,
  stderrText: string,
  apiError: ApiErrorInfo | null,
): ClassifiedError {
  const rawErrorMessage = rawError instanceof Error ? rawError.message : ''
  const rawStack = rawError instanceof Error ? (rawError.stack ?? rawError.message) : String(rawError)

  // 构建初始用户可见消息
  let userFacingError: string
  if (apiError) {
    userFacingError = friendlyErrorMessage(`API 错误 (${apiError.statusCode}):\n${apiError.message}`)
    console.log(`[Agent 编排] catch API 错误: status=${apiError.statusCode}, message=${apiError.message}`)
  } else {
    userFacingError = friendlyErrorMessage(rawErrorMessage)
    console.log(`[Agent 编排] catch 未知错误: ${rawErrorMessage.slice(0, 200)}`)
  }

  // 检测已知错误类型
  const isPromptTooLong = isPromptTooLongError(userFacingError, rawStack, stderrText)
  const isThinkingSignature = isThinkingSignatureError(
    apiError?.message ?? '',
    userFacingError,
    rawErrorMessage,
    rawStack,
    stderrText,
  )

  // 分类结果
  const errorCode = isPromptTooLong
    ? 'prompt_too_long'
    : isThinkingSignature
      ? THINKING_SIGNATURE_ERROR_CODE
      : 'unknown_error'

  const errorTitle = isPromptTooLong
    ? '上下文过长'
    : isThinkingSignature
      ? THINKING_SIGNATURE_ERROR_TITLE
      : '执行错误'

  const errorContent = isPromptTooLong
    ? '上下文过长：当前对话的上下文已超出模型限制，请压缩上下文或开启新会话'
    : isThinkingSignature
      ? `${THINKING_SIGNATURE_ERROR_TITLE}：${THINKING_SIGNATURE_ERROR_MESSAGE}`
      : userFacingError

  const errorActions = isThinkingSignature
    ? [
        { key: 'n', label: '在新对话继续', action: 'retry_in_new_session' },
        { key: 'r', label: '重试', action: 'retry' },
      ]
    : undefined

  return {
    errorCode,
    errorTitle,
    errorContent,
    errorActions,
    rawMessage: rawErrorMessage,
    apiError,
    isPromptTooLong,
    isThinkingSignature,
  }
}

// ---- SDKMessage 构建 ----

/**
 * 基于分类后的错误信息，构造用于持久化和前端渲染的 SDKMessage。
 */
export function buildErrorSDKMessage(
  classified: Pick<ClassifiedError, 'errorCode' | 'errorTitle' | 'errorContent' | 'errorActions'>,
): SDKMessage {
  return {
    type: 'assistant',
    message: {
      content: [{ type: 'text', text: classified.errorContent }],
    },
    parent_tool_use_id: null,
    error: { message: classified.errorContent, errorType: classified.errorCode },
    _createdAt: Date.now(),
    _errorCode: classified.errorCode,
    _errorTitle: classified.errorTitle,
    _errorActions: classified.errorActions,
  } as unknown as SDKMessage
}

/**
 * 用给定的 title + content 构造一个简单的错误 SDKMessage。
 * 适用于重试耗尽等简单场景。
 */
export function buildSimpleErrorSDKMessage(
  errorContent: string,
  errorCode: string,
  errorTitle: string,
): SDKMessage {
  return buildErrorSDKMessage({
    errorCode,
    errorTitle,
    errorContent,
    errorActions: undefined,
  })
}

// ---- session 清理策略 ----

/**
 * 决定发生错误后是否应清除 sdkSessionId。
 *
 * 5xx / 无 API 错误 → 清除（服务端异常可能导致 session 状态不一致）
 * 4xx（非 5xx）→ 保留（可能是客户端参数问题，session 本身可能仍有效）
 */
export function shouldClearSDKSessionId(apiError: ApiErrorInfo | null): boolean {
  return !apiError || apiError.statusCode >= 500
}
