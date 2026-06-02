import rateLimit from 'express-rate-limit'

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 429,
    message: '请求过于频繁，请稍后再试',
    timestamp: Date.now(),
  },
})

export const observabilityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 429,
    message: '上报请求过于频繁，请稍后再试',
    timestamp: Date.now(),
  },
})

export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 429,
    message: '管理台请求过于频繁，请稍后再试',
    timestamp: Date.now(),
  },
})