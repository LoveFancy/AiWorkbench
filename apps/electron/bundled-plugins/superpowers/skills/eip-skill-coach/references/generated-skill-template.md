# Generated Business Skill Template

Use this structure when creating the final business Skill.

~~~markdown
---
name: eip-example-business-skill
description: Use when the user needs to <specific EIP business outcome>. This Skill calls Workmate's eip_request tool and requires Workmate EIP login.
---

# EIP Example Business Skill

## Inputs

- `appId`: required, user-provided unless a fixed value is confirmed.
- `type`: optional, defaults to `log`.

## Required Tool

Use MCP tool `workmate-eip/eip_request` for all EIP API calls.

Do not use raw curl or copied Cookie. Authentication is handled by Workmate.

## Workflow

1. Validate required inputs.
2. Call the EIP API through `eip_request`.
3. Check HTTP and business success code.
4. Extract data from the confirmed response path.
5. Transform fields into the requested output format.

## API Calls

### listByUserNew

Call `workmate-eip/eip_request`:

```json
{
  "method": "POST",
  "path": "/paas/app/api/app/listByUserNew",
  "query": {
    "appId": "{{appId}}",
    "type": "{{type}}"
  },
  "headers": {
    "Accept": "*/*",
    "Origin": "http://eip.htsc.com.cn",
    "Referer": "http://eip.htsc.com.cn/paas/dashboard.html",
    "menuversion": "2",
    "ChainId": "0.0"
  },
  "resultPath": "<confirmed.path>"
}
```

## Validation

Before using real data, test extraction with a sanitized response sample. Confirm:

- success condition
- data list path
- required fields
- empty result behavior
- pagination behavior, if any
~~~
