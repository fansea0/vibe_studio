import { Route, Routes, useParams } from 'react-router-dom'
import { AboutSection } from './AboutSection'
import { ContactSection } from './ContactSection'
import { HeroSection } from './HeroSection'
import { NowSection } from './NowSection'
import { ShowcaseDetailPage } from './ShowcaseDetailPage'
import { ShowcaseShell } from './ShowcaseShell'
import { WorksSection } from './WorksSection'
import { useShowcaseProfile } from './useShowcaseProfile'

/** 作品集（对外公开）路由，挂在 ShowcaseShell 外壳里。 */
export function ShowcaseRoutes() {
  const { profile, error } = useShowcaseProfile()
  return <Routes>
    <Route path="" element={<ShowcaseShell><ShowcaseHome profile={profile} error={error} /></ShowcaseShell>} />
    <Route path=":productId" element={<ShowcaseShell><ShowcaseDetailRoute /></ShowcaseShell>} />
    <Route path="*" element={<ShowcaseShell><ShowcaseNotFound /></ShowcaseShell>} />
  </Routes>
}

function ShowcaseHome({ profile, error }: { profile: import('../../domain/models').ShowcaseProfile; error: string }) {
  return (
    <>
      <HeroSection profile={profile} error={error} />
      <NowSection statusLine={profile.statusLine} error={error} />
      <WorksSection />
      <AboutSection paragraphs={profile.aboutParagraphs} error={error} />
      <ContactSection email={profile.contactEmail} links={profile.socialLinks} error={error} />
    </>
  )
}

function ShowcaseDetailRoute() {
  const { productId } = useParams()
  if (!productId) return <ShowcaseNotFound />
  return <ShowcaseDetailPage productId={productId} />
}

export function ShowcaseNotFound() {
  return (
    <section className="showcase-section">
      <h2>作品未公开或不存在</h2>
      <p>这个作品可能还没有对外公开，或者链接已失效。</p>
      <a href="/showcase">返回作品集</a>
    </section>
  )
}
