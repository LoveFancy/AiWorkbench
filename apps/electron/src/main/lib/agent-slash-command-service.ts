import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import type { AgentSlashCommand, AgentSlashCommandSource } from '@proma/shared'
import { getAgentWorkspacePath } from './config-paths'
import { listInstalledPlugins } from './plugin-registry-service'

interface ScanSlashCommandOptions {
  source: AgentSlashCommandSource
  sourceLabel: string
}

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])

function isMarkdownFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return [...MARKDOWN_EXTENSIONS].some((ext) => lower.endsWith(ext))
}

function stripMarkdownExtension(filename: string): string {
  return filename.replace(/\.(md|markdown)$/i, '')
}

function parseSimpleFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match?.[1]) return {}

  const result: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const index = line.indexOf(':')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    const rawValue = line.slice(index + 1).trim()
    result[key] = rawValue.replace(/^['"]|['"]$/g, '')
  }
  return result
}

function firstContentLine(content: string): string | undefined {
  const withoutFrontmatter = content.replace(/^---\s*\n[\s\S]*?\n---\s*/, '')
  const line = withoutFrontmatter
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.length > 0)
  return line
}

function commandNameFromPath(commandsDir: string, filePath: string): string {
  return stripMarkdownExtension(basename(filePath))
}

function sourceLabelFromPath(commandsDir: string, filePath: string, sourceLabel: string): string {
  const relativeDir = dirname(relative(commandsDir, filePath))
  if (!relativeDir || relativeDir === '.') return sourceLabel
  return `${sourceLabel}:${relativeDir.split(sep).join('/')}`
}

function collectMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return []

  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath))
    } else if (entry.isFile() && isMarkdownFile(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

export function scanSlashCommandsInDir(
  commandsDir: string,
  options: ScanSlashCommandOptions,
): AgentSlashCommand[] {
  return collectMarkdownFiles(commandsDir)
    .map((filePath): AgentSlashCommand | null => {
      const name = commandNameFromPath(commandsDir, filePath)
      if (!name) return null

      const content = readFileSync(filePath, 'utf-8')
      const frontmatter = parseSimpleFrontmatter(content)
      const description = frontmatter.description || firstContentLine(content)
      const argumentHint = frontmatter['argument-hint'] || frontmatter.argumentHint

      return {
        name,
        command: `/${name}`,
        ...(description && { description }),
        ...(argumentHint && { argumentHint }),
        source: options.source,
        sourceLabel: sourceLabelFromPath(commandsDir, filePath, options.sourceLabel),
        filePath,
      }
    })
    .filter((command): command is AgentSlashCommand => command !== null)
    .sort((a, b) => a.command.localeCompare(b.command))
}

interface PluginCommandPath {
  id: string
  name: string
  path: string
}

interface ListSlashCommandsFromPathsInput {
  workspaceSlug: string
  workspacePath: string
  builtinPluginPaths: PluginCommandPath[]
  userPluginPaths: PluginCommandPath[]
}

export function listAgentSlashCommandsFromPaths(input: ListSlashCommandsFromPathsInput): AgentSlashCommand[] {
  const commands = scanSlashCommandsInDir(join(input.workspacePath, 'commands'), {
    source: 'workspace',
    sourceLabel: input.workspaceSlug,
  })

  for (const plugin of input.builtinPluginPaths) {
    commands.push(...scanSlashCommandsInDir(join(plugin.path, 'commands'), {
      source: 'builtin',
      sourceLabel: plugin.name,
    }))
  }

  for (const plugin of input.userPluginPaths) {
    commands.push(...scanSlashCommandsInDir(join(plugin.path, 'commands'), {
      source: 'user',
      sourceLabel: plugin.name,
    }))
  }

  return commands.sort((a, b) => a.command.localeCompare(b.command))
}

export function listAgentSlashCommands(workspaceSlug: string): AgentSlashCommand[] {
  const plugins = listInstalledPlugins()
    .filter((plugin) => plugin.enabled && plugin.issues.every((issue) => issue.level !== 'error'))

  return listAgentSlashCommandsFromPaths({
    workspaceSlug,
    workspacePath: getAgentWorkspacePath(workspaceSlug),
    builtinPluginPaths: plugins
      .filter((plugin) => plugin.kind === 'builtin')
      .map((plugin) => ({ id: plugin.id, name: plugin.name, path: plugin.path })),
    userPluginPaths: plugins
      .filter((plugin) => plugin.kind === 'user')
      .map((plugin) => ({ id: plugin.id, name: plugin.name, path: plugin.path })),
  })
}
