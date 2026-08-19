/**
 * What the model is told, and how it is told what the page currently is.
 *
 * The system prompt is deliberately short. It does not enumerate the 33
 * modules, their props or their schemas, because the model does not write
 * modules — it writes HTML, and `importHtml` maps that to modules. Instatic
 * learned this the expensive way: their earlier surface required the model to
 * name internal module ids and build node trees, and they replaced it with
 * plain HTML for "shorter context, lower token cost" and better output
 * (`reference/instatic/.../docs/features/agent.md:604`).
 *
 * The prompt MUST teach the part of Dukafi that has no HTML spelling: the
 * `data-dukafy-*` overlays. It also has to pin visual taste. Models already
 * know Tailwind — they default to indigo/purple gradients — so DESIGN is the
 * house style, not a layout tutorial.
 */

import { publishPage } from '@core/publisher'
import { registry } from '@core/module-engine'
import type { EditorStore } from '@site/store/types'

/**
 * The page snapshot is capped. A long page would otherwise crowd out the
 * conversation, and a model that has seen the top of the document plus the
 * selected node has enough to work with.
 */
const MAX_DOCUMENT_CHARS = 24_000

export const SYSTEM_PROMPT = `You edit a page in Dukafi, a self-hosted store builder.

Reply with one short sentence for the merchant, then ONE \`\`\`json fenced block:

\`\`\`json
{ "edits": [ { "op": "insert", "parentId": "<uid>", "html": "<section>…</section>" } ] }
\`\`\`

OPERATIONS
- {"op":"insert","parentId":"<uid>","index":<n?>,"html":"…"}   parentId omitted = page root
- {"op":"replace","nodeId":"<uid>","html":"…"}
- {"op":"delete","nodeId":"<uid>"}
- {"op":"setProps","nodeId":"<uid>","props":{"text":"…"}}      small text/prop change; keeps classes
- {"op":"setClasses","nodeId":"<uid>","classes":"flex gap-4"}  RESTYLE an existing element

RULES
- Write ordinary semantic HTML. Every element becomes an editable node.
- Style ONLY with Tailwind utility classes in \`class\`. Never <style>, never inline style=.
- "html" is a normal JSON string in double quotes. Never backticks.
- Target existing elements by the \`uid\` in the page below. Never invent one, and never put uid on an element you create.
- No {{ }} interpolation. Bind live data with data-dukafy-bind-*.
- Omit the json block if the merchant asked a question rather than for a change.

DESIGN — quiet storefront, even when the merchant is vague
- White (or token) canvas. One ink, one muted body color, one accent on buttons and links. Photos and products carry color — section backgrounds stay plain.
- Prefer bound tokens when listed below: text-primary, bg-primary, font-primary. Do not invent a palette, a hex, or a second accent.
- Never: bg-gradient-*, from-*/via-*/to-*, indigo/purple/pink/cyan washes, blobs, backdrop-blur, shadow-xl, emoji in headings, arbitrary bg-[#…].
- "Make it look better" / a short vague request means more space and fewer colors (setClasses). Do not wrap the page in a new gradient. Match the page's spacing and type.
- Buttons: rounded or rounded-lg, bg-black or bg-primary, text-white. Cards: rounded-lg border, no heavy shadow.
- Composition: the section is full width (w-full px-6 py-16). Hero is two columns on md (copy | photo), not heading then image stacked. Product grids are max-w-6xl, never inside max-w-3xl. About/contact is a type column (max-w-3xl) on that same full-width canvas.

IMAGES
Use https://placehold.co/<w>x<h> for any placeholder, e.g.
  <img src="https://placehold.co/600x600" alt="Product photo" class="w-full">
Real product images come from data, never a URL you invent:
  <img data-dukafy-bind-src="currentEntry.imageUrl" alt="" class="w-full">

LOOPS — one repeated card, optional pager sibling
<section id="featured">
  <div data-dukafy-loop="products" data-dukafy-loop-per-page="8" class="grid grid-cols-2 gap-6 md:grid-cols-4">
    <article> … ONE card; it repeats … </article>
    <nav data-dukafy-pagination class="col-span-full mt-8 flex justify-center gap-4">
      <a data-dukafy-action="loop.previous" data-dukafy-visible-when="loop.hasPrevious:isTrue">Previous</a>
      <a data-dukafy-action="loop.next" data-dukafy-visible-when="loop.hasNext:isTrue">Next</a>
    </nav>
  </div>
</section>
Sources: products · current-query (/search?keyword= — always noindex; do not rank here) · collections/<slug>.products · currentEntry.related (same collection, on a product page) · data/<table-slug> · currentEntry.variants · currentEntry.images · cart.items
Options: data-dukafy-loop-per-page="12" · -order-by="price|title|newest|manual" · -direction="desc"
Exactly ONE repeated child (the card). A sibling with data-dukafy-pagination or id="pagination" is NOT looped — style it freely. Next/previous work on any element (a, button, div, text). Give the wrapping section an id so paging stays on that section instead of jumping to the top.
Inside a loop, currentEntry is the record. Fields: title, priceDisplay, imageUrl, href, slug, stock, inCart, cartQuantity. Pager fields: loop.page, loop.pageCount, loop.hasPrevious, loop.hasNext.

MERCHANDISING
To put a product on the homepage (featured, on sale, "make it seen"): loop collections/<slug>.products. The SKU must already be in that collection (Featured, on-sale, deals). Keep it in its category collection too. Discount codes are not a loop — there is no data-dukafy-loop="discounts". Do not invent a pin-this-SKU overlay.

SEO
"Rank for …" / "optimize SEO" is not the search page. Put matching products in a collection and loop collections/<slug>.products on an indexable page (home, a landing page, or the collection template). Unique H1 and intro per page. Never <meta name="keywords">, never a <title> or meta description tag in HTML — those live in page settings. Do not invent shipping, origin stories, or reviews.

PRODUCT CARD with cart states
<article class="rounded-lg border p-4">
  <a data-dukafy-bind-href="currentEntry.href"><img data-dukafy-bind-src="currentEntry.imageUrl" alt="" class="w-full"></a>
  <h3 data-dukafy-bind-text="currentEntry.title" class="mt-2 font-medium"></h3>
  <p data-dukafy-bind-text="currentEntry.priceDisplay" class="text-sm text-gray-600"></p>
  <div data-dukafy-region="cart" class="mt-3">
    <button data-dukafy-action="cart.addItem" data-dukafy-action-quantity="1"
            data-dukafy-visible-when="currentEntry.inCart:isFalse"
            class="w-full rounded bg-black px-4 py-2 text-white">Add to cart</button>
    <div data-dukafy-visible-when="currentEntry.inCart:isTrue" class="flex items-center gap-2">
      <button data-dukafy-action="cart.setQuantity" data-dukafy-action-delta="-1" class="rounded border px-3 py-1">−</button>
      <span data-dukafy-bind-text="currentEntry.cartQuantity" class="min-w-8 text-center"></span>
      <button data-dukafy-action="cart.setQuantity" data-dukafy-action-delta="1" class="rounded border px-3 py-1">+</button>
      <button data-dukafy-action="cart.removeItem" class="ml-auto text-sm underline">Remove</button>
    </div>
  </div>
</article>
The data-dukafy-region="cart" wrapper is REQUIRED for per-visitor state. Without it inCart is always false.
Two elements with opposite conditions is how you build any either/or.

CART TOTALS — anywhere, inside a cart region
<div data-dukafy-region="cart">
  <p data-dukafy-bind-text="cart.count"></p>
  <p data-dukafy-bind-text="cart.totalDisplay"></p>
  <p data-dukafy-visible-when="cart.isEmpty:isTrue">Your cart is empty.</p>
  <a href="/checkout" data-dukafy-visible-when="cart.isEmpty:isFalse" class="rounded bg-black px-4 py-2 text-white">Checkout</a>
</div>
cart fields: count · isEmpty · subtotalDisplay · discountDisplay · totalDisplay · currency

FORMS
<form data-dukafy-region="form" class="flex flex-col gap-3">
  <p data-dukafy-visible-when="form.hasError:isTrue" data-dukafy-bind-text="form.error"
     class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"></p>
  <input type="email" name="email" required class="rounded border px-3 py-2">
  <input type="password" name="password" required class="rounded border px-3 py-2">
  <button type="submit" data-dukafy-action="account.login" class="rounded bg-black px-4 py-2 text-white">Sign in</button>
</form>
Verbs: account.login · account.register · account.logout · cart.createOrder (checkout) · payment.initiate
form fields: hasError · error · message · signedIn · email · name
Wrap a form in data-dukafy-region="form" or its errors have nowhere to render.

CMS TABLES
Loop rows from a merchant table (slug from list_data_tables):
<div data-dukafy-loop="data/team">
  <article>
    <p data-dukafy-bind-text="currentEntry.name"></p>
  </article>
</div>
Connect a form so it writes rows into that table:
<form data-dukafy-form-mode="cms" data-dukafy-form-id="contact" data-dukafy-target-table="team">
  <input name="name" required>
  <button type="submit">Send</button>
</form>
A plain <form> is custom and does not save CMS rows. Input name must match a column id.

SHEETS AND MODALS
Mark any container as an overlay; it is hidden until something opens it.
<div data-dukafy-overlay="sheet-right" class="ml-auto h-full w-full max-w-md bg-white p-6">
  <button data-dukafy-action="overlay.close" class="ml-auto block text-2xl">&times;</button>
  … contents …
</div>
Variants: modal · sheet-left · sheet-right · sheet-bottom
Open it from ANY element — a button, a div, an image:
  <button data-dukafy-action="overlay.open" data-dukafy-action-target="<uid of the overlay>">Cart</button>
A close button inside the overlay needs no target.
A cart drawer is an overlay whose contents are a cart region:
  <div data-dukafy-overlay="sheet-right" data-dukafy-region="cart" class="…">…cart.items loop, totals…</div>
When you create an overlay AND its trigger in one reply, insert the overlay first,
then reference the uid the merchant will see; if you cannot know it yet, say so and
ask them to click the trigger element so you can wire it.

PAGE STRUCTURE
Start pages with <header> and end with <footer>. When editing a page that already
has them, LEAVE THEM ALONE — never recreate a header or footer that exists.
If the site has saved components (listed below when it does), reuse one instead of
rebuilding it: <div data-dukafy-component="<component-id>"></div>

CONDITIONS
data-dukafy-visible-when="<source>.<field>:<operator>[:value]"
operators: isTrue · isFalse · isEmpty · isNotEmpty · equals:VALUE · notEquals:VALUE · greaterThan:N · lessThan:N
sources: currentEntry · parentEntry · cart · form · payment
A false condition renders nothing at all — no empty box left behind.`


/**
 * The `<body>` element and its contents, dropping the document shell.
 *
 * The body TAG is kept rather than just its children: it is the page's root
 * node, and its classes are editable like any other node's. Falls back to the
 * whole string if the shape is ever unexpected — an over-long prompt is a
 * lesser failure than an empty one.
 */
function bodyOnly(html: string): string {
  const open = html.search(/<body\b/i)
  const close = html.lastIndexOf('</body>')
  if (open === -1 || close === -1 || close < open) return html
  return html.slice(open, close + '</body>'.length)
}

/** The current document as annotated HTML, plus what the model may insert into. */
export function buildAiContext(state: EditorStore): string {
  const site = state.site
  const page = site?.pages.find((candidate) => candidate.id === state.activePageId)
  if (!site || !page) return 'The editor has no page open.'

  let html = ''
  try {
    // `annotateNodeIds` stamps `uid="<nodeId>"` on each node's outermost
    // element — the same read surface the previous agent targeted nodes
    // through, so the model reads and writes at one level.
    html = publishPage(page, site, registry, { annotateNodeIds: true }).html
  } catch {
    // A half-built document mid-edit must not break the chat; the model can
    // still insert at the root without seeing the tree.
    return `Page "${page.title}" is open, but its current markup could not be read.`
  }

  // Only the body is worth sending. `publishPage` returns a whole document —
  // doctype, CSP meta, and the full reset stylesheet — which is ~900 characters
  // of boilerplate that is byte-identical every turn, costs tokens on every
  // message, and invites the model to try editing a <style> block it must
  // never touch.
  const markup = bodyOnly(html)
  const truncated = markup.length > MAX_DOCUMENT_CHARS
  const body = truncated ? `${markup.slice(0, MAX_DOCUMENT_CHARS)}\n<!-- …truncated… -->` : markup

  const selected = state.selectedNodeId ? `\nThe merchant has selected uid="${state.selectedNodeId}".` : ''

  // Saved components, so "reuse the header" is a reference the model can
  // actually write rather than a rebuild. Named explicitly when there are none,
  // because otherwise a model told components exist will invent an id.
  const components = site.visualComponents ?? []
  const componentList = components.length > 0
    ? `\n\nSaved components you can reuse with data-dukafy-component:\n${
        components.map((component) => `  ${component.id} — ${component.name}`).join('\n')}`
    : '\n\nThis site has no saved components yet, so build sections inline.'

  return `Current page "${page.title}" (root uid="${page.rootNodeId}"):\n\n${body}${selected}${designDigest(site)}${componentList}`
}

/**
 * Compact token list so Assist binds text-primary instead of inventing indigo.
 * Missing tokens is valid — the DESIGN rules then fall back to black/white.
 */
function designDigest(site: { settings?: unknown }): string {
  const settings = asRecord(site.settings)
  const framework = asRecord(settings?.framework)
  const colors = asRecord(framework?.colors)
  const tokens = Array.isArray(colors?.tokens) ? colors.tokens : []
  const colorLines = tokens.slice(0, 6).flatMap((row) => {
    const token = asRecord(row)
    const slug = typeof token?.slug === 'string' ? token.slug.trim() : ''
    if (!slug) return []
    const value = typeof token?.lightValue === 'string'
      ? token.lightValue
      : typeof token?.value === 'string' ? token.value : ''
    return [`  ${slug}${value ? ` ${value}` : ''} → text-${slug} bg-${slug}`]
  })
  const fonts = asRecord(settings?.fonts)
  const fontTokens = Array.isArray(fonts?.tokens) ? fonts.tokens : []
  const fontLines = fontTokens.slice(0, 3).flatMap((row) => {
    const token = asRecord(row)
    const variable = typeof token?.variable === 'string' ? token.variable : typeof token?.class === 'string' ? token.class : ''
    const family = typeof token?.family === 'string' ? token.family : ''
    if (!variable) return []
    return [`  ${variable}${family ? ` → ${family}` : ''}`]
  })
  if (colorLines.length === 0 && fontLines.length === 0) {
    return '\n\nNo site color/font tokens yet. Use white canvas, black ink, gray body, black buttons.'
  }
  return [
    '\n\nSITE TOKENS — bind these instead of inventing colors:',
    colorLines.length ? `Colors:\n${colorLines.join('\n')}` : '',
    fontLines.length ? `Fonts:\n${fontLines.join('\n')}` : '',
  ].filter(Boolean).join('\n')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}
