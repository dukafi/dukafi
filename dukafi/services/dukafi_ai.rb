# Dukafi AI as a provider kind — not another chat-completions URL.
#
# Connect mints a store MCP token and keeps the plaintext here, write-only.
# The browser never sees it. The harness receives it per run as a header, never
# as a model argument.
module DukafiAi
  CONNECT_NAME = "Dukafi AI".freeze
  PROVIDER = "dukafi".freeze

  module_function

  def settings = AiChat.settings

  def provider
    stored = settings[:provider].to_s.strip
    return stored unless stored.empty?

    infer_provider(settings[:base_url].to_s)
  end

  def dukafi? = provider == PROVIDER

  def connected?
    !settings[:harness_mcp_token].to_s.strip.empty?
  end

  def harness_url
    custom = settings[:harness_url].to_s.strip
    return custom.sub(%r{/\z}, "") unless custom.empty?

    ENV["DUKAFI_AI_URL"].to_s.strip.sub(%r{/\z}, "")
  end

  def configured_harness? = !harness_url.empty?

  def mcp_token = settings[:harness_mcp_token].to_s.strip

  def config_payload
    {
      baseUrl: settings[:base_url].to_s,
      model: settings[:model].to_s,
      hasKey: !settings[:api_key].to_s.strip.empty?,
      provider: provider,
      harnessUrl: settings[:harness_url].to_s,
      connected: connected?,
    }
  end

  def save_config!(params)
    incoming = params.is_a?(Hash) ? params : {}
    next_provider = incoming["provider"].to_s.strip
    settings[:provider] = next_provider unless next_provider.empty?

    if incoming.key?("harnessUrl")
      settings[:harness_url] = incoming["harnessUrl"].to_s.strip
    end

    return if next_provider == PROVIDER

    settings[:base_url] = incoming["baseUrl"].to_s.strip if incoming.key?("baseUrl")
    settings[:model] = incoming["model"].to_s.strip if incoming.key?("model")
    key = incoming["apiKey"].to_s
    settings[:api_key] = "" if incoming["clearKey"] == true
    settings[:api_key] = key.strip unless key.strip.empty?
  end

  def connect!
    disconnect! if connected?
    record, plaintext = PersonalAccessToken.issue!(name: CONNECT_NAME)
    settings[:harness_mcp_token] = plaintext
    settings[:harness_token_id] = record.id.to_s
    settings[:provider] = PROVIDER
    { connected: true }
  end

  def disconnect!
    id = settings[:harness_token_id].to_s
    PersonalAccessToken[id.to_i]&.revoke! unless id.empty?
    settings[:harness_mcp_token] = ""
    settings[:harness_token_id] = ""
    { connected: false }
  end

  def infer_provider(base_url)
    return "" if base_url.empty?

    {
      "http://localhost:11434/v1" => "ollama",
      "http://localhost:1234/v1" => "lmstudio",
      "https://api.anthropic.com/v1" => "anthropic",
      "https://openrouter.ai/api/v1" => "openrouter",
      "https://api.openai.com/v1" => "openai",
      "https://api.groq.com/openai/v1" => "groq",
    }.fetch(base_url, "custom")
  end
end
