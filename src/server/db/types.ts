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

export interface DB {
  users: UsersTable
  workspaces: WorkspacesTable
}
