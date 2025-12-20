import type { ColumnType } from 'kysely'

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>

export type Timestamp = ColumnType<string, string, string>

export interface UsersTable {
  id: string
  email: string
  created_at: Generated<Timestamp>
  updated_at: Timestamp
}

export interface WorkspacesTable {
  id: string
  owner_user_id: string
  name: string
  created_at: Generated<Timestamp>
  updated_at: Timestamp
}

export interface WorkspaceMembersTable {
  workspace_id: string
  user_id: string
  role: string
  created_at: Generated<Timestamp>
  updated_at: Timestamp
}

export interface WorkspaceInvitesTable {
  id: string
  workspace_id: string
  created_by_user_id: string
  role: string
  token_hash: string
  expires_at: Timestamp
  used_at: Timestamp | null
  created_at: Timestamp
}

export interface UserPatsTable {
  id: string
  user_id: string
  workspace_id: string | null
  name: string
  secret_hash: string
  created_at: Timestamp
  last_used_at: Timestamp | null
  revoked_at: Timestamp | null
}

export interface DB {
  users: UsersTable
  workspaces: WorkspacesTable
  workspace_members: WorkspaceMembersTable
  workspace_invites: WorkspaceInvitesTable
  user_pats: UserPatsTable
}
