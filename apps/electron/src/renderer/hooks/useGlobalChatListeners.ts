/**
 * useGlobalChatListeners — 全局 Chat IPC 监听器
 *
 * 在应用顶层挂载，永不销毁。将所有 Chat 流式事件
 * 写入对应 Jotai atoms，确保页面切换时不丢失事件。
 *
 * 参照 useGlobalAgentListeners 模式，使用 useStore() 直接操作 atoms。
 */

import { useEffect } from 'react'
import { useStore } from 'jotai'
import {
  streamingStatesAtom,
  chatStreamErrorsAtom,
  conversationsAtom,
  chatMessageRefreshAtom,
  pendingAgentRecommendationAtom,
  chatRetryingAtom,
} from '@/atoms/chat-atoms'
import { tabsAtom, updateTabTitle } from '@/atoms/tab-atoms'
import type { ConversationStreamState, ChatRetryingState } from '@/atoms/chat-atoms'
import type {
  StreamChunkEvent,
  StreamReasoningEvent,
  StreamCompleteEvent,
  StreamErrorEvent,
  StreamToolActivityEvent,
  StreamRetryEvent,
  StreamRetryAttemptEvent,
  StreamRetryClearedEvent,
  StreamRetryFailedEvent,
  ChatRetryAttempt,
  GenerateTitleInput,
} from '@proma/shared'

/** 待生成标题的队列（按 conversationId 跟踪） */
const pendingTitles = new Map<string, GenerateTitleInput>()

/**
 * 注册待生成标题信息（由 ChatView.handleSend 在首条消息时调用）
 */
export function registerPendingTitle(conversationId: string, input: GenerateTitleInput): void {
  pendingTitles.set(conversationId, input)
}

export function useGlobalChatListeners(): void {
  const store = useStore()

  useEffect(() => {
    /** 辅助函数：更新 Map 中某个对话的流式状态 */
    const updateState = (
      convId: string,
      updater: (prev: ConversationStreamState) => ConversationStreamState
    ): void => {
      store.set(streamingStatesAtom, (prev) => {
        const current = prev.get(convId) ?? {
          streaming: false,
          content: '',
          reasoning: '',
          model: undefined,
          toolActivities: [],
          startedAt: Date.now(),
        }
        const next = updater(current)
        const map = new Map(prev)
        map.set(convId, next)
        return map
      })
    }

    /** 辅助函数：从 Map 中移除某个对话的流式状态 */
    const removeState = (convId: string): void => {
      store.set(streamingStatesAtom, (prev) => {
        if (!prev.has(convId)) return prev
        const map = new Map(prev)
        map.delete(convId)
        return map
      })
    }

    // ===== 1. 流式内容块 =====
    const cleanupChunk = window.electronAPI.onStreamChunk(
      (event: StreamChunkEvent) => {
        updateState(event.conversationId, (s) => ({
          ...s,
          content: s.content + event.delta,
        }))
      }
    )

    // ===== 2. 流式推理内容 =====
    const cleanupReasoning = window.electronAPI.onStreamReasoning(
      (event: StreamReasoningEvent) => {
        updateState(event.conversationId, (s) => ({
          ...s,
          reasoning: s.reasoning + event.delta,
        }))
      }
    )

    // ===== 3. 流式完成 =====
    const cleanupComplete = window.electronAPI.onStreamComplete(
      (event: StreamCompleteEvent) => {
        // 标记 streaming=false，但保留 content/reasoning 作为过渡气泡
        // 流式状态的完全清除由 ChatView 在消息加载完成后执行（见 chatMessageRefreshAtom 的 useEffect），
        // 确保不会出现「气泡消失 → 持久化消息尚未加载」的空档闪烁
        updateState(event.conversationId, (s) => ({ ...s, streaming: false }))

        // 递增消息刷新版本号，通知 ChatView 重新加载消息
        store.set(chatMessageRefreshAtom, (prev) => {
          const map = new Map(prev)
          map.set(event.conversationId, (prev.get(event.conversationId) ?? 0) + 1)
          return map
        })

        // 刷新对话列表（updatedAt 已更新）
        window.electronAPI
          .listConversations()
          .then((convs) => store.set(conversationsAtom, convs))
          .catch(console.error)

        // 第一条消息回复完成后，生成对话标题
        const titleInput = pendingTitles.get(event.conversationId)
        if (titleInput) {
          pendingTitles.delete(event.conversationId)
          console.log('[GlobalChatListeners] 开始生成标题:', titleInput)
          window.electronAPI.generateTitle(titleInput).then((title) => {
            console.log('[GlobalChatListeners] 标题生成结果:', title)
            if (!title) return
            window.electronAPI
              .updateConversationTitle(event.conversationId, title)
              .then((updated) => {
                console.log('[GlobalChatListeners] 标题更新成功:', updated.title)
                store.set(conversationsAtom, (prev) =>
                  prev.map((c) => (c.id === updated.id ? updated : c))
                )
                // 同步更新标签页标题
                store.set(tabsAtom, (prev) => updateTabTitle(prev, event.conversationId, title))
              })
              .catch(console.error)
          }).catch((error) => {
            console.error('[GlobalChatListeners] 标题生成失败:', error)
          })
        }
      }
    )

    // ===== 4. 流式错误 =====
    const cleanupError = window.electronAPI.onStreamError(
      (event: StreamErrorEvent) => {
        console.error('[GlobalChatListeners] 流式错误:', event.error)

        // 标记 streaming=false，保留内容作为过渡（与完成逻辑一致）
        updateState(event.conversationId, (s) => ({ ...s, streaming: false }))

        // 存储错误消息，供 UI 显示
        store.set(chatStreamErrorsAtom, (prev) => {
          const map = new Map(prev)
          map.set(event.conversationId, event.error)
          return map
        })

        // 递增消息刷新版本号，通知 ChatView 重新加载消息
        // 流式状态的完全清除由 ChatView 在消息加载完成后执行
        store.set(chatMessageRefreshAtom, (prev) => {
          const map = new Map(prev)
          map.set(event.conversationId, (prev.get(event.conversationId) ?? 0) + 1)
          return map
        })
      }
    )

    // ===== 5. 工具活动 =====
    const cleanupToolActivity = window.electronAPI.onStreamToolActivity(
      (event: StreamToolActivityEvent) => {
        updateState(event.conversationId, (s) => ({
          ...s,
          toolActivities: [...s.toolActivities, event.activity],
        }))

        // 检测 Agent 推荐工具结果，写入推荐 atom
        if (
          event.activity.type === 'result'
          && event.activity.toolName === 'suggest_agent_mode'
          && event.activity.result
          && !event.activity.isError
        ) {
          try {
            const parsed = JSON.parse(event.activity.result) as {
              type?: string
              reason?: string
              suggestedPrompt?: string
            }
            if (parsed.type === 'agent_recommendation' && parsed.reason && parsed.suggestedPrompt) {
              store.set(pendingAgentRecommendationAtom, {
                reason: parsed.reason,
                suggestedPrompt: parsed.suggestedPrompt,
                conversationId: event.conversationId,
              })
            }
          } catch {
            // JSON 解析失败，忽略
          }
        }
      }
    )

    // ===== 6. Chat 重试开始 =====
    const cleanupRetrying = window.electronAPI.onStreamRetrying(
      (event: StreamRetryEvent) => {
        // 清除上一次尝试残留的流式内容，防止新旧内容叠加
        store.set(streamingStatesAtom, (prev) => {
          if (!prev.has(event.conversationId)) return prev
          const map = new Map(prev)
          map.delete(event.conversationId)
          return map
        })
        // 清除上一次的错误信息
        store.set(chatStreamErrorsAtom, (prev) => {
          if (!prev.has(event.conversationId)) return prev
          const map = new Map(prev)
          map.delete(event.conversationId)
          return map
        })

        store.set(chatRetryingAtom, (prev) => {
          const map = new Map(prev)
          const current = map.get(event.conversationId)
          const prevHistory = current?.history ?? []

          // 将上一次失败记录为 history 条目
          const prevAttemptRecord: ChatRetryAttempt = {
            attempt: event.attempt - 1,
            maxAttempts: event.maxAttempts,
            timestamp: Date.now(),
            delaySeconds: event.delaySeconds,
            reason: event.reason,
            errorMessage: event.reason,
          }

          map.set(event.conversationId, {
            currentAttempt: event.attempt,
            maxAttempts: event.maxAttempts,
            delaySeconds: event.delaySeconds,
            reason: event.reason,
            lastRetryStartedAt: Date.now(),
            history: event.attempt > 1 ? [...prevHistory, prevAttemptRecord] : prevHistory,
            failed: false,
          })
          return map
        })
      }
    )

    // ===== 7. Chat 重试尝试记录 =====
    const cleanupRetryAttempt = window.electronAPI.onStreamRetryAttempt(
      (event: StreamRetryAttemptEvent) => {
        store.set(chatRetryingAtom, (prev) => {
          const map = new Map(prev)
          const current = map.get(event.conversationId)
          if (current) {
            map.set(event.conversationId, {
              ...current,
              history: [...current.history, event.attempt],
            })
          }
          return map
        })
      }
    )

    // ===== 8. Chat 重试清除 =====
    const cleanupRetryCleared = window.electronAPI.onStreamRetryCleared(
      (event: StreamRetryClearedEvent) => {
        store.set(chatRetryingAtom, (prev) => {
          if (!prev.has(event.conversationId)) return prev
          const map = new Map(prev)
          map.delete(event.conversationId)
          return map
        })
      }
    )

    // ===== 9. Chat 重试失败 =====
    const cleanupRetryFailed = window.electronAPI.onStreamRetryFailed(
      (event: StreamRetryFailedEvent) => {
        store.set(chatRetryingAtom, (prev) => {
          const map = new Map(prev)
          const current = map.get(event.conversationId)
          const history = current?.history ?? []
          map.set(event.conversationId, {
            currentAttempt: event.finalAttempt.attempt,
            maxAttempts: event.finalAttempt.maxAttempts,
            delaySeconds: 0,
            reason: event.finalAttempt.reason,
            history: [...history, event.finalAttempt],
            failed: true,
          })
          return map
        })
      }
    )

    return () => {
      cleanupChunk()
      cleanupReasoning()
      cleanupComplete()
      cleanupError()
      cleanupToolActivity()
      cleanupRetrying()
      cleanupRetryAttempt()
      cleanupRetryCleared()
      cleanupRetryFailed()
    }
  }, [store]) // store 引用稳定，effect 只执行一次
}
