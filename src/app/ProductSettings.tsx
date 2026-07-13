import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ProductMutationToken } from '../data/studioRepository'
import type { Product } from '../domain/models'
import { Modal } from './Modal'
import { ProductFields } from './ProductFields'
import { mergeProductValues, productToFormValues, validateProductValues } from './productForm'
import { mutationErrorMessage } from './mutationError'

interface ProductSettingsProps {
  product: Product
  products: Product[]
  onSaveProduct: (product: Product, token: ProductMutationToken) => Promise<void>
  onArchiveProduct: (product: Product) => Promise<void>
  onArchived: () => void
}

export function ProductSettings({ product, products, onSaveProduct, onArchiveProduct, onArchived }: ProductSettingsProps) {
  const [values, setValues] = useState(productToFormValues(product))
  const [errors, setErrors] = useState({})
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [externalProduct, setExternalProduct] = useState<Product | null>(null)
  const [busy, setBusy] = useState(false)
  const latestProduct = useRef(product)
  latestProduct.current = product
  const loadedVersion = useRef({ id: product.id, updatedAt: product.updatedAt })

  useEffect(() => {
    const currentProduct = latestProduct.current
    const changedProduct = loadedVersion.current.id !== product.id
    const changedVersion = loadedVersion.current.updatedAt !== product.updatedAt
    if (!changedProduct && !changedVersion) return
    if (!changedProduct && dirty) {
      setExternalProduct(currentProduct)
      return
    }
    setValues(productToFormValues(currentProduct))
    setDirty(false)
    setExternalProduct(null)
    setErrors({})
    setFeedback(null)
    loadedVersion.current = { id: product.id, updatedAt: product.updatedAt }
  }, [dirty, product.id, product.updatedAt])

  const changeValues = (nextValues: ReturnType<typeof productToFormValues>) => {
    setValues(nextValues)
    setDirty(true)
  }

  const loadExternalVersion = () => {
    if (externalProduct === null) return
    setValues(productToFormValues(externalProduct))
    setDirty(false)
    loadedVersion.current = { id: externalProduct.id, updatedAt: externalProduct.updatedAt }
    setExternalProduct(null)
    setErrors({})
    setFeedback(null)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateProductValues(values, products, product.id)
    setErrors(nextErrors)
    setFeedback(null)
    if (Object.keys(nextErrors).length > 0) return
    const updated = mergeProductValues(product, values, new Date().toISOString())
    setBusy(true)
    try {
      await onSaveProduct(updated, { expectedUpdatedAt: loadedVersion.current.updatedAt })
      loadedVersion.current = {
        id: latestProduct.current.id,
        updatedAt: latestProduct.current.updatedAt,
      }
      setDirty(false)
      setExternalProduct(null)
      setFeedback({ type: 'success', text: '设置已保存' })
    } catch (error) {
      setFeedback({ type: 'error', text: mutationErrorMessage(error, '保存失败，请稍后重试') })
    } finally {
      setBusy(false)
    }
  }

  const archive = async () => {
    setBusy(true)
    try {
      await onArchiveProduct(product)
      onArchived()
    } catch (error) {
      setConfirming(false)
      setFeedback({ type: 'error', text: mutationErrorMessage(error, '归档失败，请稍后重试') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-stack" aria-labelledby="product-settings-title">
      <form className="overview-card settings-form" onSubmit={save} noValidate>
        <div className="section-heading"><div><h2 id="product-settings-title">产品设置</h2><p>维护展示信息、状态和数据口径。</p></div><button type="submit" disabled={busy}>保存设置</button></div>
        <ProductFields values={values} errors={errors} onChange={changeValues} />
        {externalProduct && <div role="alert" className="feedback warning conflict-feedback"><span>当前产品已在其他窗口更新。你的草稿已保留。</span><button type="button" className="secondary" onClick={loadExternalVersion}>加载外部版本</button></div>}
        {feedback && <p role={feedback.type === 'success' ? 'status' : 'alert'} className={`feedback ${feedback.type}`}>{feedback.text}</p>}
      </form>
      <section className="overview-card danger-zone"><div><h2>归档产品</h2><p>归档后产品会从常用列表和产品总览隐藏，之后仍可恢复。</p></div><button className="danger" onClick={() => setConfirming(true)}>归档产品</button></section>
      {confirming && <Modal title={`确认归档 ${product.name}？`} onClose={() => setConfirming(false)} closeDisabled={busy} className="confirm-dialog" showCloseButton={false}><p>归档后可在产品总览恢复，现有数据不会删除。</p><div className="dialog-actions"><button className="secondary" onClick={() => setConfirming(false)} disabled={busy} data-autofocus>取消</button><button className="danger" onClick={() => void archive()} disabled={busy}>确认归档</button></div></Modal>}
    </section>
  )
}
