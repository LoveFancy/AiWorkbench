import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const bundledPluginsDir = join(import.meta.dir, 'bundled-plugins')

function readJson(pluginName: string, path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(bundledPluginsDir, pluginName, path), 'utf-8')) as Record<string, unknown>
}

function readText(pluginName: string, path: string): string {
  return readFileSync(join(bundledPluginsDir, pluginName, path), 'utf-8')
}

describe('内置 PO/DPMP 插件', () => {
  test('po-assist 插件同步到插件市场最新版本', () => {
    const claudeManifest = readJson('po-assist', '.claude-plugin/plugin.json')
    const codexManifest = readJson('po-assist', '.codex-plugin/plugin.json')
    const skill = readText('po-assist', 'skills/po-skills/SKILL.md')

    expect(claudeManifest.version).toBe('7.0.147')
    expect(codexManifest.version).toBe('7.0.147')
    expect(skill).toContain('version: 7.0.147')
  })

  test('dpmp-assist 插件同步到插件市场最新版本', () => {
    const claudeManifest = readJson('dpmp-assist', '.claude-plugin/plugin.json')
    const skill = readText('dpmp-assist', 'skills/dpmp-skills/SKILL.md')

    expect(claudeManifest.version).toBe('0.1.5')
    expect(skill).toContain('version: 0.1.5')
    expect(skill).toContain('DPMP项目管理平台REQ与Story')
  })
})
