import { assetUrl } from '../api'
import type { UserPublic } from '../types'

interface AvatarProps {
  user: Pick<UserPublic, 'nickname' | 'profile_picture'> | null | undefined
  size?: 'small' | 'default' | 'large'
}

/** Consistent avatar rendering: photo when available, initial as fallback. */
export default function Avatar({ user, size = 'default' }: AvatarProps) {
  const cls = size === 'default' ? 'avatar' : `avatar ${size}`
  const src = assetUrl(user?.profile_picture)
  return (
    <div className={cls}>
      {src ? (
        <img src={src} alt={user?.nickname || ''} />
      ) : (
        <span>{(user?.nickname || '?').slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  )
}
