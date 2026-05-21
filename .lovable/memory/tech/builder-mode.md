---
name: Auth Allowlist
description: App access restricted to valkaa767@gmail.com only. Builder mode removed.
type: constraint
---
- Auth is fully enabled. Builder mode removed.
- ALLOWED_EMAILS in AuthContext.tsx controls who can access the app.
- ProtectedRoute checks both auth AND email allowlist.
- DB still has permissive "Builder mode" RLS policies — remove them when proper per-user RLS is needed.
