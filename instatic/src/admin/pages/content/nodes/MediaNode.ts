/**
 * Tiptap node for the content editor's `media` block — an image or video
 * embed that serialises to `![alt](src)` / `@[video](src)` in markdown.
 *
 * Atomic block node. Editing the `src` / `alt` attrs happens via the
 * media-picker modal (the editor only owns selection + delete); the
 * rendered DOM is a non-editable `<figure>` with the asset inside.
 */

import { Node, mergeAttributes } from '@tiptap/core'

export type ContentMediaType = 'image' | 'video'

export interface MediaAttributes {
  mediaType: ContentMediaType
  src: string
  alt: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    media: {
      /**
       * Insert a media block at the current selection.
       */
      insertMedia: (attributes: MediaAttributes) => ReturnType
      /**
       * Update the currently selected media node's attributes.
       */
      updateMediaAttributes: (attributes: Partial<MediaAttributes>) => ReturnType
    }
  }
}

export const MediaNode = Node.create({
  name: 'media',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      mediaType: {
        default: 'image' as ContentMediaType,
        parseHTML: (element: HTMLElement) =>
          (element.getAttribute('data-media-type') as ContentMediaType | null) ?? 'image',
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-media-type': String(attrs.mediaType) }),
      },
      src: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-src') ?? '',
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-src': String(attrs.src) }),
      },
      alt: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-alt') ?? '',
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-alt': String(attrs.alt) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-instatic-media]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as MediaAttributes
    const inner = attrs.mediaType === 'video'
      ? ['video', { controls: '', src: attrs.src }]
      : ['img', { src: attrs.src, alt: attrs.alt }]
    return [
      'figure',
      mergeAttributes(HTMLAttributes, { 'data-instatic-media': '' }),
      inner,
    ]
  },

  addCommands() {
    return {
      insertMedia: (attributes) => ({ commands }) => {
        return commands.insertContent({ type: this.name, attrs: attributes })
      },
      updateMediaAttributes: (attributes) => ({ commands }) => {
        return commands.updateAttributes(this.name, attributes)
      },
    }
  },
})
