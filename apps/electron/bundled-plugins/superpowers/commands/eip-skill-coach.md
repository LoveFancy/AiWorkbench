---
description: 根据 EIP curl 和业务逻辑生成可复用的 EIP Skill
argument-hint: [业务场景描述，可粘贴一个或多个 EIP curl 和脱敏响应样例]
---

Use the `eip-skill-coach` Skill to help the user generate a reusable business Skill from their EIP curl samples and scenario.

Do not solve the actual EIP business task directly. Analyze the curl structure, clarify parameter flow and data extraction logic, and generate a business Skill that calls `workmate-eip/eip_request`.

Never ask the user for full Cookie, Authorization, CSRF token, session id, route, or BIGip values.
