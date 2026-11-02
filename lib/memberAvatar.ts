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

export function teamLogoOrAvatar(logo: string | null, ownerName: string | null): string | null {
  if (logo) return logo
  if (!ownerName) return null
  return avatarByFirstName.get(normalizeName(ownerName)) ?? null
}
