// A team's ESPN logo isn't always set (not every owner picks one). When it isn't, the league
// member's own photo is a better stand-in than nothing. Teams reach members through
// `teams.owner_name`, which holds the owner's first name -- the same match /league-members makes.

import { members } from '@/data/members'

export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const avatarByFirstName = new Map<string, string>()
for (const member of members) {
  if (!member.avatar) continue
  const key = normalizeName(member.name.split(' ')[0])
  if (!avatarByFirstName.has(key)) avatarByFirstName.set(key, member.avatar)
}

// A logo a manager uploads themselves lives on ESPN's image API, which answers 401 to anyone not
// signed in to ESPN (checked against the real league: both custom-uploaded logos did, while every
// built-in logo-pack image on g.espncdn.com loads for anyone). Those never render on this site, so
// treat them as "no logo" up front rather than showing a hidden broken image.
const PRIVATE_LOGO_HOST = 'mystique-api.fantasy.espn.com'

function isPubliclyLoadable(logo: string): boolean {
  try {
    return new URL(logo).hostname !== PRIVATE_LOGO_HOST
  } catch {
    return false
  }
}

export function teamLogoOrAvatar(logo: string | null, ownerName: string | null): string | null {
  if (logo && isPubliclyLoadable(logo)) return logo
  if (!ownerName) return null
  return avatarByFirstName.get(normalizeName(ownerName)) ?? null
}
