# M12 — Image generation with cross-provider fallback

Scope: give core the ability to generate images from any capable provider the merchant has
connected, with an ordered fallback chain across providers, a plugin seam for generators
core doesn't speak natively, and results landing in the media library with provenance.
Depends on M11 (connections, capabilities, drivers). Launch-blocking.

TL;DR: build `Dukafi::Ai::Images` — a service that walks image-capable connections in
priority order, speaks two wire formats natively (`images-api` and `chat-modalities`),
accepts additional generators through a new `p.image_provider` plugin seam, and returns
either a `MediaAsset` or a typed error the editor turns into "pick from library / upload
instead". Generation is always an explicit user click; nothing generates automatically.

---

## Current state (verified in-tree)

- **No image generation exists anywhere in `core/`** — grep for
  `images/generations|generate_image|dall-e|gpt-image` returns nothing outside these docs.
- The only prior art is the v2 harness (`../ai/src/generateImage.ts`): OpenRouter-only,
  hardcoded base URL, 8-model allowlist that throws on anything else, and on failure the
  image slot silently gets nothing. **That design is what this milestone must NOT
  reproduce** — no hardcoded provider, no model allowlist, no silent failure.
- Media pipeline that generated images must reuse: upload path producing `MediaAsset`
  rows + WebP variants via libvips (see `dukafi/services/` media services,
  `Paths.uploads_root`), served from `/uploads`.
- MCP media tool `upload_media` exists (`dukafi/services/mcp_*.rb`).

## Design

### The service

```ruby
# dukafi/services/ai/images.rb
module Dukafi::Ai::Images
  Request = Data.define(:prompt, :size, :count, :connection_id, :model) # last two optional
  Success = Data.define(:media_asset, :provider, :connection_id, :model)
  Failure = Data.define(:attempts) # [{connection:, model:, wire:, error:}, ...]

  # Walks the chain (below). Returns Success or Failure. NEVER raises for provider
  # errors; raises only for programmer errors (bad size string etc).
  def self.generate(request, actor:)
end
```

### Wire formats (core-native)

1. **`images-api`** — `POST {base}/v1/images/generations`
   (OpenAI, OpenRouter, Together, xAI, many compatibles).
   Body: `{model:, prompt:, n:, size:, response_format: "b64_json"}`; accept both
   `b64_json` and `url` responses (fetch the URL server-side with a 20 MB cap and
   content-type check).
2. **`chat-modalities`** — `POST {base}/v1/chat/completions` with
   `modalities: ["image","text"]` (OpenRouter's Gemini-image/flux routing and
   compatibles). Extract images from `choices[].message.images[]` (data URLs) with a
   fallback scan of content parts.

Which wire a (connection, model) pair uses:

- `openrouter`: try `images-api` first, fall through to `chat-modalities` on any non-OK —
  the same endpoint-level fallback the harness proved out, now provider-generic.
- `openai` / `openai_compatible`: `images-api` only.
- `anthropic`, `ollama`: no native image generation → `image_generation: false` in the
  M11 capability struct; they simply never appear in the chain.

### Plugin seam — `p.image_provider`

Mirror the payments seam exactly (registration style, discovery, settings):

```ruby
# in a plugin.rb
Dukafi::Plugins.register("replicate") do |p|
  p.secret :api_token, label: "Replicate API token"
  p.setting :model, label: "Model", default: "black-forest-labs/flux-schnell"
  p.image_provider "replicate", Replicate::Provider, label: "Replicate"
end

# Provider contract (dukafi/plugins/registry.rb, next to payment_provider):
#   generate(prompt:, size:, count:, config:) -> GenerateResult
#   GenerateResult = Data.define(:images, :error)   # images: [{bytes:, mime:}]
```

Discovery: `Plugins.configured_image_providers` filtered by `settings.configured?`,
same rule as payments — "an unconfigured one is left out rather than shown and then
refused". Plugin providers slot into the fallback chain after connections, ordered by
plugin id (deterministic).

This seam is the "100% flexibility" answer: Replicate, fal.ai, Stability, a local
ComfyUI bridge, stock-photo pseudo-generators — all installable without touching core.
Ship no such plugin in 1.0; document the contract in `plugin-api.md` and the docs site.

### The fallback chain (D5)

```
1. Explicit request (connection_id/model set)      -> that one only, no chain
2. `image` task default (ai_defaults)              -> first
3. Other enabled connections with image_generation -> by priority ASC, id ASC
4. Configured plugin image providers               -> by plugin id ASC
Within each candidate: wire-level fallback as defined above.
```

Rules:

- Each attempt is appended to `Failure#attempts` with the sanitized error (never the
  API key, never raw response bodies over 1 KB).
- Per-request budget: max 4 candidate attempts and 60s wall clock, whichever first —
  a chain must never hang the editor.
- Log every attempt through a new `ai_image_events` concept? **No** — reuse
  `AiShadowMeter`-style recording: one row per attempt (provider, model, ok, ms,
  error_class) so the dashboard can show "your primary image provider has been failing".
  Table: `ai_usage_events(kind: 'image', ...)`; keep it to one migration shared with
  nothing else.
- Total failure → HTTP 502 from the route with `{error: "generation_failed", attempts:
  [...]}`. The editor shows the attempts list and offers "Choose from library" /
  "Upload" actions. **Never insert a placeholder image.**

### Media library integration (D6)

- Success path calls the existing upload service (same code path as
  `POST /admin/api/cms/media`) so WebP variants, size limits and naming all apply.
- Provenance columns on `media_assets` (migration): `origin` (`upload|import|ai`),
  `origin_meta` JSON (`{prompt:, model:, provider:, connection_id:}`). Media UI shows a
  small "AI" badge + prompt on hover; filter by origin in the media panel.
- Alt text: default to the prompt, truncated at 125 chars, editable immediately.

### Surfaces

- HTTP: `POST /admin/api/cms/ai/images` `{prompt, size?, count?, connectionId?, model?}`
  → `{asset}` or 502 as above. Auth: same admin session as media upload.
- Editor: image module and media panel get a **Generate** tab — prompt box, size preset
  (square/landscape/portrait), generate button with progress, result → insert. Explicit
  click is the consent model; there is no auto-generate anywhere in core.
- MCP: new tool `generate_image` (`dukafi/services/mcp_media.rb` neighborhood) with the
  same request shape, so external agents and the v2 harness can use the merchant's own
  configured providers instead of bringing their own. Returns the media asset id + URL.
  This is also the answer to "if the provider cannot download an image": an external AI
  client that can't produce images itself invokes this tool and Dukafi's chain does it.

## Tasks

1. **Wire clients** — `dukafi/services/ai/images/wire_images_api.rb`,
   `wire_chat_modalities.rb` + specs with canned fixtures (b64, url-fetch, error
   shapes). AC: both wires produce `[{bytes:, mime:}]`; URL fetch enforces size cap +
   https (loopback exempt, matching `ai_chat.rb`'s rule).
2. **Chain orchestrator** — `dukafi/services/ai/images.rb` + spec. AC: default-first
   ordering; explicit request skips chain; budget enforcement; attempts sanitized.
3. **`p.image_provider` seam** in `dukafi/plugins/registry.rb` + `configured_image_providers`
   + spec mirroring `spec/routes/payment_providers_spec.rb`. Update `probe` plugin to
   register a fake image provider for spec coverage.
4. **Migration: `media_assets.origin/origin_meta`** + `ai_usage_events`. AC: sqlite +
   postgres; existing rows default `origin='upload'`.
5. **Route** `POST /admin/api/cms/ai/images` + spec (success, 502 attempts shape,
   unconfigured → 409 pointing at AI settings).
6. **Editor Generate tab** in media panel + image module; origin badge + filter.
   AC: `bun run build` clean.
7. **MCP `generate_image` tool** + spec next to `spec/routes/mcp_plugins_spec.rb`
   pattern. AC: listed in tool index; works over the same chain; documented in
   `docs/src/content/docs/en/mcp.mdx`.
8. **Failure-drill spec** — integration spec proving the chain survives: primary 500s →
   secondary succeeds; all fail → 502 with N attempts; asserts no MediaAsset row leaks
   from failed attempts.
9. **Docs** — extend `ai-providers.mdx` with an "Images" section (chain semantics,
   plugin seam contract); update `dukafi/docs/plugin-api.md` with `image_provider`.

## Out of scope

Automatic generation during AI chat/build flows (v2 harness territory), inpainting/edit,
image-to-image, upscaling, per-day budget caps (parking lot), background removal.

## Related

- `docs/LAUNCH-PLAN.md` D4–D6
- M11 (capabilities, connections, defaults) — hard dependency
- `dukafi/services/payments.rb` — the seam pattern being mirrored
- `../ai/src/generateImage.ts` — prior art and its limitations (do not copy)
