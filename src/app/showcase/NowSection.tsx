interface Props { statusLine: string; error: string }
export function NowSection({ statusLine, error }: Props) {
  if (error || !statusLine) return null
  return (
    <section className="showcase-now">
      <span className="showcase-now-label">NOW</span>
      <p>{statusLine}</p>
    </section>
  )
}