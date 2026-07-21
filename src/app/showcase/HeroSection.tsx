import type { ShowcaseProfile } from '../../domain/models'
interface Props { profile: ShowcaseProfile; error: string }
export function HeroSection({ profile, error }: Props) {
  if (error) return <section className="showcase-section"><p role="alert" className="feedback error">{error}</p></section>
  return (
    <section className="showcase-hero">
      {profile.statusPillText && <span className="showcase-pill">{profile.statusPillText}</span>}
      <h1 className="showcase-hero-title"><span>Hi, I'm</span><strong>{profile.displayName}</strong></h1>
      <p className="showcase-hero-tagline">{profile.tagline}</p>
    </section>
  )
}