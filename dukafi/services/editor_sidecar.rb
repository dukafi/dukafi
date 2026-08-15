require "json"
require "net/http"
require "uri"

# Talking to the edit sidecar.
#
# The sidecar owns `importHtml` — the TypeScript that turns authored HTML into
# nodes — because Ruby has no equivalent and writing one would mean two parsers
# that must agree forever. Ruby stays the owner of the DATA: it reads the
# document, sends it over, and persists whatever comes back. The sidecar holds
# nothing between requests and can restart at any moment.
#
# Never raises into a caller. A sidecar that is down is an ordinary condition —
# reads still work without it — so failures come back as a reason code the MCP
# layer turns into a message the model can act on.
class EditorSidecar
  Result = Data.define(:document, :style_rules, :applied, :reason) do
    def ok? = reason.nil?
  end

  DEFAULT_URL = "http://127.0.0.1:9293".freeze
  OPEN_TIMEOUT = 2
  # Importing a large fragment is CPU work in another process; generous enough
  # for a big page, short enough that a wedged sidecar does not hold an MCP
  # request open indefinitely.
  READ_TIMEOUT = 30

  def self.base_url = ENV.fetch("DUKAFI_SIDECAR_URL", DEFAULT_URL)
  def self.token = ENV.fetch("DUKAFI_SIDECAR_TOKEN", "")

  def self.configured? = !token.empty?

  def self.call(document:, style_rules:, edits:)
    return failure("not_configured") unless configured?

    response = post("/apply-edits", {
      "document" => document, "styleRules" => style_rules, "edits" => edits,
    })
    return failure("unreachable") if response.nil?

    body = parse(response.body)
    return failure(body&.fetch("error", nil) || "sidecar_error") unless response.is_a?(Net::HTTPSuccess)
    return failure("malformed_response") unless body.is_a?(Hash) && body["document"].is_a?(Hash)

    Result.new(
      document: body.fetch("document"),
      style_rules: body["styleRules"].is_a?(Hash) ? body.fetch("styleRules") : style_rules,
      applied: body.fetch("applied", 0).to_i,
      reason: nil,
    )
  end

  def self.healthy?
    uri = URI.join(base_url, "/health")
    response = http(uri) { |client, request| client.request(request) }
    response.is_a?(Net::HTTPSuccess)
  rescue StandardError
    false
  end

  def self.post(path, payload)
    uri = URI.join(base_url, path)
    http(uri, method: Net::HTTP::Post) do |client, request|
      request["content-type"] = "application/json"
      request["authorization"] = "Bearer #{token}"
      request.body = JSON.generate(payload)
      client.request(request)
    end
  rescue StandardError => e
    warn "[sidecar] #{path} failed: #{e.class}: #{e.message}"
    nil
  end

  def self.http(uri, method: Net::HTTP::Get)
    Net::HTTP.start(uri.host, uri.port,
                    use_ssl: uri.scheme == "https",
                    open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |client|
      yield(client, method.new(uri))
    end
  end

  def self.parse(body)
    JSON.parse(body.to_s)
  rescue JSON::ParserError
    nil
  end

  def self.failure(reason) = Result.new(document: nil, style_rules: nil, applied: 0, reason: reason)

  private_class_method :post, :http, :parse, :failure
end
