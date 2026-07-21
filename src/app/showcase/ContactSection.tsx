import type { SocialLink } from '../../domain/models'
interface Props { email: string; links: SocialLink[]; error: string }
export function ContactSection({ email, links, error }: Props) {
  if (error) return null
  return (
    <section className="showcase-section">
      <h2 className="showcase-section-title">联系我</h2>
      <p className="showcase-contact-cta">想做点有意思的？欢迎聊一聊 →</p>
      {email && <a className="showcase-contact-email" href={`mailto:${email}`}>{email}</a>}
      {links.length > 0 && (
        <ul className="showcase-social-list">
          {links.map((link) => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></li>)}
        </ul>
      )}
    </section>
  )
}