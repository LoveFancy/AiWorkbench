import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

const pluginDir = join(import.meta.dir, 'bundled-plugins/po-assist')

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(pluginDir, path), 'utf-8')) as Record<string, unknown>
}

function readText(path: string): string {
  return readFileSync(join(pluginDir, path), 'utf-8')
}

test('内置 po-assist 插件同步到插件市场最新 Skill 页版本', () => {
  const claudeManifest = readJson('.claude-plugin/plugin.json')
  const codexManifest = readJson('.codex-plugin/plugin.json')
  const skill = readText('skills/po-skills/SKILL.md')

  expect(claudeManifest.version).toBe('7.0.119')
  expect(codexManifest.version).toBe('7.0.117')
  expect(skill).toContain('version: 7.0.119')
})
