import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { stat } from 'node:fs/promises'
import type { CommitSummary } from '../domain/models.js'
const run = promisify(execFile)
export class GitLogError extends Error { readonly code:'GIT_REPOSITORY_INVALID'|'GIT_READ_FAILED'; constructor(code:'GIT_REPOSITORY_INVALID'|'GIT_READ_FAILED', message:string){super(message); this.code=code; this.name='GitLogError'} }
export async function readGitLog(repositoryPath:string, limit:number): Promise<{items:CommitSummary[];checkedAt:string}> {
  if (!Number.isInteger(limit)||limit<1||limit>20||typeof repositoryPath!=='string'||!repositoryPath.startsWith('/')||repositoryPath.includes('\0')) throw new GitLogError('GIT_REPOSITORY_INVALID','Invalid repository')
  try { const s=await stat(repositoryPath); if(!s.isDirectory()) throw new Error('not dir') } catch { throw new GitLogError('GIT_REPOSITORY_INVALID','Invalid repository') }
  try { await run('git',['-C',repositoryPath,'rev-parse','--is-inside-work-tree']); const {stdout}=await run('git',['-C',repositoryPath,'log','-n',String(limit),'--date=iso-strict','--pretty=format:%H%x09%h%x09%an%x09%aI%x09%s']); const lines=stdout?stdout.split('\n'):[]; const items=lines.map(line=>{const p=line.split('\t'); if(p.length!==5||!p[0]||!p[1]||!p[3]) throw new Error('malformed'); return {sha:p[0],shortSha:p[1],author:p[2],committedAt:p[3],subject:p[4]} }); return {items,checkedAt:new Date().toISOString()} } catch(e) { if(e instanceof GitLogError) throw e; throw new GitLogError('GIT_READ_FAILED','Failed to read git log') }
}
