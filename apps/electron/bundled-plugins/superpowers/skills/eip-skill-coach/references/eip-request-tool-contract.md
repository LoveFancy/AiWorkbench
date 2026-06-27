# EIP Request Tool Contract

Generated business Skills must use Workmate's built-in MCP tool for real EIP calls.

Tool identity:

- MCP server: `workmate-eip`
- Tool: `eip_request`

Input shape:

```json
{
  "method": "POST",
  "path": "/paas/app/api/app/listByUserNew",
  "query": {
    "appId": "{{appId}}",
    "type": "{{type}}"
  },
  "body": null,
  "headers": {
    "Accept": "*/*",
    "Origin": "http://eip.htsc.com.cn",
    "Referer": "http://eip.htsc.com.cn/paas/dashboard.html",
    "menuversion": "2",
    "ChainId": "0.0"
  },
  "resultPath": "data.items"
}
```

Rules:

- Use `query` for URL query parameters for all HTTP methods.
- Use `body` only for actual request payloads.
- Do not pass Cookie, Authorization, CSRF, session, route, or BIGip headers.
- Prefer relative `path` values starting with `/`.
- Set `resultPath` only after the response shape is known.
- If the response is non-JSON or looks like a login page, report that Workmate EIP login may be expired.
