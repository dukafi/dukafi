require "net/http"
require "uri"
require "json"

# Proxy one chat turn to the configured model.
#
# The server holds the key and the browser never sees it. That is the whole
# reason this hop exists — the editor could call a provider directly, but then
# every admin would paste their own key into a page and it would live in browser
# storage. Here it is one store-wide setting, write-only over the API.
#
# Deliberately a DUMB proxy: the editor composes the entire message array,
# including the system prompt. The prompt describes what HTML the model may
# write and which `data-dukafy-*` overlays exist, and that contract is defined
# by `importHtml` on the TypeScript side — keeping the prompt next to the parser
# that enforces it is what stops the two drifting. Ruby's job is to attach the
# credential, bound the request, and never trust the response.
class AiChat
  # `detail` is the provider's own words — its error message, or the network
  # failure that stopped us reaching it.
  #
  # Without it every failure collapsed into "The model could not answer", which
  # is unactionable: a wrong model id, a max_tokens over the model's ceiling, an
  # expired key and a DNS failure all looked identical. The provider already
  # explains itself in the response body; throwing that away was the bug.
  Result = Data.define(:reply, :reason, :detail) do
    def ok? = reason.nil?
  end

  # A remote provider over a slow link needs more than a LAN handshake. Five
  # seconds produced Net::OpenTimeout against api.anthropic.com on an ordinary
  # connection.
  OPEN_TIMEOUT = 15
  # Generation is slow, especially on a local model producing a page of HTML.
  READ_TIMEOUT = 120
  # Listing models is a directory lookup, not a generation — it should fail
  # fast so the picker does not hang on a wrong URL.
  MODELS_TIMEOUT = 8

  # A conversation plus a document snapshot is large but not unbounded. This is
  # a guard against a runaway client, not a product limit.
  MAX_REQUEST_BYTES = 512 * 1024
  MAX_MESSAGES = 40

  ROLES = %w[system user assistant].freeze

  # Anthropic speaks its own protocol, and it is the one provider worth a
  # second code path: it is where Claude lives, and reaching it through
  # OpenRouter means a second account and a margin on every token.
  #
  # Detected from the HOST rather than a new setting, so the merchant still
  # configures exactly three things. Three differences from the OpenAI shape:
  # `x-api-key` instead of a bearer, the system prompt as a TOP-LEVEL field
  # instead of a message, and a required `max_tokens`.
  ANTHROPIC_HOST = "api.anthropic.com".freeze
  ANTHROPIC_VERSION = "2023-06-01".freeze
  # Generous: a reply carries a page of HTML. Anthropic requires the field,
  # unlike OpenAI where it is optional.
  ANTHROPIC_MAX_TOKENS = 8192

  def self.settings = Dukafi::Plugins::Settings.for("ai")

  # `Settings#configured?` is the wrong question: it requires EVERY declared
  # setting to be non-empty, and a local Ollama legitimately has no API key.
  def self.configured?
    !settings[:base_url].to_s.strip.empty? && !settings[:model].to_s.strip.empty?
  end

  def self.call(messages:)
    @last_transport_error = nil
    return failure("not_configured") unless configured?

    clean = sanitize(messages)
    return failure("empty_conversation") if clean.empty?

    uri = endpoint
    return failure("invalid_base_url") unless uri

    payload = JSON.generate(body_for(uri, clean))
    return failure("request_too_large") if payload.bytesize > MAX_REQUEST_BYTES

    response = post(uri, payload)
    return failure("provider_unreachable", @last_transport_error) unless response

    unless response.is_a?(Net::HTTPSuccess)
      # 401/403 from the provider is the one failure a merchant can actually
      # fix, so it keeps its own reason instead of collapsing into a generic
      # provider error.
      code = response.code.to_i
      reason = code == 401 || code == 403 ? "provider_rejected" : "provider_error"
      return failure(reason, provider_detail(code, response.body))
    end

    reply = extract_reply(response.body)
    return failure("empty_reply") if reply.nil? || reply.strip.empty?

    Result.new(reply: reply, reason: nil, detail: nil)
  end

  # What the provider said about its own refusal.
  #
  # Three shapes in the wild, all handled: OpenAI and Anthropic nest the text
  # at `error.message`; Ollama puts a bare string at `error`. An unparseable
  # body falls back to a truncated excerpt, which still beats nothing.
  MAX_DETAIL_CHARS = 400

  def self.provider_detail(code, body)
    text = begin
      parsed = JSON.parse(body.to_s)
      if parsed.is_a?(Hash)
        message = parsed.dig("error", "message") || parsed["error"] || parsed["message"]
        message.is_a?(String) ? message : nil
      end
    rescue JSON::ParserError
      nil
    end
    text ||= body.to_s.strip
    text = text[0, MAX_DETAIL_CHARS]
    text.empty? ? "HTTP #{code}" : "HTTP #{code}: #{text}"
  end
  private_class_method :provider_detail

  # The provider's model catalogue, so the merchant PICKS a model instead of
  # typing an id they have to look up elsewhere.
  #
  # `base_url` / `api_key` override the stored settings, because the popover
  # asks for this list while the merchant is still choosing a provider — before
  # anything has been saved. The key travels browser -> server only, never back.
  #
  # Any failure returns [] rather than raising: an unreachable endpoint should
  # leave the picker empty and let the merchant type a model id by hand, not
  # block the dialog.
  def self.list_models(base_url: nil, api_key: nil)
    base = base_url.to_s.strip
    base = settings[:base_url].to_s.strip if base.empty?
    uri = models_endpoint(base)
    return [] unless uri

    key = api_key.to_s.strip
    key = settings[:api_key].to_s.strip if key.empty?

    request = Net::HTTP::Get.new(uri)
    if anthropic?(uri)
      request["x-api-key"] = key unless key.empty?
      request["anthropic-version"] = ANTHROPIC_VERSION
    elsif !key.empty?
      request["Authorization"] = "Bearer #{key}"
    end
    response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https",
                               open_timeout: OPEN_TIMEOUT, read_timeout: MODELS_TIMEOUT) do |http|
      http.request(request)
    end
    return [] unless response.is_a?(Net::HTTPSuccess)

    parsed = JSON.parse(response.body.to_s)
    Array(parsed.is_a?(Hash) ? parsed["data"] : nil)
      .filter_map { |entry| entry["id"].to_s if entry.is_a?(Hash) && !entry["id"].to_s.empty? }
      .sort
  rescue StandardError
    []
  end

  # `{base_url}/models`, built from the same validated base the chat endpoint
  # uses so the http:// loopback rule applies here too.
  def self.models_endpoint(base)
    trimmed = base.to_s.strip.sub(%r{/+\z}, "").sub(%r{/chat/completions\z}, "").sub(%r{/messages\z}, "")
    return nil if trimmed.empty?

    uri = begin
      URI.parse("#{trimmed}/models")
    rescue URI::InvalidURIError
      nil
    end
    return nil unless uri.is_a?(URI::HTTP)
    return nil if uri.host.to_s.empty?
    return nil if uri.scheme == "http" && !loopback?(uri.host)

    uri
  end
  private_class_method :models_endpoint

  # `{base_url}/chat/completions`, tolerating a trailing slash and a base that
  # already ends in the path.
  def self.anthropic?(uri)
    uri.respond_to?(:host) && uri.host.to_s.downcase == ANTHROPIC_HOST
  end

  def self.endpoint
    base = settings[:base_url].to_s.strip.sub(%r{/+\z}, "")
    return nil if base.empty?

    path = base.include?(ANTHROPIC_HOST) ? "/messages" : "/chat/completions"
    url = base.end_with?(path) ? base : "#{base}#{path}"
    uri = begin
      URI.parse(url)
    rescue URI::InvalidURIError
      nil
    end
    return nil unless uri.is_a?(URI::HTTP) # URI::HTTPS is a subclass
    return nil if uri.host.to_s.empty?
    # Plain HTTP is allowed ONLY for a loopback host. That is what makes a local
    # Ollama work without a certificate, while a remote provider configured over
    # http:// — where the key would cross the network in clear text — is
    # refused rather than silently downgraded.
    return nil if uri.scheme == "http" && !loopback?(uri.host)

    uri
  end

  LOOPBACK_HOSTS = %w[localhost 127.0.0.1 ::1 0.0.0.0].freeze

  def self.loopback?(host)
    LOOPBACK_HOSTS.include?(host.to_s.downcase) || host.to_s.downcase.end_with?(".localhost")
  end
  private_class_method :loopback?

  # Drop anything that is not a well-formed turn. The editor builds these, but
  # a malformed array must not reach the provider as `null` content.
  def self.sanitize(messages)
    return [] unless messages.is_a?(Array)

    messages.filter_map do |message|
      next unless message.is_a?(Hash)

      role = message["role"].to_s
      content = message["content"].to_s
      next unless ROLES.include?(role) && !content.strip.empty?

      { "role" => role, "content" => content }
    end.last(MAX_MESSAGES)
  end
  private_class_method :sanitize

  # Anthropic wants the system prompt lifted OUT of the message list, and a
  # max_tokens it will not default for you.
  def self.body_for(uri, messages)
    model = settings[:model].to_s.strip
    return { "model" => model, "messages" => messages } unless anthropic?(uri)

    system = messages.select { |message| message["role"] == "system" }
                     .map { |message| message["content"] }.join("\n\n")
    turns = messages.reject { |message| message["role"] == "system" }
    body = { "model" => model, "max_tokens" => ANTHROPIC_MAX_TOKENS, "messages" => turns }
    system.empty? ? body : body.merge("system" => system)
  end
  private_class_method :body_for

  def self.auth_headers(uri)
    key = settings[:api_key].to_s.strip
    # Omitted entirely when blank — a local model rejects an empty bearer.
    return {} if key.empty?
    return { "x-api-key" => key, "anthropic-version" => ANTHROPIC_VERSION } if anthropic?(uri)

    { "Authorization" => "Bearer #{key}" }
  end
  private_class_method :auth_headers

  def self.post(uri, payload)
    request = Net::HTTP::Post.new(uri)
    request["Content-Type"] = "application/json"
    auth_headers(uri).each { |name, value| request[name] = value }
    request.body = payload

    Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https",
                    open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |http|
      http.request(request)
    end
  rescue StandardError => e
    # Never interpolate the request: it carries the Authorization header.
    warn "[ai] request failed: #{e.class}: #{e.message}"
    # A timeout and a refused connection are different problems with different
    # fixes; "could not reach the model" hides which one happened.
    @last_transport_error = case e
    when Net::OpenTimeout then "Timed out connecting to #{uri.host} after #{OPEN_TIMEOUT}s."
    when Net::ReadTimeout then "The model did not answer within #{READ_TIMEOUT}s."
    else "#{e.class}: #{e.message}"
    end
    nil
  end
  private_class_method :post

  # Two response shapes: OpenAI's `choices[0].message.content`, and
  # Anthropic's `content[]` block list, of which the text blocks are joined.
  def self.extract_reply(body)
    parsed = JSON.parse(body.to_s)
    return nil unless parsed.is_a?(Hash)

    blocks = parsed["content"]
    if blocks.is_a?(Array)
      return blocks.filter_map { |block| block["text"] if block.is_a?(Hash) && block["type"] == "text" }
                   .join("\n")
    end

    choice = Array(parsed["choices"]).first
    return nil unless choice.is_a?(Hash)

    message = choice["message"]
    message.is_a?(Hash) ? message["content"].to_s : nil
  rescue JSON::ParserError
    nil
  end
  private_class_method :extract_reply

  def self.failure(reason, detail = nil) = Result.new(reply: nil, reason: reason, detail: detail)
  private_class_method :failure
end
