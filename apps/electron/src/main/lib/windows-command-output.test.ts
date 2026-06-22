import { expect, test } from 'bun:test'
import { encode } from 'iconv-lite'
import { decodeCommandOutput } from './windows-command-output'

test('decodeCommandOutput decodes UTF-8 output unchanged', () => {
  const output = decodeCommandOutput(Buffer.from('D:\\程序\\Git\\cmd\\git.exe\r\n', 'utf8'), 'win32')

  expect(output).toBe('D:\\程序\\Git\\cmd\\git.exe\r\n')
})

test('decodeCommandOutput falls back to GBK for Chinese Windows command output', () => {
  const gbkOutput = encode('D:\\程序\\Git\\cmd\\git.exe\r\n', 'gbk')
  const output = decodeCommandOutput(gbkOutput, 'win32')

  expect(output).toBe('D:\\程序\\Git\\cmd\\git.exe\r\n')
})
