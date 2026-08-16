# The model behind the editor's AI chat.
#
# Reuses plugin settings for the API key (write-only over HTTP) rather than a
# new table. It is not a merchant plugin: `hidden` keeps it off Dashboard →
# Plugins and off MCP `list_plugins`. Configure it from the AI panel.
#
# ── One provider shape, deliberately ─────────────────────────────────────────
# `base_url` + `model` + `api_key` against the OpenAI `/chat/completions` wire
# protocol. That single code path reaches OpenAI, OpenRouter, Groq, DeepSeek,
# Together, LM Studio and a local Ollama — Instatic needed five drivers to cover
# the same ground, and its generic one (`openaiCompatible.ts`) was 110 lines
# while the rest were provider-specific noise.
#
# `api_key` is genuinely optional: a local Ollama wants no auth. That is why
# nothing here calls `Settings#configured?`, which requires EVERY declared
# setting to be non-empty and would therefore report a working local setup as
# unconfigured. `AiChat.configured?` asks the narrower, true question.
Dukafi::Plugins.register("ai") do |p|
  p.name "AI assistant"
  p.version "1.0.0"
  p.hidden true
  p.setting :base_url, label: "API base URL (e.g. https://api.openai.com/v1)"
  p.setting :model, label: "Model (e.g. gpt-4o-mini, or qwen2.5-coder for Ollama)"
  p.secret :api_key, label: "API key (leave blank for a local model)"
end
