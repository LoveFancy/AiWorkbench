#!/usr/bin/env bun

import { cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const appRoot = join(import.meta.dir, '..')
const sourceDir = join(appRoot, 'resources')
const targetDir = join(appRoot, 'dist', 'resources')

mkdirSync(join(appRoot, 'dist'), { recursive: true })
cpSync(sourceDir, targetDir, { recursive: true })
console.log(`[资源] 已复制应用资源: ${sourceDir} -> ${targetDir}`)
