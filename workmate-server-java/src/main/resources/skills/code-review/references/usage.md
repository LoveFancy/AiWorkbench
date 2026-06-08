# 使用说明

## 本地审查模式

当 SkillHub 不可用时，默认使用本地内置规则审查。

## 支持的审查规则

- `no-sql-injection` — 检测 SQL 拼接
- `no-xss` — 检测跨站脚本
- `no-hardcoded-secret` — 检测硬编码密码/Token
- `no-unused-variable` — 检测无用变量

## 自定义规则

在 `references/rules.json` 中自定义规则配置。
