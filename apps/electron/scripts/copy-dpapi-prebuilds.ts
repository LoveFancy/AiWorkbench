#!/usr/bin/env bun

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const targetDir = join(import.meta.dir, '..', 'resources', 'dpapi-prebuilds')

function resolveDpapiPrebuildsDir(): string {
  const packageJsonPath = require.resolve('@primno/dpapi/package.json')
  const prebuildsDir = join(dirname(packageJsonPath), 'prebuilds')

  if (!existsSync(prebuildsDir)) {
    throw new Error(`未找到 @primno/dpapi prebuilds 目录: ${prebuildsDir}`)
  }

  return prebuildsDir
}

const sourceDir = resolveDpapiPrebuildsDir()
rmSync(targetDir, { recursive: true, force: true })
mkdirSync(targetDir, { recursive: true })
cpSync(sourceDir, targetDir, { recursive: true })
console.log(`[DPAPI] 已复制 native prebuilds: ${sourceDir} -> ${targetDir}`)
