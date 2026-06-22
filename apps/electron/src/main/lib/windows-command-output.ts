import { decode as decodeWithIconv } from 'iconv-lite'

/**
 * 解码外部命令输出。
 *
 * Windows 的 where/reg query 在中文系统上可能使用 ANSI code page（CP936/GBK）
 * 输出中文路径；直接按 UTF-8 解码会产生替换字符，导致 existsSync 无法命中。
 */
export function decodeCommandOutput(
  output: Buffer,
  platform: NodeJS.Platform = process.platform,
): string {
  const utf8 = output.toString('utf8')
  if (platform !== 'win32' || !utf8.includes('\uFFFD')) {
    return utf8
  }

  return decodeWithIconv(output, 'gbk')
}
