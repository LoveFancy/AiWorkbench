import { z } from 'zod'

export const upgradeCheckSchema = z.object({
  currentVersion: z.string().min(1).max(32),
  platform: z.enum(['win32', 'darwin', 'linux']),
})

export const observabilityEventSchema = z.object({
  eventId: z.string().uuid().optional(),
  type: z.enum([
    'user_login',
    'user_logout',
    'chat_question',
    'agent_question',
    'error',
    'upgrade_check',
  ]),
  userId: z.string().optional(),
  userName: z.string().optional(),
  timestamp: z.number().int().positive(),
  question: z.string().optional(),
  questionLength: z.number().int().nonnegative().optional(),
  modelId: z.string().optional(),
  channelId: z.string().optional(),
  sessionId: z.string().optional(),
  workspaceId: z.string().optional(),
  result: z.enum(['success', 'failure', 'pending']).optional(),
  responseDurationMs: z.number().int().nonnegative().optional(),
  error: z
    .object({
      type: z.string(),
      message: z.string(),
      stack: z.string().optional(),
      statusCode: z.number().int().optional(),
      fingerprint: z.string().optional(),
    })
    .optional(),
  breadcrumbs: z
    .array(
      z.object({
        type: z.string(),
        category: z.string(),
        message: z.string(),
        timestamp: z.number(),
        data: z.record(z.unknown()).optional(),
      })
    )
    .optional(),
  tags: z.record(z.string()).optional(),
  client: z.object({
    appVersion: z.string().min(1).max(32),
    platform: z.string().min(1).max(32),
    osVersion: z.string().optional(),
  }),
})

export const strategyCreateSchema = z.object({
  name: z.string().min(1).max(128),
  targetVersion: z.string().min(1).max(32),
  downloadUrl: z.string().min(1).max(512),
  releaseNotes: z.string().optional(),
  platform: z.enum(['win32', 'darwin', 'linux']),
  minVersion: z.string().optional(),
  totalStages: z.number().int().min(1),
  soakTimeMinutes: z.number().int().min(0).optional(),
  autoPauseErrorRate: z.number().min(0).max(1).optional(),
  autoPauseEnabled: z.boolean().optional(),
  stages: z
    .array(
      z.object({
        name: z.string().min(1).max(64),
        releaseNotes: z.string().optional(),
        rules: z.array(
          z.object({
            ruleType: z.enum(['list', 'range', 'prefix', 'suffix']),
            ruleValue: z.string().min(1).max(256),
          })
        ),
      })
    )
    .min(1),
})

export const whitelistRuleSchema = z.object({
  ruleType: z.enum(['list', 'range', 'prefix', 'suffix']),
  ruleValue: z.string().min(1).max(256),
  targetVersion: z.string().optional(),
  platform: z.enum(['win32', 'darwin', 'linux']).optional(),
})

export const adminWhitelistRuleSchema = z.object({
  ruleType: z.enum(['list', 'range', 'prefix', 'suffix']),
  ruleValue: z.string().min(1).max(256),
  remark: z.string().optional(),
})

export const upgradeReleaseSchema = z.object({
  version: z.string().min(1).max(32),
  releaseType: z.enum(['UPGRADE', 'ROLLBACK']),
  releaseNotes: z.string().min(1),
  downloadUrl: z.string().min(1).max(512),
  platform: z.enum(['win32', 'darwin', 'linux']),
  minVersion: z.string().optional(),
})

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})