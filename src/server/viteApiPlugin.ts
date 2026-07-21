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

export function createViteApiPlugin({ databasePath, gitReader }: { databasePath?: string; gitReader?: typeof readGitLog } = {}): Plugin {
  let repo: any
  return {
    name: 'vibe-studio-api',
    async configureServer(server) {
      const file = databasePath ?? path.resolve(process.cwd(), 'data/vibe-studio.sqlite')
      repo = createSqliteRepository(file)
      const profilePath = path.resolve(process.cwd(), 'data/showcase-profile.json')
      const profileReader = async (): Promise<ShowcaseProfile> => {
        const raw = await readFile(profilePath, 'utf8').catch(() => null)
        if (!raw) throw new Error('profile missing')
        const parsed = JSON.parse(raw) as Partial<ShowcaseProfile>
        return {
          displayName: parsed.displayName ?? DEFAULT_PROFILE.displayName,
          tagline: parsed.tagline ?? DEFAULT_PROFILE.tagline,
          avatarUrl: parsed.avatarUrl ?? null,
          statusLine: parsed.statusLine ?? DEFAULT_PROFILE.statusLine,
          statusPillText: parsed.statusPillText ?? DEFAULT_PROFILE.statusPillText,
          aboutParagraphs: Array.isArray(parsed.aboutParagraphs) ? parsed.aboutParagraphs : [],
          contactEmail: parsed.contactEmail ?? DEFAULT_PROFILE.contactEmail,
          socialLinks: Array.isArray(parsed.socialLinks) ? parsed.socialLinks : [],
        }
      }
      const handler = createApiHandler({ repository: repo, readGitLog: gitReader, profileReader })
      server.middlewares.use('/api', (req, res) => handler(req, res))
      server.httpServer?.once('close', () => repo?.close())
    },
  }
}
