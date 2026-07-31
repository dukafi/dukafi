# Tailwind CSS

Dukafy includes Tailwind CSS 4 as a publish-time compiler. Tailwind is not
loaded from a CDN and no Tailwind JavaScript runs in the storefront.

## Used utilities only

On publish, Dukafy renders every public page, extracts tokens from actual
`class` attributes, and invokes the pinned standalone Tailwind compiler once.
The resulting utility CSS is merged into the normal content-hashed site bundle.
Text content and unused utilities are not provided to Tailwind, so they cannot
inflate the output.

Tailwind class names can be used as class-rule names in the visual editor, for
example `flex`, `grid`, `p-4`, `md:grid-cols-2`, or `bg-[#316ff6]`. Classes used
on any published page are available across that published site version.

## Compiler installation

`./bin/dev` installs the pinned standalone compiler on first run and verifies
its SHA-256 checksum. The executable is stored at
`dukafy/vendor/tailwindcss` and is intentionally ignored by Git.

The bundled installer currently targets Linux x86-64. On another platform,
install Tailwind CSS 4.3.0's standalone executable and set `TAILWINDCSS_BIN` to
its absolute path. Production images should run `scripts/install_tailwind.rb`
during their image build.
