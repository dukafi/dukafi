import { describe, expect, it } from 'bun:test'
import { FormModule } from '../../modules/base/forms'
import { FORM_RUNTIME_JS } from '../../modules/base/forms/formRuntimeJs'

describe('base.form module-JS emission', () => {
  it('emits the form runtime as js when mode is cms', () => {
    const out = FormModule.render({ ...FormModule.defaults, mode: 'cms' }, [])
    expect(out.js).toBe(FORM_RUNTIME_JS)
    expect(out.html).toContain('data-dukafi-form-mode="cms"')
  })

  it('emits no js when mode is custom', () => {
    const out = FormModule.render({ ...FormModule.defaults, mode: 'custom' }, [])
    expect(out.js).toBeUndefined()
  })

  it('runtime binds via document-level delegation and reads pageId per form', () => {
    expect(FORM_RUNTIME_JS).toContain("document.addEventListener('submit'")
    expect(FORM_RUNTIME_JS).toContain('data-dukafi-page-id')
    expect(FORM_RUNTIME_JS).toContain('/_dukafi/form/challenge')
    expect(FORM_RUNTIME_JS).toContain('/_dukafi/form/submit')
  })
})
