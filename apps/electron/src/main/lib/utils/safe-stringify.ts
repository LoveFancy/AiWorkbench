/**
 * 安全 JSON 序列化：自动截断超过 maxLength 的长字符串值，
 * 防止大对象序列化时撑爆内存或网络 payload。
 */
export function safeStringify(value: unknown, maxLength = 512 * 1024): string {
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === 'string' && val.length > maxLength) {
        return val.slice(0, maxLength) + '...[truncated]'
      }
      return val
    })
  } catch {
    // 循环引用等不可序列化对象，返回错误占位
    return '{"error":"unserializable"}'
  }
}
