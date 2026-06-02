import { PrismaClient } from '@prisma/client'
import type { ObservabilityEventDTO } from '../types'
import { logger } from '../utils/logger'

const prisma = new PrismaClient()

export async function createEvent(data: ObservabilityEventDTO, reqJobId: string) {
  const userId = reqJobId || data.userId || 'unknown'

  if (data.eventId) {
    const existing = await prisma.observabilityEvent.findUnique({
      where: { eventId: data.eventId },
    })
    if (existing) {
      logger.warn('事件去重：跳过重复事件', { eventId: data.eventId })
      return existing
    }
  }

  return prisma.observabilityEvent.create({
    data: {
      eventId: data.eventId ?? null,
      userId,
      userName: data.userName ?? null,
      eventType: data.type,
      question: data.question ?? null,
      questionLength: data.questionLength ?? data.question?.length ?? null,
      modelId: data.modelId ?? null,
      channelId: data.channelId ?? null,
      sessionId: data.sessionId ?? null,
      workspaceId: data.workspaceId ?? null,
      result: data.result ?? null,
      responseDurationMs: data.responseDurationMs ?? null,
      errorType: data.error?.type ?? null,
      errorMessage: data.error?.message ?? null,
      errorStack: data.error?.stack ?? null,
      errorFingerprint: data.error?.fingerprint ?? null,
      errorStatusCode: data.error?.statusCode ?? null,
      breadcrumbs: data.breadcrumbs ? JSON.stringify(data.breadcrumbs) : null,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      clientVersion: data.client.appVersion,
      clientPlatform: data.client.platform,
      clientOsVersion: data.client.osVersion ?? null,
    },
  })
}

export async function queryEvents(params: {
  page: number
  pageSize: number
  eventType?: string
  userId?: string
  startDate?: string
  endDate?: string
  clientVersion?: string
  errorFingerprint?: string
}) {
  const where: Record<string, unknown> = {}

  if (params.eventType) where.eventType = params.eventType
  if (params.userId) where.userId = params.userId
  if (params.clientVersion) where.clientVersion = params.clientVersion
  if (params.errorFingerprint) where.errorFingerprint = params.errorFingerprint

  if (params.startDate || params.endDate) {
    const createdAt: Record<string, Date> = {}
    if (params.startDate) createdAt.gte = new Date(params.startDate)
    if (params.endDate) createdAt.lte = new Date(params.endDate)
    where.createdAt = createdAt
  }

  const [total, events] = await Promise.all([
    prisma.observabilityEvent.count({ where }),
    prisma.observabilityEvent.findMany({
      where,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return { total, events }
}

export async function getEventStats(params: { startDate?: string; endDate?: string }) {
  const where: Record<string, unknown> = {}

  if (params.startDate || params.endDate) {
    const createdAt: Record<string, Date> = {}
    if (params.startDate) createdAt.gte = new Date(params.startDate)
    if (params.endDate) createdAt.lte = new Date(params.endDate)
    where.createdAt = createdAt
  }

  const [totalEvents, errorEvents, errorFingerprintCounts] = await Promise.all([
    prisma.observabilityEvent.count({ where }),
    prisma.observabilityEvent.count({ where: { ...where, eventType: 'error' } }),
    prisma.observabilityEvent.groupBy({
      by: ['errorFingerprint'],
      where: {
        ...where,
        eventType: 'error',
        errorFingerprint: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
  ])

  return {
    totalEvents,
    errorEvents,
    errorRate: totalEvents > 0 ? errorEvents / totalEvents : 0,
    topErrors: errorFingerprintCounts.map((e) => ({
      fingerprint: e.errorFingerprint,
      count: e._count.id,
    })),
  }
}