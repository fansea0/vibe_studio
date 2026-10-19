#!/usr/bin/env node
/**
 * 以「独立应用窗口」方式打开 Vibe Studio。
 *
 * macOS 上用 Chromium 系浏览器的 --app 模式：窗口没有地址栏和标签栏，
 * 标题栏显示应用名，Dock 里有独立图标，可以像原生 App 一样 Cmd+Tab 切换。
 *
 * 环境变量：
 *   BROWSER=none      不打开任何窗口
 *   VIBE_WINDOW=plain 退回普通浏览器标签页（不要独立窗口）
 *   VIBE_BROWSER=path 指定浏览器可执行文件
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const url = process.argv[2] ?? 'http://localhost:5173/products'
const usePlainWindow = process.env.VIBE_WINDOW === 'plain'

const candidates = [
  process.env.VIBE_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
].filter(Boolean)

const findBrowser = () => candidates.find((candidate) => existsSync(candidate)) ?? null

if (process.platform !== 'darwin') {
  // 非 macOS 没有 --app 模式，直接用默认浏览器。
  spawnSync('open', [url], { stdio: 'ignore' })
  process.exit(0)
}

const browser = findBrowser()
if (!browser) {
  console.warn('! 未找到 Chromium 系浏览器，改用系统默认浏览器打开。')
  spawnSync('open', [url], { stdio: 'ignore' })
  process.exit(0)
}

if (usePlainWindow) {
  spawnSync('open', [url], { stdio: 'ignore' })
  process.exit(0)
}

// 已有同款应用窗口时直接复用并前置，避免反复启动产生多个窗口。
const focusExistingWindow = () => {
  const script = `
tell application "System Events"
  set targetProcesses to every process whose name contains "Chrome" or name contains "Edge" or name contains "Chromium"
  repeat with p in targetProcesses
    try
      repeat with w in (every window of p)
        if (name of w) is "Vibe Studio" then
          perform action "AXRaise" of w
          return "ok"
        end if
      end repeat
    end try
  end repeat
  return "none"
end tell`
  const result = spawnSync('osascript', ['-e', script], { encoding: 'utf8' })
  return result.stdout.trim() === 'ok'
}

// --app=<url> 让浏览器以独立应用窗口打开（无地址栏、无标签栏）。
// 不指定 --user-data-dir：使用默认 profile 时窗口才会正常显示，
// 且 Cmd+Tab / Dock 行为与普通 Chrome 一致。
if (focusExistingWindow()) {
  console.log(`→ 已切换到已打开的 Vibe Studio 窗口`)
  process.exit(0)
}

const args = [`--app=${url}`, '--no-first-run', '--no-default-browser-check']
if (process.env.VIBE_PROFILE) args.push(`--user-data-dir=${process.env.VIBE_PROFILE}`)

const child = spawn(browser, args, { stdio: 'ignore', detached: true })

child.unref()
console.log(`→ 已打开独立应用窗口：${url}`)
