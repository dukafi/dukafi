# The model behind the editor's AI chat.
#
# Reuses plugin settings for the API key (write-only over HTTP) rather than a
# new table. It is not a merchant plugin: `hidden` keeps it off Dashboard →
# Plugins and off MCP `list_plugins`. Configure it from the AI panel.
#
# ── Two provider kinds ───────────────────────────────────────────────────────
# Chat-completions: `base_url` + `model` + `api_key` against the OpenAI
# `/chat/completions` wire. That single path reaches OpenAI, OpenRouter, Groq,
# DeepSeek, Together, LM Studio and a local Ollama.
#
# Dukafi AI: `provider=dukafi` plus a minted MCP token. The harness is a
# separate process. Switching to it must not wipe the BYOK key.
#
# `api_key` is genuinely optional: a local Ollama wants no auth. That is why
# nothing here calls `Settings#configured?`, which requires EVERY declared
# setting to be non-empty and would therefore report a working local setup as
# unconfigured. `AiChat.configured?` asks the narrower, true question.
Dukafi::Plugins.register("ai") do |p|
  p.name "AI assistant"
  p.version "1.0.0"
  p.hidden true
  p.setting :provider, label: "Provider kind (ollama, groq, dukafi, …)"
  p.setting :base_url, label: "API base URL (e.g. https://api.openai.com/v1)"
  p.setting :model, label: "Model (e.g. gpt-4o-mini, or qwen2.5-coder for Ollama)"
  p.secret :api_key, label: "API key (leave blank for a local model)"
  p.setting :harness_url, label: "Dukafi AI harness URL (blank = DUKAFI_AI_URL)"
  p.secret :harness_mcp_token, label: "Minted MCP token for the harness"
  p.setting :harness_token_id, label: "Minted MCP token id"
end
