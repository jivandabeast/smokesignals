export interface UserPublic {
  id: number
  username: string
  nickname: string
  profile_picture?: string | null
}

export interface UserOut extends UserPublic {
  email: string
  is_admin: boolean
  is_active: boolean
  contact_platforms?: Record<string, string> | null
  location_opt_in: boolean
  created_at: string
}

export interface ActivityType {
  id: number
  slug: string
  label: string
  emoji?: string | null
  color?: string | null
  is_active: boolean
  sort_order: number
}

export interface Activity {
  id: number
  user: UserPublic
  activity_type: ActivityType
  note?: string | null
  latitude?: number | null
  longitude?: number | null
  place_label?: string | null
  created_at: string
}

export interface Circle {
  id: number
  name: string
  color?: string | null
  members: UserPublic[]
}

export interface FriendRequest {
  id: number
  requester: UserPublic
  addressee: UserPublic
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

export interface AppNotification {
  id: number
  kind: string
  title: string
  body?: string | null
  data?: Record<string, unknown> | null
  read: boolean
  created_at: string
}

export interface Stats {
  total: number
  by_type: Record<string, number>
  by_weekday: Record<string, number>
  by_hour: Record<string, number>
  streak_days: number
  last_30_days: Record<string, number>
}

export interface PublicConfig {
  cloudflare_access_enabled: boolean
  vapid_public_key: string | null
}
