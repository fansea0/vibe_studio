import { useEffect, useState, type FormEvent } from 'react'
import type { Product } from '../domain/models'
import { Modal } from './Modal'
import { ProductFields } from './ProductFields'
import { mergeProductValues, productToFormValues, validateProductValues } from './productForm'

interface ProductSettingsProps {
  product: Product
  products: Product[]
  onSaveProduct: (product: Product) => void
  onArchiveProduct: (product: Product) => void
  onArchived: () => void
}

export function ProductSettings({ product, products, onSaveProduct, onArchiveProduct, onArchived }: ProductSettingsProps) {
  const [values, setValues] = useState(productToFormValues(product))
  const [errors, setErrors] = useState({})
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => setValues(productToFormValues(product)), [product])

  const save = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateProductValues(values, products, product.id)
    setErrors(nextErrors)
    setFeedback(null)
    if (Object.keys(nextErrors).length > 0) return
    const updated = mergeProductValues(product, values, new Date().toISOString())
    try {
      onSaveProduct(updated)
      setFeedback({ type: 'success', text: '设置已保存' })
    } catch {
      setFeedback({ type: 'error', text: '保存失败，请稍后重试' })
    }
  }

  const archive = () => {
    try {
      onArchiveProduct(product)
      onArchived()
    } catch {
      setConfirming(false)
      setFeedback({ type: 'error', text: '归档失败，请稍后重试' })
    }
  }

  return (
    <section className="settings-stack" aria-labelledby="product-settings-title">
      <form className="overview-card settings-form" onSubmit={save} noValidate>
        <div className="section-heading"><div><h2 id="product-settings-title">产品设置</h2><p>维护展示信息、状态和数据口径。</p></div><button type="submit">保存设置</button></div>
        <ProductFields values={values} errors={errors} onChange={setValues} />
        {feedback && <p role={feedback.type === 'success' ? 'status' : 'alert'} className={`feedback ${feedback.type}`}>{feedback.text}</p>}
      </form>
      <section className="overview-card danger-zone"><div><h2>归档产品</h2><p>归档后产品会从常用列表和产品总览隐藏，之后仍可恢复。</p></div><button className="danger" onClick={() => setConfirming(true)}>归档产品</button></section>
      {confirming && <Modal title={`确认归档 ${product.name}？`} onClose={() => setConfirming(false)} className="confirm-dialog" showCloseButton={false}><p>归档后可在产品总览恢复，现有数据不会删除。</p><div className="dialog-actions"><button className="secondary" onClick={() => setConfirming(false)} data-autofocus>取消</button><button className="danger" onClick={archive}>确认归档</button></div></Modal>}
    </section>
  )
}
