/**
 * MentionSuggestions — Skill / MCP 的 TipTap Mention Suggestion 统一配置
 *
 * 泛型工厂 createMentionSuggestion 封装公共逻辑（渲染、定位、键盘导航），
 * 通过 MentionSuggestionConfig 注入差异部分（触发字符、数据获取、行渲染）。
 */

import type React from 'react'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionOptions } from '@tiptap/suggestion'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { MessageSquareText, Sparkles, Server, TerminalSquare } from 'lucide-react'
import { MentionList } from './MentionList'
import type { MentionListRef } from './MentionList'
import { createMentionPopup, positionPopup } from './mention-popup-utils'
import type { AgentSessionReferenceSearchResult, AgentSlashCommand } from '@proma/shared'

// ===== 泛型工厂 =====

interface MentionSuggestionConfig<T> {
  /** 触发字符 */
  char: string
  /** 空列表占位文字 */
  emptyText: string
  /** 异步获取列表项 */
  fetchItems: (slug: string, query: string) => Promise<T[]>
  /** 提取唯一 key */
  keyExtractor: (item: T) => string
  /** 提取鼠标悬停时展示的完整说明 */
  titleExtractor?: (item: T) => string | undefined
  /** 渲染列表项 */
  renderItem: (item: T) => React.ReactNode
  /** 选中后传给 TipTap Suggestion command 的参数 */
  toCommand: (item: T) => MentionCommandProps
}

interface MentionCommandProps {
  id: string
  label: string
  commandText?: string
  mentionKind?: 'command' | 'skill' | 'mcp' | 'session' | 'file'
}

function insertMentionWithCurrentSchema(char: string): NonNullable<SuggestionOptions<unknown, MentionCommandProps>['command']> {
  return ({ editor, range, props }): void => {
    const mentionType = editor.state.schema.nodes.mention
    if (!mentionType) return

    const nodeAfter = editor.view.state.selection.$to.nodeAfter
    const to = nodeAfter?.text?.startsWith(' ') ? range.to + 1 : range.to
    const mentionNode = mentionType.create({
      ...props,
      mentionSuggestionChar: char,
    })

    editor.view.focus()
    const transaction = editor.state.tr
      .replaceWith(range.from, to, mentionNode as ProseMirrorNode)
      .insertText(' ', range.from + mentionNode.nodeSize)
      .scrollIntoView()
    editor.view.dispatch(transaction)
    editor.view.dom.ownerDocument.defaultView?.getSelection?.()?.collapseToEnd?.()
  }
}

function createMentionSuggestion<T>(
  config: MentionSuggestionConfig<T>,
  workspaceSlugRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  mentionItemCountRef: React.MutableRefObject<number>,
): Omit<SuggestionOptions<T>, 'editor'> {
  return {
    char: config.char,
    allowSpaces: false,
    command: insertMentionWithCurrentSchema(config.char),
    allowedPrefixes: null,

    items: async ({ query }): Promise<T[]> => {
      const slug = workspaceSlugRef.current
      if (!slug) return []
      try {
        return await config.fetchItems(slug, (query ?? '').toLowerCase())
      } catch {
        return []
      }
    },

    render: () => {
      let renderer: ReactRenderer<MentionListRef> | null = null
      let popup: HTMLDivElement | null = null
      let blurHandler: (() => void) | null = null
      let editorDom: HTMLElement | null = null

      function cleanup() {
        if (blurHandler && editorDom) {
          editorDom.removeEventListener('blur', blurHandler, true)
          blurHandler = null
        }
        editorDom = null
        mentionActiveRef.current = false
        mentionItemCountRef.current = 0
        popup?.remove()
        popup = null
        renderer?.destroy()
        renderer = null
      }

      return {
        onStart(props) {
          if (popup || renderer) {
            cleanup()
          }

          mentionActiveRef.current = true
          mentionItemCountRef.current = props.items.length
          editorDom = props.editor.view.dom
          renderer = new ReactRenderer(MentionList, {
            props: {
              items: props.items,
              emptyText: config.emptyText,
              keyExtractor: config.keyExtractor,
              titleExtractor: config.titleExtractor,
              renderItem: config.renderItem,
              onSelect: (item: T) => {
                const cmd = config.toCommand(item)
                props.command(cmd)
              },
            },
            editor: props.editor,
          })
          popup = createMentionPopup(renderer.element)
          positionPopup(popup, props.clientRect?.())

          blurHandler = () => {
            setTimeout(() => {
              if (!props.editor.view.hasFocus() && popup) {
                cleanup()
              }
            }, 100)
          }
          editorDom.addEventListener('blur', blurHandler, true)
        },

        onUpdate(props) {
          mentionItemCountRef.current = props.items.length
          renderer?.updateProps({
            items: props.items,
            titleExtractor: config.titleExtractor,
            onSelect: (item: T) => {
              const cmd = config.toCommand(item)
              props.command(cmd)
            },
          })
          positionPopup(popup, props.clientRect?.())
        },

        onKeyDown(props) {
          return renderer?.ref?.onKeyDown({ event: props.event }) ?? false
        },

        onExit() {
          cleanup()
        },
      }
    },
  }
}

// ===== Skill 配置 =====

export interface SkillMentionItem {
  kind: 'skill'
  id: string
  name: string
  description?: string
}

export interface SlashCommandMentionItem {
  kind: 'command'
  id: string
  name: string
  command: string
  description?: string
  argumentHint?: string
  sourceLabel: string
}

export type SlashMentionItem = SkillMentionItem | SlashCommandMentionItem

interface SlashMentionItemLayoutClasses {
  content: string
  name: string
  description: string
}

export function getSlashMentionItemLayoutClasses(kind: SlashMentionItem['kind']): SlashMentionItemLayoutClasses {
  return kind === 'command'
    ? {
        content: 'grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-2 min-w-0 flex-1',
        name: 'truncate font-medium min-w-0',
        description: 'truncate text-[10px] text-muted-foreground/55 min-w-0',
      }
    : {
        content: 'grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-2 min-w-0 flex-1',
        name: 'truncate font-medium min-w-0',
        description: 'truncate text-[10px] text-muted-foreground/50 min-w-0',
      }
}

export function truncateSkillMentionName(name: string): string {
  const chars = Array.from(name)
  if (chars.length <= 20) return name
  return `${chars.slice(0, 19).join('')}…`
}

export function sortSlashMentionItems(items: SlashMentionItem[]): SlashMentionItem[] {
  return [...items].sort((a, b) => {
    if (a.kind === b.kind) return 0
    return a.kind === 'skill' ? -1 : 1
  })
}

export function formatSlashCommandDisplayLabel(item: SlashCommandMentionItem): string {
  const sourceLabel = item.sourceLabel.trim()
  const commandName = item.name || item.command.replace(/^\//, '')
  if (!sourceLabel) return item.command
  return `${sourceLabel}: ${commandName}`
}

export function buildSlashCommandSearchText(command: AgentSlashCommand): string {
  return [
    command.sourceLabel,
    command.name,
    command.command,
    command.argumentHint,
    command.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function formatSlashMentionTooltip(item: SlashMentionItem): string | undefined {
  if (item.kind === 'command') {
    return [
      `命令: ${item.command}`,
      `来源: ${item.sourceLabel}`,
      item.argumentHint ? `参数: ${item.argumentHint}` : undefined,
      item.description ? `说明: ${item.description}` : undefined,
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    `Skill: ${item.name}`,
    item.description ? `说明: ${item.description}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildSlashMentionCommandProps(item: SlashMentionItem): MentionCommandProps {
  return item.kind === 'command'
    ? { id: item.id, label: item.command, commandText: `${item.command} `, mentionKind: 'command' }
    : { id: item.id, label: item.name, mentionKind: 'skill' }
}

export function createSkillMentionSuggestion(
  workspaceSlugRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  mentionItemCountRef: React.MutableRefObject<number>,
) {
  return createMentionSuggestion<SlashMentionItem>(
    {
      char: '/',
      emptyText: '无匹配命令或 Skill',
      fetchItems: async (slug, q) => {
        const [commands, caps] = await Promise.all([
          window.electronAPI.listAgentSlashCommands(slug),
          window.electronAPI.getWorkspaceCapabilities(slug),
        ])
        const commandItems: SlashCommandMentionItem[] = commands
          .filter((command: AgentSlashCommand) => {
            const text = buildSlashCommandSearchText(command)
            return !q || text.includes(q)
          })
          .map((command: AgentSlashCommand) => ({
            kind: 'command',
            id: command.name,
            name: command.name,
            command: command.command,
            description: command.description,
            argumentHint: command.argumentHint,
            sourceLabel: command.sourceLabel,
          }))
        const skillItems: SkillMentionItem[] = caps.skills
          .filter((s) => s.enabled)
          .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.slug ?? '').toLowerCase().includes(q))
          .map((s) => ({ kind: 'skill', id: s.slug, name: s.name, description: s.description }))
        return sortSlashMentionItems([...skillItems, ...commandItems])
      },
      keyExtractor: (item) => `${item.kind}:${item.id}`,
      titleExtractor: formatSlashMentionTooltip,
      renderItem: (item) => {
        const layout = getSlashMentionItemLayoutClasses(item.kind)
        if (item.kind === 'command') {
          return (
            <>
              <TerminalSquare className="size-3.5 text-amber-500 flex-shrink-0" />
              <span className={layout.content}>
                <span className={layout.name}>{formatSlashCommandDisplayLabel(item)}</span>
                <span className={layout.description}>
                  {[item.argumentHint, item.description].filter(Boolean).join('  ')}
                </span>
              </span>
            </>
          )
        }
        return (
          <>
            <Sparkles className="size-3.5 text-violet-500 flex-shrink-0" />
            <span className={layout.content}>
              <span className={layout.name}>{truncateSkillMentionName(item.name)}</span>
              {item.description && (
                <span className={layout.description}>{item.description}</span>
              )}
            </span>
          </>
        )
      },
      toCommand: buildSlashMentionCommandProps,
    },
    workspaceSlugRef,
    mentionActiveRef,
    mentionItemCountRef,
  )
}

// ===== MCP 配置 =====

export interface McpMentionItem {
  id: string
  name: string
  type: string
}

export function createMcpMentionSuggestion(
  workspaceSlugRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  mentionItemCountRef: React.MutableRefObject<number>,
) {
  return createMentionSuggestion<McpMentionItem>(
    {
      char: '#',
      emptyText: '无匹配 MCP 服务',
      fetchItems: async (slug, q) => {
        const caps = await window.electronAPI.getWorkspaceCapabilities(slug)
        return caps.mcpServers
          .filter((s) => s.enabled)
          .filter((s) => !q || s.name.toLowerCase().includes(q))
          .map((s) => ({ id: s.name, name: s.name, type: s.type }))
      },
      keyExtractor: (item) => item.id,
      renderItem: (item) => (
        <>
          <Server className="size-3.5 text-emerald-500 flex-shrink-0" />
          <span className="truncate font-medium flex-1 min-w-0">{item.name}</span>
          <span className="truncate text-[10px] text-muted-foreground/50 max-w-[120px]">{item.type}</span>
        </>
      ),
      toCommand: (item) => ({ id: item.id, label: item.name }),
    },
    workspaceSlugRef,
    mentionActiveRef,
    mentionItemCountRef,
  )
}

// ===== Agent 会话引用配置 =====

export type SessionMentionItem = AgentSessionReferenceSearchResult

export function createSessionMentionSuggestion(
  workspaceIdRef: React.RefObject<string | null>,
  currentSessionIdRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  mentionItemCountRef: React.MutableRefObject<number>,
) {
  return createMentionSuggestion<SessionMentionItem>(
    {
      char: '&',
      emptyText: '无匹配会话',
      fetchItems: async (_slug, q) => {
        const workspaceId = workspaceIdRef.current
        if (!workspaceId) return []
        return window.electronAPI.searchAgentSessionReferences({
          workspaceId,
          excludeSessionId: currentSessionIdRef.current ?? undefined,
          query: q,
          limit: 20,
        })
      },
      keyExtractor: (item) => item.sessionId,
      renderItem: (item) => (
        <>
          <MessageSquareText className="size-3.5 text-sky-500 flex-shrink-0" />
          <span className="truncate font-medium flex-1 min-w-0">{item.title}</span>
          {item.snippet && (
            <span className="truncate text-[10px] text-muted-foreground/50 max-w-[120px]">{item.snippet}</span>
          )}
        </>
      ),
      toCommand: (item) => ({ id: item.sessionId, label: item.title }),
    },
    // 会话引用不依赖 slug，但复用通用 mention 工厂时需要一个非空 ref 才会触发 fetchItems。
    workspaceIdRef,
    mentionActiveRef,
    mentionItemCountRef,
  )
}
