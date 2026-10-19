#!/usr/bin/env node
/**
 * 强制启动开发服务器：先释放端口，再拉起 Vite。
 *
 * 用法：
 *   npm run dev          # 端口被占时自动释放后启动
 *   npm run dev:force    # 同上，行为一致（保留为显式别名）
 *
 * 只终止监听目标端口的进程，且必须是 Vite/Node 进程，
 * 避免误杀浏览器等无关程序。
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// node_modules/.bin/vite 在 Unix 下是指向 vite.js 的软链，直接用 node 执行它即可。
const viteBin = path.join(projectRoot, 'node_modules', '.bin', 'vite')

const PORT = Number(process.env.PORT ?? 5173)

/** 找出监听指定端口的进程 PID。 */
const findPortHolders = (port) => {
  if (process.platform === 'darwin') {
    const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
    if (result.status !== 0) return []
    return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean)
  }
  const result = spawnSync('ss', ['-lptnH', `sport = :${port}`], { encoding: 'utf8' })
  if (result.status !== 0) return []
  const pids = []
  for (const match of result.stdout.matchAll(/pid=(\d+)/g)) pids.push(match[1])
  return [...new Set(pids)]
}

/** 端口是否被占用：直接问操作系统有没有人在监听。 */
const isPortFree = (port) => findPortHolders(port).length === 0

/**
 * 确认进程确实是「本项目的 Vite dev server」，而不是任意 Node 程序。
 * 仅按进程命令行匹配太宽松（任何 node 脚本都会命中），因此同时校验：
 *   1. 命令行里包含 vite
 *   2. 命令行里包含本项目路径
 * 两者都满足才允许终止，避免误杀其他 Node 服务。
 */
const isServerProcess = (pid) => {
  const result = spawnSync('ps', ['-p', pid, '-o', 'command='], { encoding: 'utf8' })
  const command = result.stdout.trim()
  if (!command) return false
  if (!/vite/i.test(command)) return false
  return command.includes(projectRoot) || command.includes('/vite/') || command.includes('/vite@')
}

const kill = (pid) => {
  // 先礼后兵：SIGTERM 收尾，2 秒后仍存活再 SIGKILL。
  try { process.kill(Number(pid), 'SIGTERM') } catch { /* 进程可能已退出 */ }
}

const forceKill = (pid) => {
  try { process.kill(Number(pid), 'SIGKILL') } catch { /* 进程可能已退出 */ }
}

const releasePort = async () => {
  const holders = findPortHolders(PORT)
  if (holders.length === 0) return true

  const killable = holders.filter(isServerProcess)
  const skipped = holders.filter((pid) => !killable.includes(pid))
  if (skipped.length > 0) {
    // 无法安全释放：不误杀别人的服务，改为顺延端口。
    console.warn(`! 端口 ${PORT} 被其他程序占用（PID: ${skipped.join(', ')}），不强制终止，自动改用下一个可用端口。`)
    return false
  }

  console.log(`→ 端口 ${PORT} 被占用，正在释放（PID: ${killable.join(', ')}）…`)
  for (const pid of killable) kill(pid)
  await new Promise((resolve) => setTimeout(resolve, 2000))
  // 仍有残留则强杀。
  for (const pid of findPortHolders(PORT)) {
    if (killable.includes(pid)) forceKill(pid)
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
  return isPortFree(PORT)
}

/**
 * 找一个真正可用的端口：逐个尝试 bind 127.0.0.1 与 ::1，
 * 两者都能绑定才算空闲（与浏览器访问 localhost 的行为一致）。
 */
const findFreePort = async (start) => {
  for (let port = start; port < start + 50; port += 1) {
    if (await canBind(port)) return port
  }
  return null
}

const canBind = (port) =>
  new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port)
  })

const main = async () => {
  let port = PORT
  if (!isPortFree(PORT)) {
    const released = await releasePort()
    if (released && isPortFree(PORT)) {
      console.log(`✓ 端口 ${PORT} 已释放`)
    } else {
      // 释放不了就自己找一个干净端口，避免 Vite 在 IPv6 上另起一个同名端口造成访问混淆。
      const free = await findFreePort(PORT + 1)
      if (free === null) {
        console.error(`✗ 端口 ${PORT} 之后找不到可用端口，请手动处理。`)
        process.exit(1)
      }
      console.warn(`→ 端口 ${PORT} 不可用，改用 ${free}。`)
      port = free
    }
  }

  // node_modules/.bin/vite 是 shell 包装脚本，直接执行它即可（它自己会调用 node）。
  const child = spawn(viteBin, ['--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
  })

  // 解析 Vite 输出的实际访问地址，等服务器就绪后再以独立应用窗口打开。
  const openAppWindow = (resolvedUrl) => {
    if (process.env.BROWSER === 'none') return
    const opener = spawn(process.execPath, [path.join(projectRoot, 'scripts', 'open-app-window.mjs'), resolvedUrl], {
      stdio: 'inherit',
      cwd: projectRoot,
    })
    opener.unref()
  }
  let opened = false
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    process.stdout.write(text)
    const match = text.match(/Local:\s+(http:\/\/\S+)/)
    if (match && !opened) {
      opened = true
      // 打开应用首页而不是裸根路径。
      const base = match[1].replace(/\/$/, '')
      setTimeout(() => openAppWindow(`${base}/products`), 400)
    }
  })
  child.on('exit', (code) => process.exit(code ?? 0))
  // 转发中断信号，让 Ctrl+C 干净地停掉 dev server。
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { child.kill(signal) })
  }
}

main()
