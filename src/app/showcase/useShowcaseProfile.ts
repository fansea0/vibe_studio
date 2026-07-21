import { useEffect, useState } from 'react'
import type { ShowcaseProfile } from '../../domain/models'
import { fetchShowcaseProfile } from '../../client/api'

const emptyProfile: ShowcaseProfile = { displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }

export function useShowcaseProfile() {
  const [profile, setProfile] = useState<ShowcaseProfile>(emptyProfile)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetchShowcaseProfile(controller.signal).then(setProfile).catch(() => setError('展示页配置缺失，请稍后重试')).finally(() => undefined)
    return () => controller.abort()
  }, [])
  return { profile, error }
}