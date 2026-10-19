import { cloneElement, type ChangeEvent, type ReactElement } from 'react'
import type { ProductFormErrors, ProductFormValues } from './productForm'

interface ProductFieldsProps {
  values: ProductFormValues
  errors: ProductFormErrors
  onChange: (values: ProductFormValues) => void
  /** 折叠高级设置区，默认收起。 */
  advancedOpen?: boolean
  onAdvancedToggle?: (open: boolean) => void
}

export function ProductFields({ values, errors, onChange, advancedOpen, onAdvancedToggle }: ProductFieldsProps) {
  const change = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange({ ...values, [event.target.name]: event.target.value })

  const field = (name: keyof ProductFormValues, label: string, input: ReactElement, hint?: string) => {
    const inputId = `product-${name}`
    const errorId = `product-${name}-error`
    const describedInput = cloneElement(input, {
      id: inputId,
      'aria-invalid': errors[name] ? true : undefined,
      'aria-describedby': errors[name] ? errorId : undefined,
    } as React.HTMLAttributes<HTMLElement>)
    return (
      <div className="field">
        <label htmlFor={inputId}>{label}</label>
        {describedInput}
        {hint && !errors[name] && <small className="field-hint">{hint}</small>}
        {errors[name] && <small id={errorId} role="alert" className="field-error">{errors[name]}</small>}
      </div>
    )
  }

  return (
    <div className="form-sections">
      <section className="form-section" aria-label="基础信息">
        <p className="form-section-note">只有名称是必填的，其余可以随时补。</p>
        <div className="form-grid">
          {field('name', '产品名称', <input name="name" value={values.name} onChange={change} placeholder="例如 Flora" />)}
          {field('icon', '产品图标', <input name="icon" value={values.icon} onChange={change} placeholder="🌿" />, '一个 emoji 即可')}
          <div className="span-2">
            {field('description', '产品描述', <textarea name="description" value={values.description} onChange={change} rows={2} placeholder="一句话说明这个产品是做什么的" />)}
          </div>
          {field('status', '产品状态', (
            <select name="status" value={values.status} onChange={change}>
              <option value="developing">开发中</option><option value="beta">Beta</option>
              <option value="released">已发布</option>
            </select>
          ))}
          {field('userCount', '用户数', <input name="userCount" type="number" min="0" required value={values.userCount} onChange={change} />)}
          {field('appUrl', '应用地址', <input name="appUrl" type="url" placeholder="https://" value={values.appUrl} onChange={change} />)}
        </div>
      </section>

      <section className="form-section form-section-advanced" aria-label="高级设置">
        <button
          type="button"
          className="form-section-toggle"
          aria-expanded={advancedOpen ?? false}
          onClick={() => onAdvancedToggle?.(!advancedOpen)}
        >
          <span>高级设置</span>
          <span className="form-section-toggle-hint">仓库路径、对外公开、作品页</span>
          <span className="form-section-caret" aria-hidden="true">{advancedOpen ? '▾' : '▸'}</span>
        </button>
        {advancedOpen && (
          <div className="form-grid form-section-body">
            {field('repositoryPath', 'Git 仓库绝对路径', <input name="repositoryPath" placeholder="/Users/me/project" value={values.repositoryPath} onChange={change} />, '用于在概览读取提交记录')}
            <div className="span-2 field">
              <label htmlFor="product-showcasePagePath">自定义作品页路径</label>
              <input
                id="product-showcasePagePath"
                type="text"
                name="showcasePagePath"
                value={values.showcasePagePath}
                onChange={change}
                placeholder="data/products/<product-id>/showcase.html"
              />
              <small className="field-hint">留空使用默认详情页；填写后需重启 dev server 让 Vite 读取新文件</small>
            </div>
            <div className="span-2 field">
              <label htmlFor="product-isPublic" className="checkbox-field">
                <input
                  id="product-isPublic"
                  type="checkbox"
                  name="isPublic"
                  checked={values.isPublic}
                  onChange={(event) => onChange({ ...values, isPublic: event.target.checked })}
                />
                对外公开（显示在作品集页面）
              </label>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
