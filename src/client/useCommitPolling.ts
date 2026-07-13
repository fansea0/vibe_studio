import { useEffect, useRef, useState } from 'react'
import type { CommitSummary } from '../domain/models'
import { fetchCommits } from './api'
export interface CommitPollingState { commits: CommitSummary[]; loading: boolean; error: string; checkedAt: string | null }
export function useCommitPolling(productId: string | null | undefined, limit = 5): CommitPollingState {
  const [state, setState] = useState<CommitPollingState>({ commits: [], loading: Boolean(productId), error: '', checkedAt: null })
  const requestRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)
  useEffect(() => {
    if (!productId) { setState({ commits: [], loading: false, error: '', checkedAt: null }); return }
    let disposed = false
    const load = async () => {
      if (disposed || runningRef.current) return
      runningRef.current = true
      requestRef.current?.abort()
      const controller = new AbortController(); requestRef.current = controller
      setState((previous) => ({ ...previous, loading: previous.commits.length === 0, error: '' }))
      try { const response = await fetchCommits(productId, controller.signal, limit); if (!disposed) setState({ commits: response.items, loading: false, error: '', checkedAt: response.checkedAt }) }
      catch (error) { if (!disposed && (error as { name?: string } | null)?.name !== 'AbortError') setState((previous) => ({ ...previous, loading: false, error: '暂时无法读取 Git 更新' })) }
      finally { runningRef.current = false }
    }
    void load(); const timer = window.setInterval(() => { void load() }, 60_000)
    return () => { disposed = true; window.clearInterval(timer); requestRef.current?.abort(); requestRef.current = null }
  }, [productId, limit])
  return state
}
