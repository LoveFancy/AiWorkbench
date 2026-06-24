/**
 * Agent 工具 document 块剥离守卫
 *
 * 在 PostToolUse 钩子中扫描 tool_response，剥离所有 `type:'document'` 块，
 * 并用引导文本替换，告知模型改用内容提取方式。
 *
 * 核心原则：块类型驱动，只剥离 `type:'document'`，保留 text/image/tool_result 等正常块。
 * 对未知结构安全保守，无法识别就原样返回。
 */

const GUIDE_TEXT = `文件内容读取失败：当前环境不支持 \`document\` 类型的内容块，文件内容已被剥离。请改用以下方式获取文件内容：
- 文本类文档：使用文档解析 Skill 抽取纯文本；
- PDF：使用 bash 命令（如 \`pdftotext\`）提取文本，或按页转换为图片（\`image\` 块）后再理解；
- 图片：以 \`image\` 块（base64）提供，\`type\` 必须为 \`image\`，不可为 \`document\`。`

export interface ScrubResult {
  /** 是否剥离了至少一个 document 块 */
  hit: boolean
  /** 替换后的输出 */
  output: unknown
}

export interface PostToolUseDocumentScrubOutput {
  continue: boolean
  hookSpecificOutput: {
    hookEventName: 'PostToolUse'
    updatedToolOutput: unknown
  }
}

function isDocumentBlock(item: unknown): boolean {
  if (item === null || item === undefined || typeof item !== 'object') return false
  if (Array.isArray(item)) return false
  return (item as Record<string, unknown>).type === 'document'
}

/**
 * 递归扫描 toolResponse，剥离所有 `type:'document'` 块。
 *
 * 处理以下结构：
 * - 基本类型（string/number/null/undefined）：原样返回
 * - 数组：递归处理每个元素，过滤 document 块
 * - 对象：
 *   - 如果 `type === 'document'`：标记为命中，跳过
 *   - 如果有 `content` 字段且为数组：递归处理 content
 *   - 其他：递归处理所有值
 *
 * 对未知结构安全保守，绝不在无法识别时破坏数据。
 */
export function scrubDocumentBlocks(toolResponse: unknown): ScrubResult {
  let hit = false

  function walk(value: unknown): unknown {
    if (value === null || value === undefined) return value
    if (typeof value !== 'object') return value

    if (Array.isArray(value)) {
      const filtered: unknown[] = []
      for (const item of value) {
        // 检查是否为 document 块
        if (isDocumentBlock(item)) {
          hit = true
          continue
        }
        filtered.push(walk(item))
      }
      return filtered
    }

    const obj = value as Record<string, unknown>

    // 顶层 document 块
    if (obj.type === 'document') {
      hit = true
      return undefined // 将在父级被过滤
    }

    const result: Record<string, unknown> = {}

    for (const key of Object.keys(obj)) {
      const val = obj[key]

      // 特殊处理 content 字段：如果是数组，递归处理每个元素并过滤 document 块
      if (key === 'content' && Array.isArray(val)) {
        const filtered: unknown[] = []
        for (const item of val) {
          if (isDocumentBlock(item)) {
            hit = true
            continue
          }
          filtered.push(walk(item))
        }
        result[key] = filtered
      } else {
        // 非 content 字段：document 块作为属性值时同样剥离，
        // 直接跳过该键，避免残留 `key: undefined`
        if (isDocumentBlock(val)) {
          hit = true
          continue
        }
        result[key] = walk(val)
      }
    }

    return result
  }

  const output = walk(toolResponse)
  return { hit, output }
}

/**
 * 构建 PostToolUse 钩子的返回值。
 *
 * 未命中时返回 null（钩子返回 { continue: true } 即可）。
 * 命中时返回 { continue: true, hookSpecificOutput: { hookEventName:'PostToolUse', updatedToolOutput } }，
 * 其中 updatedToolOutput 是 scrub 后的结果加上引导文本块。
 */
export function buildPostToolUseDocumentScrubOutput(
  scrubResult: ScrubResult,
): PostToolUseDocumentScrubOutput | null {
  if (!scrubResult.hit) return null

  // 在 scrub 后的结果末尾追加引导文本块
  let output = scrubResult.output
  if (Array.isArray(output)) {
    output = [...output, { type: 'text', text: GUIDE_TEXT }]
  } else {
    // 非数组结构（如 { content: [...] }），在 content 数组末尾追加
    const obj = output as Record<string, unknown>
    if (obj && typeof obj === 'object' && Array.isArray(obj.content)) {
      output = {
        ...obj,
        content: [...obj.content, { type: 'text', text: GUIDE_TEXT }],
      }
    } else {
      // 兜底：包装为数组
      output = [{ type: 'text', text: GUIDE_TEXT }]
    }
  }

  return {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      updatedToolOutput: output,
    },
  }
}