require "net/http"
require "uri"
require "json"

# HTTP proxy from the admin session to a harness run API.
#
# The store injects the minted MCP token and the store MCP URL. The editor
# only sees the SSE activity the harness already produced. Planner logic
# stays in the harness.
module DukafiAiClient
  OPEN_TIMEOUT = 15
  READ_TIMEOUT = 600

  LOOPBACK_HOSTS = %w[localhost 127.0.0.1 ::1 0.0.0.0].freeze

  # Test seam — production never sets this.
  class << self
    attr_accessor :stub_stream
  end

  module_function

  def rack_run(prompt:, slug:, mode:, origin:, attachments: nil)
    error = preflight
    return error if error

    uri = parse_harness_uri
    return json_error(422, "ai_invalid_harness_url", "The harness URL is not usable.") unless uri

    body = Enumerator.new do |yielder|
      post_stream(uri, prompt: prompt, slug: slug, mode: mode, origin: origin, attachments: attachments) do |chunk|
        yielder << chunk
      end
    rescue StandardError => e
      warn "[dukafi-ai] run failed: #{e.class}: #{e.message}"
      yielder << sse("error", { "message" => e.message })
    end

    [200, { "content-type" => "text/event-stream", "cache-control" => "no-cache" }, body]
  end

  def preflight
    unless DukafiAi.dukafi?
      return json_error(409, "ai_not_dukafi", "Dukafi AI is not the selected provider.")
    end
    unless DukafiAi.connected?
      return json_error(409, "ai_not_connected", "Connect Dukafi AI in the assistant settings first.")
    end
    unless DukafiAi.configured_harness?
      return json_error(409, "ai_harness_not_configured",
                        "No harness URL. Set DUKAFI_AI_URL or a custom harness URL.")
    end

    nil
  end

  def parse_harness_uri
    base = DukafiAi.harness_url
    return nil if base.empty?

    url = base.end_with?("/v1/runs") ? base : "#{base}/v1/runs"
    uri = begin
      URI.parse(url)
    rescue URI::InvalidURIError
      nil
    end
    return nil unless uri.is_a?(URI::HTTP)
    return nil if uri.host.to_s.empty?
    return nil if uri.scheme == "http" && !loopback?(uri.host)

    uri
  end

  def post_stream(uri, prompt:, slug:, mode:, origin:, attachments: nil, &block)
    if self.stub_stream
      self.stub_stream.call(uri, prompt: prompt, slug: slug, mode: mode, origin: origin, attachments: attachments, &block)
      return
    end

    request = Net::HTTP::Post.new(uri)
    request["Content-Type"] = "application/json"
    request["Accept"] = "text/event-stream"
    request["X-Mcp-Url"] = "#{origin.to_s.sub(%r{/\z}, "")}/admin/api/mcp"
    request["X-Mcp-Token"] = DukafiAi.mcp_token
    key = ENV["DUKAFI_AI_KEY"].to_s.strip
    request["Authorization"] = "Bearer #{key}" unless key.empty?
    request.body = JSON.generate(
      prompt: prompt.to_s,
      slug: slug.to_s,
      mode: mode.to_s.empty? ? "landing" : mode.to_s,
      publish: false,
      attachments: Array(attachments).first(4),
    )

    Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https",
                    open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |http|
      http.request(request) do |response|
        unless response.is_a?(Net::HTTPSuccess)
          detail = response.body.to_s.strip
          yield sse("error", { "message" => harness_error(response.code, detail) })
          return
        end
        response.read_body(&block)
      end
    end
  end

  def harness_error(code, detail)
    text = detail.empty? ? "Harness returned #{code}." : detail
    text.bytesize > 400 ? "#{text.byteslice(0, 400)}…" : text
  end

  def sse(event, data)
    "event: #{event}\ndata: #{JSON.generate(data)}\n\n"
  end

  def json_error(status, code, message)
    [status, { "content-type" => "application/json" },
     [JSON.generate(error: { code: code, message: message })]]
  end

  def loopback?(host)
    LOOPBACK_HOSTS.include?(host.to_s.downcase) || host.to_s.downcase.end_with?(".localhost")
  end
end
