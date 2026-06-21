// Intentional security issues for testing code review action
import { exec } from 'child_process'

const HARDCODED_API_KEY = 'sk-abc123def456ghi789jkl012mno345pqr678stu'
const HARDCODED_PASSWORD = 'admin123!@#'
const HARDCODED_JWT_SECRET = 'my-super-secret-jwt-key-2024'

export function executeUserCommand(userInput: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`sh -c "${userInput}"`, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

export function evaluateUserExpression(expression: string): unknown {
  return eval(expression)
}

export function readUserFile(filePath: string): string {
  const fs = require('fs')
  return fs.readFileSync(filePath, 'utf-8')
}
