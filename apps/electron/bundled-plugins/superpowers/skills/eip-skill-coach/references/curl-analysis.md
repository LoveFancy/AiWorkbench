# Curl Analysis

Use curl as an API structure sample, not as an authentication source.

Keep:

- HTTP method
- URL path
- query parameters
- JSON, form, or empty body shape
- `Accept` and `Content-Type` when relevant
- `Origin`, `Referer`, `menuversion`, `ChainId` only when the endpoint needs portal semantics

Drop:

- `Cookie`
- `Authorization`
- `X-CSRF-TOKEN`
- `Set-Cookie`
- `Content-Length`
- `Connection`
- browser analytics cookies
- `BIGipServer*`
- `route`
- session ids
- fixed `TraceId` values
- full `User-Agent` unless the endpoint demonstrably rejects without it

For `POST` requests with parameters in the URL, preserve the URL query semantics. Do not move query parameters into JSON body unless the user or API contract explicitly confirms that behavior.

Clarify:

- which parameters are user inputs
- which parameters are fixed constants
- which parameters come from previous API responses
- whether pagination is required
- success code and error shape
- response data path and fields to extract
