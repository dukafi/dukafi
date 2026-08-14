import { describe, expect, it } from 'bun:test'
import type { Page, PageNode } from '@core/page-tree'
import { reindexNodeParents } from '@core/page-tree'
import { derivePageFormSnapshots } from '@core/forms'

function node(id: string, moduleId: string, props: Record<string, unknown>, children: string[] = []): PageNode {
  return {
    id,
    moduleId,
    props,
    children,
    breakpointOverrides: {},
    classIds: [],
  }
}

const page: Page = {
  id: 'page-home',
  slug: 'index',
  title: 'Home',
  rootNodeId: 'body',
  nodes: {
    body: node('body', 'base.body', {}, ['form', 'outside-input']),
    form: node('form', 'base.form', {
      mode: 'cms',
      formId: 'newsletter',
      targetTableId: 'newsletter_submissions',
      honeypotName: 'company',
      minSubmitSeconds: 2,
    }, ['field', 'submit', 'message']),
    field: node('field', 'base.container', {}, ['label', 'input']),
    label: node('label', 'base.label', { text: 'Email', targetMode: 'auto', targetId: '' }),
    input: node('input', 'base.input', {
      fieldId: 'email',
      name: '',
      id: 'email-input',
      inputType: 'email',
      required: true,
      maxLength: 320,
    }),
    submit: node('submit', 'base.submit', { label: 'Subscribe', formId: '' }),
    message: node('message', 'base.form-message', { formId: '', kind: 'success', text: 'Thanks' }),
    'outside-input': node('outside-input', 'base.input', { fieldId: 'ignored' }),
  },
}
reindexNodeParents(page.nodes)

describe('derivePageFormSnapshots', () => {
  it('derives trusted form/control metadata from the page tree', () => {
    const snapshots = derivePageFormSnapshots(page)

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({
      pageId: 'page-home',
      nodeId: 'form',
      formId: 'newsletter',
      targetTableId: 'newsletter_submissions',
      honeypotName: 'company',
      minSubmitSeconds: 2,
    })
    expect(snapshots[0].controls).toEqual([
      {
        nodeId: 'input',
        fieldId: 'email',
        name: 'email',
        inputType: 'email',
        required: true,
        maxLength: 320,
      },
    ])
  })

  it('infers labels, submit buttons, and messages from nearest form structure', () => {
    const [snapshot] = derivePageFormSnapshots(page)

    expect(snapshot.labels).toEqual([
      { nodeId: 'label', targetNodeId: 'input', text: 'Email' },
    ])
    expect(snapshot.submits).toEqual([
      { nodeId: 'submit', label: 'Subscribe' },
    ])
    expect(snapshot.messages).toEqual([
      { nodeId: 'message', kind: 'success', text: 'Thanks' },
    ])
  })

  it('normalizes form identifiers before matching related form nodes', () => {
    const spacedIdPage: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        form: node('form', 'base.form', {
          mode: 'cms',
          formId: 'Contact Form',
          targetTableId: 'newsletter_submissions',
        }, ['submit', 'message']),
        submit: node('submit', 'base.submit', { label: 'Send', formId: 'Contact Form' }),
        message: node('message', 'base.form-message', {
          formId: 'Contact Form',
          kind: 'success',
          text: 'Thanks',
        }),
      },
    }
    reindexNodeParents(spacedIdPage.nodes)

    const [snapshot] = derivePageFormSnapshots(spacedIdPage)

    expect(snapshot.formId).toBe('Contact-Form')
    expect(snapshot.submits).toEqual([{ nodeId: 'submit', label: 'Send' }])
    expect(snapshot.messages).toEqual([{ nodeId: 'message', kind: 'success', text: 'Thanks' }])
  })
})
