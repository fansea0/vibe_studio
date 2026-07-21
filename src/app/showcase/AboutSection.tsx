interface Props { paragraphs: string[]; error: string }
export function AboutSection({ paragraphs, error }: Props) {
  if (error || paragraphs.length === 0) return null
  return (
    <section className="showcase-section">
      <h2 className="showcase-section-title">关于我</h2>
      <div className="showcase-about">{paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
    </section>
  )
}