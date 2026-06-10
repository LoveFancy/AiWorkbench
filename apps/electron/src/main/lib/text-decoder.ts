import { readFileSync } from 'node:fs'
import iconv from 'iconv-lite'

const UTF8_BOM = [0xEF, 0xBB, 0xBF]
const UTF16_LE_BOM = [0xFF, 0xFE]
const UTF16_BE_BOM = [0xFE, 0xFF]

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte)
}

function looksLikeUtf16Le(buffer: Buffer): boolean {
  if (buffer.length < 4) return false
  let zeroOddBytes = 0
  const sampleLength = Math.min(buffer.length, 80)
  for (let index = 1; index < sampleLength; index += 2) {
    if (buffer[index] === 0x00) zeroOddBytes++
  }
  return zeroOddBytes >= Math.max(2, Math.floor(sampleLength / 6))
}

function decodeUtf8Strict(buffer: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return null
  }
}

function cleanupDecodedText(text: string): string {
  return text.replace(/^\uFEFF/, '')
}

/**
 * 智能解码文本 Buffer。
 *
 * 优先保留标准 UTF-8/Unicode 文件表现；遇到 Windows 常见的 GBK/GB18030
 * 文本时回退解码，避免在预览和附件解析中出现 U+FFFD 替换字符。
 */
export function decodeTextBuffer(buffer: Buffer): string {
  if (startsWithBytes(buffer, UTF8_BOM)) {
    return cleanupDecodedText(iconv.decode(buffer, 'utf-8'))
  }
  if (startsWithBytes(buffer, UTF16_LE_BOM) || looksLikeUtf16Le(buffer)) {
    return cleanupDecodedText(iconv.decode(buffer, 'utf-16le'))
  }
  if (startsWithBytes(buffer, UTF16_BE_BOM)) {
    return cleanupDecodedText(iconv.decode(buffer, 'utf-16be'))
  }

  const utf8Text = decodeUtf8Strict(buffer)
  if (utf8Text !== null) {
    return cleanupDecodedText(utf8Text)
  }

  return cleanupDecodedText(iconv.decode(buffer, 'gb18030'))
}

/** 读取文本文件并按常见编码自动解码。 */
export function readTextFile(filePath: string): string {
  return decodeTextBuffer(readFileSync(filePath))
}
