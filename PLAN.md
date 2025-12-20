## Broad-stroke implementation plan (with dependency-aware sequencing)

There are strong dependencies, mainly around **identity/auth** and **workspace-scoped authorization**, because everything else (API keys, workplans, UI, MCP proxy) sits on top of that.

### Phase 0 — Product/MVP decisions (unblocks everything)
- **[Define MVP scope]**
  - **Must-have**: remote server, SQLite, workspaces with multiple workplans, UI login, MCP proxy with API key, import/export.
  - **Defer**: org/team hierarchy *or* keep it minimal initially (see Phase 3).
- **[Pick auth strategy for MVP]**
  - **OIDC-only** vs **OIDC + local password fallback** (self-hosters often want fallback).
- **[Define workspace selection UX for MCP]**
  - e.g. MCP clients set a `DEFAULT_WORKSPACE_ID` env var, or pass `workspaceId` per tool call (recommended long-term).

**Dependency note:** without these decisions, your DB schema and API surface will churn.

---

## Phase 1 — Core server foundation (no business logic yet)
- **[Server skeleton]**
  - HTTP framework, routing, config, structured logging, error handling.
- **[SQLite layer + migrations]**
  - migration system, schema versioning, WAL mode, connection lifecycle.
- **[Operational endpoints]**
  - `GET /healthz`, `GET /readyz`, basic metrics/logging hooks.

**Dependency note:** everything later assumes stable migration + DB access patterns.

---

## Phase 2 — Identity + sessions (UI auth foundation)
- **[User model]**: user table, profile fields, created timestamps.
- **[Auth for UI]**
  - OIDC login flow, session cookie, logout, CSRF strategy.
- **[Bootstrap]**
  - On first login: create user + create their default private workspace.

**Dependency note:** you need user identity before you can define “who owns a workspace” and before you can mint user-specific API keys.

---

## Phase 3 — Authorization model (workspaces, invites, org/team hierarchy)
Implement in layers to avoid blocking progress:

- **[3A: Workspace membership + roles (MVP)]**
  - Workspace memberships with roles (owner/admin/editor/viewer).
  - Invite flow (email-based) + accept invite.
  - Permission evaluation helper (workspace-scoped).
- **[3B: Orgs/teams (incremental)]**
  - Orgs with RBAC, teams under org, workspaces owned by org or team.
  - “Effective permissions” resolution (user may gain access via org role + team membership + direct workspace invite).

**Dependency note:** API keys and workplans must attach to a workspace permission check. Don’t build workplan write endpoints before permission evaluation is solid.

---

## Phase 4 — Credentials: user PATs + org/team service accounts
- **[User PATs]**
  - Create/revoke/list keys, show last-used, optional workspace allowlist + scopes.
- **[Service accounts]**
  - Team/org-managed principals, keys, rotation, restricted workspace access.
- **[Auth middleware for APIs]**
  - Validate key → resolve principal → resolve workspace access → authorize action.
- **[Audit log]**
  - Record actor (user/service-account), key id, action, workspaceId/workplanId, timestamps.

**Dependency note:** MCP proxy and any “headless” client needs stable API-key auth.

---

## Phase 5 — Workplan domain API (core value)
- **[Workplan resources]**
  - CRUD workplans within a workspace.
- **[Tool-equivalent endpoints]**
  - `/plan`, `/track`, `/updateStatus`, `/insertCommit` implemented as server-side business logic.
- **[Invariants enforced in DB transactions]**
  - “Only one `in_progress` commit” per workplan
  - PR status derived from commit statuses
- **[Import/Export]**
  - Versioned JSON format, import-as-new vs import-merge policy, export for backup/portability.

**Dependency note:** once this is in place, you can switch MCP tools to proxy mode with minimal behavior change.

---

## Phase 6 — MCP proxy mode (keep “enable it the same way”)
- **[Proxy tool handlers]**
  - `plan/track/update/insertCommit` handlers call remote API via `fetch`.
- **[Configuration]**
  - `SERVER_URL`, `API_KEY`, optional `DEFAULT_WORKSPACE_ID`.
- **[Error mapping]**
  - Network/auth errors translated into MCP-friendly error responses with actionable text.
- **[Compatibility]**
  - Optionally keep legacy file-mode behind a flag during migration.

**Dependency note:** depends on API key auth + workplan endpoints.

---

## Phase 7 — Serve visualization from the server (auth-gated UI)
- **[Serve UI under `/ui` and API under `/api`]**
- **[UI auth integration]**
  - session cookie flow, redirect to login when unauthenticated.
- **[Data loading]**
  - Update UI to use server APIs (or keep the same shape but backed by API responses).
- **[Optional realtime]**
  - Websocket/SSE for updates (can be deferred; polling is fine initially).

**Dependency note:** UI auth depends on Phase 2, and UI data depends on Phase 5.

---

## Phase 8 — Hardening + self-host release
- **[Security review]**
  - TLS assumptions, CORS/CSRF, key leakage prevention, rate limiting.
- **[Testing]**
  - unit tests for invariants, integration tests for auth + permissions, migration tests.
- **[Packaging]**
  - Docker image + compose, systemd unit example, env var docs.
- **[Migration tooling]**
  - Import from current JSON files into SQLite, export back out.

---

# Interconnected dependencies (the main ones)
- **Identity/auth (UI)** → required before you can manage invites, org/team membership, and show UI.
- **Authorization** → required before any workplan write endpoints are safe.
- **API keys** → required before MCP proxy mode is viable.
- **Workplan APIs** → required before the UI can move off local files and before MCP proxy can replace file IO.
- **Import/export** → touches both schema design and workplan representation.

---

## Suggested MVP cut (to avoid getting stuck)
If you want fastest end-to-end value:

1) Server foundation + SQLite  
2) OIDC login + sessions  
3) Workspace membership (no org/team yet)  
4) User PATs (workspace-scoped)  
5) Workplan APIs + import/export  
6) MCP proxy  
7) Serve UI + login-gated access  
Then add org/team hierarchy and service accounts.
