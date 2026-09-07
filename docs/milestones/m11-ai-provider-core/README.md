# M11 — AI provider core: driver registry, connections, capabilities

Scope: rebuild the AI layer in `dukafi/` so any merchant-supplied provider works as a
first-class citizen — multiple named connections, a driver per wire format, a typed
capability model resolved server-side — and so that having **no** AI configured leaves the
product fully usable. This milestone is chat + infrastructure; image generation builds on
it in M12. Launch-blocking.

TL;DR: replace the single-provider `ai` plugin-settings row with an `ai_connections`
table, split `dukafi/services/ai_chat.rb` into a driver registry
(`dukafi/services/ai/drivers/*`) with one shared request loop, add a capability struct
that fails closed, and rework the admin API + editor settings UI around named
connections with per-task defaults. The Dukafi AI harness stays as one optional provider
kind and is not extended.

---

## Current state (verified in-tree)

- `dukafi/services/ai_chat.rb` (376 lines): one proxy handling two wire shapes —
  OpenAI `/chat/completions` for everything, plus an Anthropic `/messages` path detected
  from host `api.anthropic.com` (`x-api-key`, top-level `system`, `max_tokens: 8192`).
  Plain `http://` allowed only for loopback. `list_models` hits `{base}/models`.
  Usage recorded by `AiShadowMeter`.
- `plugins-available/ai/plugin.rb` (30 lines, `hidden true`): pure settings storage —
  `provider`, `base_url`, `model`, secret `api_key`, plus harness fields. One row = one
  active provider, no fallback, no per-task models.
- `dukafi/services/dukafi_ai.rb` + `dukafi_ai_client.rb`: the harness provider kind
  (`provider=dukafi`). Out of scope; must keep working untouched.
- Editor: `dukafi-editor/src/admin/pages/site/panels/AiPanel/AiSettingsPopover.tsx`
  hardcodes the picker list `dukafi, ollama, lmstudio, anthropic, openrouter, openai, groq`.
- Routes: `POST /admin/api/cms/ai/chat`, `GET|PUT .../ai/config`,
  `POST .../ai/models`, `POST .../ai/run`, `POST .../ai/dukafi/connect|disconnect`
  in `dukafi/routes/admin_api.rb`.
- Specs: `dukafi/spec/routes/ai_api_spec.rb`, `dukafi_ai_api_spec.rb`.

Reference implementation to copy the *shape* (not the code) from:
`../instatic-inspo/server/ai/drivers/` — `AiProvider` interface (`types.ts`),
registry (`index.ts`), `ProviderAdapter` pure-function split (`http/toolLoop.ts:91`),
fail-closed capability cache (`modelCapabilities.ts`).

## Design

### Providers (driver ids)

| id | Wire | Auth | Model list | Covers |
|---|---|---|---|---|
| `anthropic` | `POST {base}/v1/messages` | api_key | `GET /v1/models?limit=1000` | Claude |
| `openai` | `POST {base}/v1/chat/completions` | api_key | `GET /v1/models` (filtered to chat families) | OpenAI |
| `openrouter` | OpenAI wire at `https://openrouter.ai/api/v1` | api_key | `GET /api/v1/models` (rich: pricing, modalities, context) | 400+ models |
| `ollama` | OpenAI wire at `{base_url}/v1` | base_url (+optional bearer) | `GET {base}/api/tags` | local models |
| `openai_compatible` | OpenAI wire at `{base_url}` | base_url + optional api_key | `GET {base}/v1/models` | Groq, DeepSeek, Together, Mistral, Fireworks, LM Studio, vLLM |
| `dukafi` | existing harness path | minted PAT | n/a | optional, unchanged |

Three wire formats total (Anthropic, OpenAI-chat, harness); five BYOK drivers share two of
them. A driver is a plain Ruby object (module or frozen class instance) registered in a
hash — mirror `plugins/registry.rb` style, not a gem, no vendor SDKs. **Rule: direct
HTTP only; adding an `openai`/`anthropic` gem to the Gemfile is a review-rejection.**

### Driver interface

```ruby
# dukafi/services/ai/drivers.rb
module Dukafi::Ai::Drivers
  def self.resolve(provider_id) = DRIVERS.fetch(provider_id) { raise UnknownProvider }

  # Every driver responds to:
  #   id            -> String
  #   label         -> String
  #   auth_mode     -> :api_key | :base_url
  #   capabilities(model_id)                  -> Capabilities (static, conservative)
  #   resolve_capabilities(connection, model_id) -> Capabilities | nil (optional live lookup)
  #   list_models(connection)                 -> [{id:, label:, capabilities: {...}}]
  #   chat(connection:, model:, messages:, tools: [], stream: ->(event){}) -> Result
end
```

```ruby
# dukafi/services/ai/capabilities.rb
Capabilities = Data.define(:tool_calling, :vision_input, :image_generation, :streaming)
# Unknown/unresolvable => false for everything except streaming. The SERVER gates on
# these before spending money; the editor picker only displays them.
```

Notes carried over from the reference implementation:

- `resolve_capabilities` exists because static flags are not authoritative for
  `ollama`/`openai_compatible`/`openrouter`. Cache results 5 minutes in-process, keyed by
  (connection id, model id, updated_at of the connection); a failed lookup returns the
  static fallback with `vision_input: false` and `image_generation: false` (**fail
  closed**).
- For `openrouter`, parse `architecture.output_modalities` from `GET /api/v1/models` to
  set `image_generation` — this is how M12 discovers image-capable models with zero
  configuration.
- One shared request loop (`dukafi/services/ai/loop.rb`) owns Net::HTTP, SSE parsing,
  timeouts, abort, and error normalization. Drivers contribute only:
  `endpoint(connection)`, `headers(connection)`, `map_messages(messages)`,
  `request_body(mapped, opts)`, `parse_event(sse_frame) -> canonical events`.
  Port the existing logic out of `ai_chat.rb`; behaviour for the two existing wires must
  not change (the existing `ai_api_spec.rb` cases keep passing).

### Connections

New table (migration 044+):

```
ai_connections
  id            integer pk
  name          text not null              -- merchant label, e.g. "Groq fast"
  provider      text not null              -- driver id
  base_url      text                       -- required when auth_mode is :base_url
  api_key       text                       -- encrypted, write-only over HTTP (isSet only)
  chat_model    text                       -- default model for chat on this connection
  image_model   text                       -- default model for image gen (M12)
  priority      integer not null default 100  -- fallback order, lower first
  disabled      boolean not null default false
  created_at / updated_at
```

- Secrets: encrypt `api_key` with AES-256-GCM. Add `dukafi/services/secret_box.rb`:
  key = `ENV["DUKAFI_SECRET_KEY"]` (base64, 32 bytes) when set, else HKDF-derived from
  `SESSION_SECRET` (documented trade-off: rotating `SESSION_SECRET` then requires
  re-entering keys). Store a 8-byte key fingerprint next to the ciphertext; on mismatch
  raise a 409 "re-enter this API key" — never a silent decrypt failure.
  This module is also the home for future secret needs (M14 SMTP password can stay in
  plugin settings, unchanged).
- Per-task defaults: a `ai_defaults` table or two columns on `site_state` —
  decision: **table** `ai_defaults(task text pk check in ('chat','image'), connection_id fk on delete restrict, model text)`.
  `on delete restrict` so the connection a task depends on cannot be deleted out from
  under it.
- Back-compat migration: if the old `ai` plugin settings row is configured, migrate it
  into one `ai_connections` row + `chat` default on first boot
  (`scripts/migrate.rb`-adjacent data migration inside the schema migration). The
  harness fields (`harness_url`, tokens) stay in plugin settings; `provider=dukafi`
  becomes a connection row with no api_key.

### HTTP surface (rework of `routes/admin_api.rb` AI section)

```
GET    /admin/api/cms/ai/connections            list (api_key as isSet only)
POST   /admin/api/cms/ai/connections            create
PATCH  /admin/api/cms/ai/connections/:id        update (blank api_key = keep)
DELETE /admin/api/cms/ai/connections/:id        409 if a default depends on it
POST   /admin/api/cms/ai/connections/:id/models list models via driver
POST   /admin/api/cms/ai/connections/:id/test   1-token ping; returns ok/error verbatim
GET|PUT /admin/api/cms/ai/defaults              {chat: {connectionId, model}, image: {...}}
POST   /admin/api/cms/ai/chat                   as today, but resolves connection+model
                                                from defaults (overridable per request)
```

Gates in the chat handler, in order, before any provider call:
no chat default configured → 409 with a "set up AI" payload the editor renders as a CTA
(not an error toast); requested images attached but `vision_input` false → 422 with the
exact message "The selected model does not support image input. Choose a vision-capable
model."; tools requested but `tool_calling` false → 422 similarly.

### Editor UI

- Replace `AiSettingsPopover.tsx` single-provider form with a **Connections** manager:
  list, add (provider picker → auth fields per `auth_mode`), test button, per-task
  default pickers. Keep the same visual language as the plugin settings forms.
- Zero-state: when no connection exists, the AI panel shows a setup card ("Bring your own
  key — works with OpenAI, Anthropic, OpenRouter, Groq, Ollama…") and **nothing else in
  the product references AI**. Grep the editor for assumptions that AI exists; the panel
  must be the only surface.
- MCP: `list_plugins` already hides the `ai` plugin (`hidden true`); add read-only MCP
  tool `get_ai_status` returning `{configured: bool, tasks: {chat: bool, image: bool}}`
  so external agents can detect capability without seeing secrets.

## Tasks

1. **`SecretBox`** — `dukafi/services/secret_box.rb` + spec. Encrypt/decrypt with
   fingerprint; env key with SESSION_SECRET fallback. AC: round-trip; wrong-key raises
   `SecretBox::KeyMismatch`; ciphertext differs per call (random IV).
2. **Migration 044 `ai_connections` + `ai_defaults`** including data migration from the
   `ai` plugin settings row. AC: fresh boot and upgraded boot both leave a working config;
   sqlite + postgres.
3. **Capabilities + drivers skeleton** — `dukafi/services/ai/capabilities.rb`,
   `drivers.rb`, `loop.rb`; port Anthropic + OpenAI-chat wires out of `ai_chat.rb` with
   golden request/response specs copied from `ai_api_spec.rb`. AC: old specs green
   against the new path.
4. **Per-driver model listing + live capability resolution** (`openrouter` modalities,
   `ollama` `/api/show`, `openai` family filter) with the 5-minute fail-closed cache.
   AC: cache spec proves failure ⇒ vision/image false; success cached; connection edit
   busts cache.
5. **Connections HTTP surface** + gates. AC: route specs for CRUD, isSet masking,
   delete-restrict, 409 no-default, both 422 gates.
6. **Editor connections UI** + zero-state card. AC: `bun run build` clean; manual flow
   documented in the milestone's test notes.
7. **Back-compat + harness regression** — `provider=dukafi` connect/disconnect/run flows
   unchanged (`dukafi_ai_api_spec.rb` green, untouched).
8. **Docs** — new `docs/src/content/docs/en/ai-providers.mdx` on the docs site
   (providers table, BYOK setup, capability gates); update `plugins.mdx` cross-reference.

## Out of scope

Image generation (M12), tool-calling agent loop in core (post-1.0 parking lot — chat
assist today does not execute tools server-side), prompt caching, usage-based billing
(AiShadowMeter stays as-is), extending the harness.

## Related

- `docs/LAUNCH-PLAN.md` D1–D3
- `../instatic-inspo/server/ai/drivers/types.ts`, `modelCapabilities.ts` — the pattern source
- M12 consumes `image_generation` capability + `image` task default
