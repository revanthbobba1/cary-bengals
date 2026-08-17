import type { User } from '@supabase/supabase-js'

export type Role = 'admin' | 'commissioner'

export function hasRole(user: Pick<User, 'app_metadata'> | null, role: Role): boolean {
  const roles = (user?.app_metadata as { roles?: string[] } | undefined)?.roles
  return Array.isArray(roles) && roles.includes(role)
}

export function isCommissioner(user: Pick<User, 'app_metadata'> | null): boolean {
  return hasRole(user, 'commissioner')
}
