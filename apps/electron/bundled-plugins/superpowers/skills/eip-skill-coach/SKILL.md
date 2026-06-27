---
name: eip-skill-coach
description: 当用户希望基于 EIP curl 请求、脱敏响应样例和业务逻辑创建可复用 Skill 时使用。需要澄清参数流、数据提取和接口编排，并生成调用 Workmate eip_request 工具而不是原始 curl 的业务 Skill。
---

# EIP Skill Coach

## Purpose

Turn a user's EIP curl samples and business scenario into a reusable business Skill. Do not solve the business task directly. Generate or update a Skill that can solve that class of task later.

## Required Runtime Tool

Generated business Skills must call Workmate's built-in MCP tool:

- MCP server: `workmate-eip`
- Tool: `eip_request`
- HTTP client: Workmate `hteip-client.ts`
- Auth: Workmate EIP login state, injected automatically

Generated Skills must not use raw curl, copied Cookie, Authorization, CSRF token, session id, route, or BIGip values.

## Workflow

1. Parse the user's business goal.
2. Parse each curl:
   - method
   - path
   - query parameters
   - request body shape
   - behavior-relevant non-secret headers
3. Remove secrets and transient browser headers.
4. Identify parameter sources:
   - user input
   - fixed constants
   - defaults
   - values derived from previous API responses
5. Ask only for missing decisions that affect correctness:
   - which parameters should be exposed to the final Skill
   - response success condition
   - data path to extract
   - output format
   - pagination, filtering, sorting, joining, and failure behavior
6. Generate the business Skill with:
   - trigger description
   - required inputs
   - API calls through `workmate-eip/eip_request`
   - data mapping and extraction logic
   - validation with mock or sanitized response samples

## Reference Files

- Read `references/curl-analysis.md` when turning curl into an API contract.
- Read `references/eip-request-tool-contract.md` when writing the generated Skill's execution section.
- Read `references/generated-skill-template.md` when creating the final business Skill.

## Clarification Style

State what was inferred from curl, then ask concise questions for unresolved business logic. Never ask the user to provide a full Cookie or token.

Example:

```text
我从 curl 中识别到：
- POST /paas/app/api/app/listByUserNew
- query 参数：appId, type
- body 为空
- 认证应通过 Workmate 登录态注入

生成 Skill 前需要确认：
1. appId 是每次由用户输入，还是固定值？
2. type 是否固定为 log，还是需要支持其他枚举？
3. 响应里最终要提取哪些字段？请提供脱敏 JSON 样例，或说明数据路径。
```
