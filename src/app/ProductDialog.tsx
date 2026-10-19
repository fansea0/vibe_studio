import { useState, type FormEvent } from 'react'
import type { ProductMutationToken } from '../data/studioRepository'
import type { Product } from '../domain/models'
import { Modal } from './Modal'
import { ProductFields } from './ProductFields'
import { createProductId, mergeProductValues, productToFormValues, validateProductValues } from './productForm'
import { mutationErrorMessage } from './mutationError'

interface ProductDialogProps {
  products: Product[]
  onSaveProduct: (product: Product, token: ProductMutationToken) => Promise<Product | void>
  onClose: () => void
  onCreated: (product: Product) => void
}

export function ProductDialog({ products, onSaveProduct, onClose, onCreated }: ProductDialogProps) {
  const [values, setValues] = useState(productToFormValues())
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateProductValues(values, products)
    setErrors(nextErrors)
    setFailure('')
    if (Object.keys(nextErrors).length > 0) return
    const now = new Date().toISOString()
    const base: Product = {
      id: createProductId(values.name, products), name: '', description: '', icon: '',
      status: 'developing', userCount: 0, appUrl: null,
      archivedAt: null, repositoryPath: '', isPublic: false, createdAt: now, updatedAt: now,
    }
    const product = mergeProductValues(base, values, now)
    setBusy(true)
    try {
      const saved = await onSaveProduct(product, { expectedUpdatedAt: null })
      onCreated(saved ?? product)
    } catch (error) {
      setFailure(mutationErrorMessage(error, '保存失败，请稍后重试'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="新建产品" onClose={onClose} closeDisabled={busy}>
      <form onSubmit={submit} noValidate>
        <ProductFields values={values} errors={errors} onChange={setValues} advancedOpen={advancedOpen} onAdvancedToggle={setAdvancedOpen} />
        {failure && <p role="alert" className="feedback error">{failure}</p>}
        <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>取消</button><button type="submit" disabled={busy}>创建产品</button></div>
      </form>
    </Modal>
  )
}
