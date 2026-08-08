---
name: Vite middleware compatibility
description: Compatibility rule for custom middleware inserted into Vite's Connect middleware stack.
---

Custom middleware inserted directly into Vite's Connect stack must use the
`handle` property on the stack entry. A `handler` property can allow the dev
server to start but causes a request-time crash in current Vite versions.

**Why:** The imported project used the older-looking `handler` field, which
made the server terminate as soon as the first preview request arrived.

**How to apply:** When maintaining the custom React-refresh stripping plugin,
keep the stack entry shape compatible with Connect/Vite and verify with an
actual HTTP preview request, not only a successful server bind.