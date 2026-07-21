import { BrowserRouter, MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { ShowcaseShell } from './ShowcaseShell'
import { ShowcaseDetailPage } from './ShowcaseDetailPage'
import { HeroSection } from './HeroSection'
import { NowSection } from './NowSection'
import { WorksSection } from './WorksSection'
import { AboutSection } from './AboutSection'
import { ContactSection } from './ContactSection'
import { useShowcaseProfile } from './useShowcaseProfile'

interface ShowcaseAppProps { initialEntries?: string[] }

function Home() {
  const { profile, error: profileError } = useShowcaseProfile()
  return (
    <>
      <HeroSection profile={profile} error={profileError} />
      <NowSection statusLine={profile.statusLine} error={profileError} />
      <WorksSection />
      <AboutSection paragraphs={profile.aboutParagraphs} error={profileError} />
      <ContactSection email={profile.contactEmail} links={profile.socialLinks} error={profileError} />
    </>
  )
}

export function ShowcaseApp({ initialEntries }: ShowcaseAppProps) {
  const Router = initialEntries ? MemoryRouter : BrowserRouter
  return (
    <Router {...(initialEntries ? { initialEntries } : {})}>
      <Routes>
        <Route path="/showcase" element={<ShowcaseShell><Home /></ShowcaseShell>} />
        <Route path="/showcase/:productId" element={<ShowcaseShell><ShowcaseDetailRoute /></ShowcaseShell>} />
        <Route path="/showcase/*" element={<ShowcaseShell><NotFound /></ShowcaseShell>} />
      </Routes>
    </Router>
  )
}

function ShowcaseDetailRoute() {
  const { productId } = useParams()
  if (!productId) return <NotFound />
  return <ShowcaseDetailPage productId={productId} />
}

function NotFound() {
  return (
    <section className="showcase-section">
      <h2>作品未公开或不存在</h2>
      <p>这个作品可能还没有对外公开，或者链接已失效。</p>
      <a href="/showcase">返回作品集</a>
    </section>
  )
}