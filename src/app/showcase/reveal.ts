export function observeReveal(element: HTMLElement, onReveal: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') { onReveal(); return () => undefined }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { onReveal(); observer.disconnect(); return }
    }
  }, { threshold: 0.1 })
  observer.observe(element)
  return () => observer.disconnect()
}