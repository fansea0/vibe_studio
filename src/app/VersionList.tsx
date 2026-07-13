import { useState, type FormEvent } from 'react'
import type { ProductVersion, VersionStatus } from '../domain/models'
import { Modal } from './Modal'
import { dateValueToIso, getLocalDateValue, isValidDateValue, isoToDateValue } from './dateForm'

interface VersionListProps {
  productId: string
  versions: ProductVersion[]
  currentVersion: string
  onSaveVersion: (version: ProductVersion) => void
}

const versionStatusLabels: Record<VersionStatus, string> = {
  planned: '计划中',
  released: '已发布',
}

export function VersionList({ productId, versions, currentVersion, onSaveVersion }: VersionListProps) {
  const [creating, setCreating] = useState(false)
  const sortedVersions = versions.toSorted((left, right) =>
    Date.parse(right.createdAt) - Date.parse(left.createdAt) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  )
  return <section className="work-stack" aria-labelledby="version-list-title">
    <div className="section-heading work-heading"><div><h2 id="version-list-title">手动版本</h2><p>记录计划与已发布版本。</p></div><button aria-label="新建版本" onClick={() => setCreating(true)}>＋ 新建版本</button></div>
    <div className="version-list">{sortedVersions.map((version) => <article className="version-card" key={version.id}>
      <div><h3>{version.number}</h3>{version.status === 'released' && version.number === currentVersion && <span className="current-version">当前版本</span>}</div>
      <span className={`version-status ${version.status}`}>{versionStatusLabels[version.status]}</span>
      <time>{version.releasedAt ? isoToDateValue(version.releasedAt) : '未发布'}</time>
      <p>{version.notes || '暂无版本说明'}</p>
    </article>)}</div>
    {sortedVersions.length === 0 && <div className="empty-card"><h3>还没有版本</h3><p>创建第一个手动版本记录。</p></div>}
    {creating && <VersionDialog productId={productId} versions={versions} onSave={onSaveVersion} onClose={() => setCreating(false)} />}
  </section>
}

function VersionDialog({ productId, versions, onSave, onClose }: { productId: string; versions: ProductVersion[]; onSave: (version: ProductVersion) => void; onClose: () => void }) {
  const [number, setNumber] = useState('')
  const [status, setStatus] = useState<VersionStatus>('planned')
  const [releasedAt, setReleasedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<{ number?: string; releasedAt?: string; save?: string }>({})
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmedNumber = number.trim()
    const effectiveDate = status === 'released' ? releasedAt || getLocalDateValue(new Date()) : ''
    const nextErrors = {
      ...(!trimmedNumber ? { number: '请输入版本号' } : {}),
      ...(trimmedNumber && versions.some((version) => version.number === trimmedNumber) ? { number: '版本号已存在' } : {}),
      ...(status === 'released' && !isValidDateValue(effectiveDate) ? { releasedAt: '请输入有效日期' } : {}),
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    const now = new Date().toISOString()
    const version: ProductVersion = { id: `${productId}-${crypto.randomUUID()}`, productId, number: trimmedNumber, status, releasedAt: status === 'released' ? dateValueToIso(effectiveDate) : null, notes: notes.trim(), createdAt: now, updatedAt: now }
    try { onSave(version); onClose() } catch { setErrors({ save: '保存失败，请稍后重试' }) }
  }
  return <Modal title="新建版本" onClose={onClose}><form onSubmit={submit} noValidate>
    <div className="form-grid"><div className="field"><label htmlFor="version-number">版本号</label><input id="version-number" value={number} onChange={(event) => setNumber(event.target.value)} aria-invalid={errors.number ? true : undefined} aria-describedby={errors.number ? 'version-number-error' : undefined} />{errors.number && <span id="version-number-error" role="alert" className="field-error">{errors.number}</span>}</div>
    <label className="field">状态<select value={status} onChange={(event) => setStatus(event.target.value as VersionStatus)}><option value="planned">计划中</option><option value="released">已发布</option></select></label>
    <div className="field span-2"><label htmlFor="version-release-date">发布日期</label><input id="version-release-date" placeholder="YYYY-MM-DD" value={releasedAt} onChange={(event) => setReleasedAt(event.target.value)} aria-invalid={errors.releasedAt ? true : undefined} aria-describedby={errors.releasedAt ? 'version-release-date-error' : undefined} />{errors.releasedAt && <span id="version-release-date-error" role="alert" className="field-error">{errors.releasedAt}</span>}</div>
    <label className="field span-2">版本说明<textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div>
    {errors.save && <p role="alert" className="feedback error">{errors.save}</p>}
    <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button type="submit">创建版本</button></div>
  </form></Modal>
}
