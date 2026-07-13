import type { ChangeEvent } from 'react'
import type { ProductFormErrors, ProductFormValues } from './productForm'

interface ProductFieldsProps {
  values: ProductFormValues
  errors: ProductFormErrors
  onChange: (values: ProductFormValues) => void
  allowArchivedStatus?: boolean
}

export function ProductFields({ values, errors, onChange, allowArchivedStatus = true }: ProductFieldsProps) {
  const change = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange({ ...values, [event.target.name]: event.target.value })

  const field = (name: keyof ProductFormValues, label: string, input: React.ReactNode) => (
    <label className="field">
      <span>{label}</span>
      {input}
      {errors[name] && <small className="field-error">{errors[name]}</small>}
    </label>
  )

  return (
    <div className="form-grid">
      {field('name', '产品名称', <input name="name" value={values.name} onChange={change} />)}
      {field('icon', '产品图标', <input name="icon" value={values.icon} onChange={change} />)}
      <div className="span-2">
        {field('description', '产品描述', <textarea name="description" value={values.description} onChange={change} rows={3} />)}
      </div>
      {field('productType', '产品类型', <input name="productType" value={values.productType} onChange={change} />)}
      {field('status', '产品状态', (
        <select name="status" value={values.status} onChange={change}>
          <option value="developing">开发中</option><option value="beta">Beta</option>
          <option value="released">已发布</option>{allowArchivedStatus && <option value="archived">已归档</option>}
        </select>
      ))}
      {field('completionPercent', '完成度', <input name="completionPercent" type="number" min="0" max="100" value={values.completionPercent} onChange={change} />)}
      {field('userCount', '用户数', <input name="userCount" type="number" min="0" value={values.userCount} onChange={change} />)}
      {field('userCountSource', '用户数来源', <input name="userCountSource" value={values.userCountSource} onChange={change} />)}
      {field('appUrl', '应用地址', <input name="appUrl" type="url" placeholder="https://" value={values.appUrl} onChange={change} />)}
    </div>
  )
}
