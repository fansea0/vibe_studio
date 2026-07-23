import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Plugin } from 'vite'
import { createSqliteRepository } from './sqlite.js'
import { createApiHandler } from './api.js'
import { readGitLog } from './gitLog.js'
import type { ShowcaseProfile } from '../domain/models.js'

const DEFAULT_PROFILE: ShowcaseProfile = {
  displayName: '',
  tagline: '',
  avatarUrl: null,
  statusLine: '',
  statusPillText: '',
  aboutParagraphs: [],
  contactEmail: '',
  socialLinks: [],
}

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)
const arr = <T>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback)

export function createViteApiPlugin({ databasePath, gitReader }: { databasePath?: string; gitReader?: typeof readGitLog } = {}): Plugin {
  let repo: any
  let warnedDefaults = false
  return {
    name: 'vibe-studio-api',
    async configureServer(server) {
      const file = databasePath ?? path.resolve(process.cwd(), 'data/vibe-studio.sqlite')
      // Surface a friendly warning when the DB is brand new (so users know the seed will run)
      // and a louder warning if the DB file was *just* created on this session start
      // (which only happens if someone deleted it — a strong signal they may have lost user data).
      const { statSync } = await import('node:fs')
      let dbAgeNote = ''
      try {
        const stat = statSync(file)
        const ageMs = Date.now() - stat.mtimeMs
        if (ageMs < 5_000) {
          dbAgeNote = ` [warning: file was created ${Math.round(ageMs / 1000)}s ago — if you had prior data it has been lost]`
        }
      } catch { /* file may not exist yet; seed will create it */ }
      if (dbAgeNote) server.config.logger.info(`[vibe-studio] using database ${file}${dbAgeNote}`)
      repo = createSqliteRepository(file)
      try {
        const purged = repo.purgeOldDeletedWorkItems(30)
        if (purged > 0) server.config.logger.info(`[vibe-studio] purged ${purged} work items older than retention window`)
      } catch (e) {
        server.config.logger.warn(`[vibe-studio] work item retention sweep failed: ${(e as Error).message}`)
      }
      const profilePath = path.resolve(process.cwd(), 'data/showcase-profile.json')
      // profileReader is invoked on every request so live edits to showcase-profile.json
      // take effect immediately without restarting the dev server.
      const profileReader = async (): Promise<ShowcaseProfile> => {
        const raw = await readFile(profilePath, 'utf8').catch(() => null)
        if (!raw) throw new Error(`profile missing at ${profilePath}`)
        let parsed: Partial<ShowcaseProfile>
        try {
          parsed = JSON.parse(raw) as Partial<ShowcaseProfile>
        } catch (error) {
          throw new Error(`profile parse error at ${profilePath}: ${(error as Error).message}`)
        }
        if (!parsed || typeof parsed !== 'object') throw new Error(`profile root is not an object at ${profilePath}`)
        const avatar = str(parsed.avatarUrl, DEFAULT_PROFILE.avatarUrl ?? '')
        const profile: ShowcaseProfile = {
          displayName: str(parsed.displayName, DEFAULT_PROFILE.displayName),
          tagline: str(parsed.tagline, DEFAULT_PROFILE.tagline),
          avatarUrl: avatar === '' ? null : avatar,
          statusLine: str(parsed.statusLine, DEFAULT_PROFILE.statusLine),
          statusPillText: str(parsed.statusPillText, DEFAULT_PROFILE.statusPillText),
          aboutParagraphs: arr<string>(parsed.aboutParagraphs, DEFAULT_PROFILE.aboutParagraphs),
          contactEmail: str(parsed.contactEmail, DEFAULT_PROFILE.contactEmail),
          socialLinks: arr(parsed.socialLinks, DEFAULT_PROFILE.socialLinks),
        }
        if (!warnedDefaults && !profile.displayName && !profile.contactEmail) {
          console.warn(`[vibe-studio] showcase profile at ${profilePath} has no displayName or contactEmail — using defaults.`)
          warnedDefaults = true
        }
        return profile
      }
      const handler = createApiHandler({ repository: repo, readGitLog: gitReader, profileReader })
      server.middlewares.use('/api', (req, res) => handler(req, res))
      server.httpServer?.once('close', () => repo?.close())
    },
  }
}