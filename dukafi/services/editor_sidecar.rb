require "json"
require "net/http"
require "socket"
require "timeout"
require "uri"

# Talking to the edit sidecar.
#
# The sidecar owns `importHtml` — the TypeScript that turns authored HTML into
# nodes — because Ruby has no equivalent and writing one would mean two parsers
# that must agree forever. Ruby stays the owner of the DATA: it reads the
# document, sends it over, and persists whatever comes back. The sidecar holds
# nothing between requests and can restart at any moment.
#
# In production the sidecar listens on a Unix socket, not a second TCP port —
# platforms that auto-detect listening ports would otherwise have two to pick
# from. Local `bin/dev` still uses loopback HTTP (`http://127.0.0.1:9293`).
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
    response = http("/health") { |client, request| client.request(request) }
    response.is_a?(Net::HTTPSuccess)
  rescue StandardError
    false
  end

  def self.post(path, payload)
    http(path, method: Net::HTTP::Post) do |client, request|
      request["content-type"] = "application/json"
      request["authorization"] = "Bearer #{token}"
      request.body = JSON.generate(payload)
      client.request(request)
    end
  rescue StandardError => e
    warn "[sidecar] #{path} failed: #{e.class}: #{e.message}"
    nil
  end

  def self.http(path, method: Net::HTTP::Get)
    if (path_to_socket = socket_path)
      request = method.new(path)
      unix_client(path_to_socket).start { |client| yield(client, request) }
    else
      uri = URI.join(base_url, path)
      request = method.new(uri)
      Net::HTTP.start(uri.host, uri.port,
                      use_ssl: uri.scheme == "https",
                      open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |client|
        yield(client, request)
      end
    end
  end

  def self.socket_path
    explicit = ENV["DUKAFI_SIDECAR_SOCKET"].to_s
    return explicit unless explicit.empty?

    uri = URI.parse(base_url)
    return uri.path if uri.scheme == "unix" && !uri.path.to_s.empty?

    nil
  rescue URI::InvalidURIError
    nil
  end

  def self.unix_client(path_to_socket)
    client = UnixHTTP.new(path_to_socket)
    client.open_timeout = OPEN_TIMEOUT
    client.read_timeout = READ_TIMEOUT
    client
  end

  def self.parse(body)
    JSON.parse(body.to_s)
  rescue JSON::ParserError
    nil
  end

  def self.failure(reason) = Result.new(document: nil, style_rules: nil, applied: 0, reason: reason)

  # Net::HTTP has no Unix-socket transport. `Net::HTTP.new` is a custom
  # constructor (address, port, …), so this class overrides `.new` rather than
  # `initialize` — otherwise `UnixHTTP.new(path)` would be parsed as a host.
  class UnixHTTP < Net::HTTP
    def self.new(socket_path)
      super("localhost", 80).tap { |http| http.instance_variable_set(:@socket_path, socket_path) }
    end

    def connect
      Timeout.timeout(@open_timeout, Net::OpenTimeout) do
        @socket = Net::BufferedIO.new(
          UNIXSocket.new(@socket_path),
          read_timeout: @read_timeout,
          write_timeout: @write_timeout,
          continue_timeout: @continue_timeout,
          debug_output: @debug_output,
        )
      end
    end
    private :connect
  end

  private_class_method :post, :http, :socket_path, :unix_client, :parse, :failure
end
