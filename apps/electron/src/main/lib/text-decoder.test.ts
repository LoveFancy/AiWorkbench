import { describe, expect, test } from 'bun:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { decodeTextBuffer } from './text-decoder'
import { extractTextFromFile } from './document-parser'
import { resolveAndReadFile } from './file-preview-service'

const gbkChinese = Buffer.from([0xD6, 0xD0, 0xCE, 0xC4, 0xD7, 0xA2, 0xCA, 0xCD])

describe('文本解码', () => {
  test('GBK/GB18030 文本不会被 UTF-8 误解码成替换字符', () => {
    expect(decodeTextBuffer(gbkChinese)).toBe('中文注释')
  })

  test('文档解析读取纯文本时支持 GBK 编码', async () => {
    const filePath = join(tmpdir(), `proma-gbk-${Date.now()}.txt`)
    writeFileSync(filePath, gbkChinese)

    await expect(extractTextFromFile(filePath)).resolves.toBe('中文注释')
  })

  test('内联文件预览读取纯文本时支持 GBK 编码', () => {
    const filePath = join(tmpdir(), `proma-preview-gbk-${Date.now()}.txt`)
    writeFileSync(filePath, gbkChinese)

    expect(resolveAndReadFile(filePath)?.content).toBe('中文注释')
  })
})
