import { useEffect, useRef, useState } from 'react'
import type { PublicProduct } from '../../domain/models'

interface Props { product: PublicProduct }

export function ProductShowcaseFrame({ product }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  if (!product.showcasePagePath) return null

  const src = '/api/showcase/pages/' + encodeURIComponent(product.id)

  const handleLoad = () => {
    setLoadState('ready')
    const iframe = iframeRef.current?.contentWindow
    if (!iframe) return
    try {
      iframe.postMessage(
        { type: 'vibe-studio:showcase-data', product },
        window.location.origin,
      )
    } catch { /* sandbox may block in some browsers; ignore */ }
  }

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'vibe-studio:open-url' && typeof event.data.url === 'string') {
        try { window.open(event.data.url, '_blank', 'noopener,noreferrer') } catch { /* ignore */ }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  return (
    <>
      {loadState !== 'ready' && (
        <div className={'showcase-frame-state showcase-frame-' + loadState}>
          {loadState === 'loading' && <p>正在加载作品页…</p>}
          {loadState === 'error' && (
            <>
              <p>作品页加载失败</p>
              <button onClick={() => { setLoadState('loading'); setReloadKey((k) => k + 1) }}>重新加载</button>
            </>
          )}
        </div>
      )}
      <iframe
        key={reloadKey}
        ref={iframeRef}
        src={src}
        title={product.name + ' 作品展示'}
        className="showcase-frame"
        sandbox="allow-scripts"
        hidden={loadState !== 'ready'}
        onLoad={handleLoad}
        onError={() => setLoadState('error')}
      />
    </>
  )
}
