import { Request, Response, NextFunction } from 'express'
import { createDecipheriv } from 'node:crypto'
import { config } from '../config'
import { logger } from '../utils/logger'

declare global {
  namespace Express {
    interface Request {
      jobId?: string
    }
  }
}

let KEY: Buffer | null = null

function getKey(): Buffer {
  if (!KEY) {
    KEY = Buffer.from(config.userIdEncryptionKey, 'hex')
    if (KEY.length !== 16) {
      throw new Error(
        `USER_ID_ENCRYPTION_KEY must be 16 bytes hex string, got ${KEY.length} bytes`
      )
    }
  }
  return KEY
}

function decryptJobId(encryptedBase64: string): string {
  const key = getKey()
  const combined = Buffer.from(encryptedBase64, 'base64')
  const iv = combined.subarray(0, 12)
  const authTag = combined.subarray(combined.length - 16)
  const ciphertext = combined.subarray(12, combined.length - 16)

  const decipher = createDecipheriv('aes-128-gcm', key, iv, { authTagLength: 16 })
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf-8')
}

export function extractUserId(req: Request, res: Response, next: NextFunction): void {
  const encrypted = req.headers['x-eipgw-userid'] as string | undefined

  if (!encrypted) {
    if (!config.requireUserId) {
      req.jobId = config.defaultUserId
      logger.debug('用户身份校验已关闭，使用默认用户', { userId: config.defaultUserId })
      next()
      return
    }
    res.status(403).json({ code: 403, message: '缺少用户身份信息', timestamp: Date.now() })
    return
  }

  try {
    req.jobId = decryptJobId(encrypted)
    next()
  } catch (error) {
    if (!config.requireUserId) {
      req.jobId = config.defaultUserId
      logger.debug('用户身份解密失败，使用默认用户', { userId: config.defaultUserId, error })
      next()
      return
    }
    logger.error('解密用户身份失败', { error })
    res.status(403).json({ code: 403, message: '用户身份验证失败', timestamp: Date.now() })
  }
}