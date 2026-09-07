require "net/http"
require "json"

class Dukafi
  module Ai
    module Loop
      Result = Data.define(:reply, :reason, :detail) { def ok? = reason.nil? }
      LOOPBACK = %w[localhost 127.0.0.1 ::1 0.0.0.0].freeze
      module_function

      def valid_uri?(uri)
        uri.is_a?(URI::HTTP) && !uri.host.to_s.empty? &&
          (uri.scheme == "https" || LOOPBACK.include?(uri.host.downcase) || uri.host.downcase.end_with?(".localhost"))
      end

      def request(uri, method:, headers: {}, body: nil, read_timeout: 120)
        raise ArgumentError, "invalid_base_url" unless valid_uri?(uri)
        request = method == :get ? Net::HTTP::Get.new(uri) : Net::HTTP::Post.new(uri)
        headers.each { |key, value| request[key] = value }
        if body
          request["Content-Type"] = "application/json"
          request.body = JSON.generate(body)
        end
        Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https",
                        open_timeout: 15, read_timeout: read_timeout) { |http| http.request(request) }
      end

      def chat(driver:, connection:, model:, messages:, tools: [], stream: nil)
        response = request(driver.endpoint(connection), method: :post, headers: driver.headers(connection),
                           body: driver.body(model: model, messages: messages, tools: tools))
        unless response.is_a?(Net::HTTPSuccess)
          reason = %w[401 403].include?(response.code) ? "provider_rejected" : "provider_error"
          return Result.new(reply: nil, reason: reason, detail: detail(response))
        end
        parsed = JSON.parse(response.body)
        reply = if driver.id == "anthropic"
          Array(parsed["content"]).filter_map { |b| b["text"] if b["type"] == "text" }.join("\n")
        else
          parsed.dig("choices", 0, "message", "content").to_s
        end
        return Result.new(reply: nil, reason: "empty_reply", detail: nil) if reply.strip.empty?
        Result.new(reply: reply, reason: nil, detail: nil)
      rescue ArgumentError => e
        Result.new(reply: nil, reason: e.message == "invalid_base_url" ? "invalid_base_url" : "provider_error", detail: e.message)
      rescue StandardError => e
        Result.new(reply: nil, reason: "provider_unreachable", detail: "#{e.class}: #{e.message}"[0, 400])
      end

      def detail(response)
        parsed = JSON.parse(response.body.to_s) rescue {}
        text = parsed.dig("error", "message") || parsed["error"] || parsed["message"] || response.body.to_s
        "HTTP #{response.code}: #{text}"[0, 400]
      end
    end
  end
end
