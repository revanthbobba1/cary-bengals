// Real name is only available when a user logged in via Google OAuth; email/password
// accounts created via Dashboard invite have no name set. Email is always present, so
// it's the reliable fallback (local part only) before finally falling back to a fixed string.
export function getDisplayName(
  fullName: string | null | undefined,
  email: string | null | undefined,
  fallback: string
): string {
  return fullName || email?.split('@')[0] || fallback
}
