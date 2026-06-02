import { Request, Response, NextFunction } from 'express'
import { createEvent, queryEvents, getEventStats } from '../services/observability.service'
import { sendSuccess, sendError } from '../utils/response'
import { observabilityEventSchema } from '../utils/validator'
import { config } from '../config'
import { logger } from '../utils/logger'

const eventCountMap = new Map<string, number>()

setInterval(() => {
  eventCountMap.clear()
}, 60_000)

export async function reportEventHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = observabilityEventSchema.parse(req.body)
    const jobId = req.jobId!

    if (Math.random() > config.observabilitySampleRate && parsed.type !== 'error') {
      sendSuccess(res, null, 'sampled')
      return
    }

    const minuteKey = `${jobId}:${Math.floor(Date.now() / 60000)}`
    const currentCount = eventCountMap.get(minuteKey) ?? 0
    if (currentCount >= config.observabilityMaxEventsPerMinute) {
      sendSuccess(res, null, 'rate_limited')
      return
    }
    eventCountMap.set(minuteKey, currentCount + 1)

    const event = await createEvent(parsed, jobId)
    sendSuccess(res, event, '上报成功')
  } catch (error) {
    next(error)
  }
}

export async function queryEventsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1
    const pageSize = parseInt(req.query.pageSize as string) || 20
    const eventType = req.query.eventType as string | undefined
    const userId = req.query.userId as string | undefined
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined
    const clientVersion = req.query.clientVersion as string | undefined
    const errorFingerprint = req.query.errorFingerprint as string | undefined

    const result = await queryEvents({
      page,
      pageSize,
      eventType,
      userId,
      startDate,
      endDate,
      clientVersion,
      errorFingerprint,
    })
    sendSuccess(res, result)
  } catch (error) {
    next(error)
  }
}

export async function getEventStatsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined
    const stats = await getEventStats({ startDate, endDate })
    sendSuccess(res, stats)
  } catch (error) {
    next(error)
  }
}