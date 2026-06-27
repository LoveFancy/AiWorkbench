import { describe, expect, test } from 'bun:test'

import { buildAgentsForSession, buildDynamicContext, buildSystemPrompt } from './agent-prompt-builder.ts'
import { BUILTIN_DEFAULT_PROMPT_STRING } from '@proma/shared'

describe('系统根提示词', () => {
  test('Agent 根提示词要求可见思考过程必须使用中文', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: false,
      claudeAvailable: true,
    })

    expect(prompt).toContain('可见思考过程、推理摘要和最终回复必须使用中文')
    expect(prompt).toContain('## 语言规则')
    expect(prompt).toContain('`thinking`、`thinking block`、`reasoning`')
    expect(prompt.indexOf('## 语言规则')).toBeLessThan(prompt.indexOf('## 工具使用指南'))
  })

  test('动态上下文每轮注入语言规则以覆盖 resume 旧会话', () => {
    const context = buildDynamicContext({
      workspaceName: '默认工作区',
      workspaceSlug: 'default',
      agentCwd: '/tmp/session',
    })

    expect(context).toContain('本轮语言规则')
    expect(context).toContain('可见思考过程、推理摘要和最终回复必须使用中文')
    expect(context).toContain('即使当前是接续旧会话')
    expect(context.indexOf('本轮语言规则')).toBeLessThan(context.indexOf('当前时间'))
  })

  test('Agent 根提示词要求缺少 Python 环境时使用内置安装 Skill', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: false,
      claudeAvailable: true,
    })

    expect(prompt).toContain('需要 Python 环境')
    expect(prompt).toContain('install-python')
    expect(prompt).toContain('不要自行拼装 Python 安装流程')
  })

  test('Agent 根提示词要求 Windows 下执行脚本避免 Bash 转义路径', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: false,
      claudeAvailable: true,
    })

    expect(prompt).toContain('Windows 路径执行规则')
    expect(prompt).toContain('优先使用相对路径')
    expect(prompt).toContain('node ./generate_chunxiao.js')
    expect(prompt).toContain('C:/Users/012950/.proma')
    expect(prompt).toContain('不要直接写未加引号的 C:\\Users\\...')
  })

  test('Agent 根提示词说明读取 MCP 工具结果文件时先解析 content blocks', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: false,
      claudeAvailable: true,
    })

    expect(prompt).toContain('## MCP 工具结果文件读取规则')
    expect(prompt).toContain('tool-results')
    expect(prompt).toContain('content block 数组')
    expect(prompt).toContain('先取 text 字段')
    expect(prompt).toContain('再对 text 做 JSON.parse')
  })

  test('Agent 根提示词要求需要外部实时信息时主动使用 WorkMate 联网检索能力', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: false,
      claudeAvailable: true,
    })

    expect(prompt).toContain('## 联网检索策略')
    expect(prompt).toContain('当前、近期、外部公开信息')
    expect(prompt).toContain('mcp__workmate-web-search__web_search')
    expect(prompt).toContain('不要调用 SDK 原生 WebSearch')
    expect(prompt).toContain('WebFetch 仅用于打开已知 URL')
    expect(prompt).toContain('直连 Compass 搜索服务')
    expect(prompt).not.toContain('web-search` Skill')
    expect(prompt).toContain('不要编造外部信息')
  })

  test('Agent 根提示词要求记忆开启时新会话先召回偏好并在语义相关时主动召回', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: true,
      claudeAvailable: true,
    })

    expect(prompt).toContain('新会话开始后的首次回复前')
    expect(prompt).toContain('先调用 mcp__mem__recall_memory')
    expect(prompt).toContain('称呼偏好、沟通风格、技术偏好、项目习惯')
    expect(prompt).toContain('不是死板关键词匹配')
    expect(prompt).toContain('称呼、身份、偏好、习惯、历史要求')
    expect(prompt).toContain('当前任务可能受历史选择、项目背景、个人偏好影响')
    expect(prompt).toContain('低打扰原则')
    expect(prompt).toContain('不要每轮都查')
  })

  test('Agent 根提示词限制非多模态模型读取图片并要求文档通过 Skill 读取', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: false,
      claudeAvailable: true,
    })

    expect(prompt).toContain('## 多模态与文档读取规则')
    expect(prompt).toContain('如果当前模型不支持多模态图片理解，不要尝试读取、解析或描述图片内容')
    expect(prompt).toContain('请用户切换到支持多模态图片理解的模型')
    expect(prompt).not.toContain('saas-glm-51')
    expect(prompt).toContain('docx、pdf、pptx、xlsx')
    expect(prompt).toContain('必须优先通过对应 Skill 读取或转换')
  })

  test('Chat 内置提示词要求可见思考过程必须使用中文', () => {
    expect(BUILTIN_DEFAULT_PROMPT_STRING).toContain('可见思考过程、推理摘要和最终回复必须使用中文')
    expect(BUILTIN_DEFAULT_PROMPT_STRING).toContain('`thinking`、`thinking block`、`reasoning`')
  })

  test('专家团模式注入主角色与可调度资源摘要', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: false,
      claudeAvailable: true,
      expertRuntime: {
        group: {
          id: 'product-team',
          name: '产品专家团',
          mainRole: {
            name: '产品负责人',
            prompt: '你是产品专家团的主角色。',
          },
          subagents: ['requirement-analyst'],
          subagentLabels: {
            'requirement-analyst': '需求分析专家',
          },
          builtinTools: ['web-search'],
          skills: ['prd-writer'],
          mcpServers: ['dpmp'],
          sourcePluginId: 'builtin:architecture-decision-team',
          sourceLabel: '产品专家团',
          sourcePluginVersion: '1.0.0',
          sourcePluginKind: 'builtin',
          sourcePluginPath: '/tmp/architecture-decision-team',
          filePath: '/tmp/architecture-decision-team/expert-groups/product-team.json',
          enabled: true,
          status: 'available',
          issues: [],
        },
        mainPrompt: '你是产品专家团的主角色。',
        agents: {
          'requirement-analyst': {
            description: '需求分析专家',
            prompt: '你负责需求分析。',
            tools: ['Read'],
          },
        },
        pluginPaths: [{ type: 'local', path: '/tmp/architecture-decision-team' }],
        mcpServers: {
          dpmp: { type: 'stdio', command: 'dpmp', enabled: true },
        },
        promptHints: ['当任务需要 PRD 时，优先考虑使用产品专家团。'],
      },
    })

    expect(prompt).toContain('你是产品专家团的主角色。')
    expect(prompt).toContain('## 专家团模式')
    expect(prompt).toContain('当前专家团: 产品专家团')
    expect(prompt).toContain('需求分析专家 (requirement-analyst): 需求分析专家')
    expect(prompt).toContain('mcp__workmate-web-search__web_search')
    expect(prompt).toContain('prd-writer')
    expect(prompt).toContain('dpmp')
    expect(prompt).toContain('可见思考过程、推理摘要和最终回复必须使用中文')
  })

  test('专家团 SubAgent 覆盖同名内置 SubAgent', () => {
    const agents = buildAgentsForSession({
      claudeAvailable: true,
      expertRuntime: {
        group: {
          id: 'product-team',
          name: '产品专家团',
          mainRole: { name: '产品负责人', prompt: '主角色' },
          sourcePluginId: 'builtin:architecture-decision-team',
          sourceLabel: '产品专家团',
          sourcePluginVersion: '1.0.0',
          sourcePluginKind: 'builtin',
          sourcePluginPath: '/tmp/architecture-decision-team',
          filePath: '/tmp/architecture-decision-team/expert-groups/product-team.json',
          enabled: true,
          status: 'available',
          issues: [],
        },
        mainPrompt: '主角色',
        agents: {
          researcher: {
            description: '产品调研专家',
            prompt: '只做产品调研。',
            tools: ['Read'],
          },
        },
        pluginPaths: [],
        mcpServers: {},
        promptHints: [],
      },
    })

    expect(agents.researcher?.description).toBe('产品调研专家')
    expect(agents.explorer).toBeDefined()
  })
})
