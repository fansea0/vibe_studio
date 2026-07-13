// @vitest-environment node

import { describe, expect, it } from 'vitest'

import config from '../../vite.config'

describe('Vitest discovery', () => {
  it('excludes local Git worktree test trees', () => {
    const resolvedConfig = config as {
      test?: { exclude?: string[] }
    }

    expect(resolvedConfig.test?.exclude).toEqual(
      expect.arrayContaining(['**/.worktrees/**', '**/worktrees/**']),
    )
  })
})
