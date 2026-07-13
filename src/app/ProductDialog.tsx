import { useState, type FormEvent } from 'react'
import type { Product } from '../domain/models'
import { Modal } from './Modal'
import { ProductFields } from './ProductFields'
import { createProductId, mergeProductValues, productToFormValues, validateProductValues } from './productForm'

interface ProductDialogProps {
  products: Product[]
  onSaveProduct: (product: Product) => void
  onClose: () => void
  onCreated: (product: Product) => void
}

export function ProductDialog({ products, onSaveProduct, onClose, onCreated }: ProductDialogProps) {
  const [values, setValues] = useState(productToFormValues())
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateProductValues(values, products)
    setErrors(nextErrors)
    setFailure('')
    if (Object.keys(nextErrors).length > 0) return
    const now = new Date().toISOString()
    const base: Product = {
      id: createProductId(values.name, products), name: '', description: '', productType: '', icon: '',
      status: 'developing', completionPercent: 0, userCount: 0, userCountSource: '', appUrl: null,
      archivedAt: null, createdAt: now, updatedAt: now,
    }
    const product = mergeProductValues(base, values, now)
    try {
      onSaveProduct(product)
      onCreated(product)
    } catch {
      setFailure('保存失败，请稍后重试')
    }
  }

  return (
    <Modal title="新建产品" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ProductFields values={values} errors={errors} onChange={setValues} />
        {failure && <p role="alert" className="feedback error">{failure}</p>}
        <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button type="submit">创建产品</button></div>
      </form>
    </Modal>
  )
}
