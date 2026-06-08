---
name: 代码审查助手
description: 自动审查代码质量，提供最佳实践建议和安全扫描
version: 1.3.0
tools:
  - name: code_review
    description: 对给定的代码进行审查，检查隐患
    parameters:
      - name: code
        type: string
        description: 待审查的代码片段
        required: true
      - name: language
        type: string
        description: 编程语言
        required: false
---

# 代码审查助手

自动对代码变更进行审查，检查代码规范、潜在 bug 和安全问题。

## 功能

- 代码风格检查 — 基于 ESLint / RuboCop 规则
- 潜在 bug 检测 — 空指针、资源泄漏、竞态条件
- 安全漏洞扫描 — SQL 注入、XSS、敏感信息泄露
- 最佳实践建议 — SOLID 原则、设计模式推荐

## 使用方式

在 Agent 对话中：
```
请帮我审查这段 TypeScript 代码
```
或直接粘贴代码，我会自动分析并给出报告。

## 示例

```typescript
function getUser(id: string) {
  const sql = "SELECT * FROM users WHERE id = '" + id + "'";
  return db.query(sql);
}
```

审查结果：
- ⚠️ SQL 注入风险：id 参数直接拼接，应使用参数化查询
- 📝 建议：使用 `db.query("SELECT * FROM users WHERE id = ?", [id])`

## 配置

可在 SKILL.md frontmatter 中配置审查规则级别。
