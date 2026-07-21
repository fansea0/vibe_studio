export function ShowcaseSkeleton() {
  return (
    <div className="showcase-skeleton" aria-hidden="true">
      <div className="showcase-skeleton-line showcase-skeleton-line-lg" />
      <div className="showcase-skeleton-line showcase-skeleton-line-md" />
      <div className="showcase-skeleton-grid">
        <div className="showcase-skeleton-card" />
        <div className="showcase-skeleton-card" />
        <div className="showcase-skeleton-card" />
      </div>
    </div>
  )
}