import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const skillDir = join(import.meta.dir, '../../../default-skills/install-python')
const skillPath = join(skillDir, 'SKILL.md')

describe('内置 Python 安装 Skill', () => {
  test('SKILL.md 声明 Windows Python 安装工作流和版本', () => {
    expect(existsSync(skillPath)).toBe(true)

    const content = readFileSync(skillPath, 'utf-8')

    expect(content).toContain('name: install-python')
    expect(content).toContain('version: "1.0.0"')
    expect(content).toContain('Windows')
    expect(content).toContain('Python')
    expect(content).toContain('pip')
    expect(content).toContain('PATH')
  })

  test('安装流程包含镜像下载、静默安装、pip 源配置和验证命令', () => {
    const content = readFileSync(skillPath, 'utf-8')

    expect(content).toContain('https://mirrors.tuna.tsinghua.edu.cn/python/{version}/python-{version}-amd64.exe')
    expect(content).toContain('/quiet')
    expect(content).toContain('InstallAllUsers=1')
    expect(content).toContain('PrependPath=1')
    expect(content).toContain('python -m pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple/')
    expect(content).toContain('python --version')
    expect(content).toContain('pip --version')
  })

  test('可选组件覆盖 Python 工具链、系统工具和常用库', () => {
    const content = readFileSync(skillPath, 'utf-8')

    expect(content).toContain('uv')
    expect(content).toContain('pipx')
    expect(content).toContain('poetry')
    expect(content).toContain('winget')
    expect(content).toContain('pandoc')
    expect(content).toContain('ffmpeg')
    expect(content).toContain('numpy pandas scipy')
    expect(content).toContain('black ruff mypy isort')
  })
})
