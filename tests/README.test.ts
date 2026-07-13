import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('README', () => {
  it('documents setup, verification, and local Markdown storage constraints', () => {
    const readme = readFileSync(`${process.cwd()}/README.md`, 'utf8')

    for (const command of ['npm install', 'npm run dev', 'npm test -- --run', 'npm run build']) {
      expect(readme).toContain(command)
    }
    expect(readme).toContain('Node.js 22.12.0+')
    expect(readme).toMatch(/localStorage.*单浏览器/s)
    expect(readme).toMatch(/用户.*清理/s)
    expect(readme).toMatch(/Markdown.*文本.*小文件/s)
    expect(readme).toMatch(/生产.*大文件.*服务端/s)
  })
})
