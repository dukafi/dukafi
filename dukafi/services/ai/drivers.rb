require "net/http"
require "uri"
require "json"
require_relative "capabilities"

class Dukafi
  module Ai
    module Drivers
      class UnknownProvider < KeyError; end

      class Driver
        attr_reader :id, :label, :auth_mode
        def initialize(id, label, auth_mode: :api_key)
          @id, @label, @auth_mode = id, label, auth_mode
        end

        def capabilities(model_id)
          model = model_id.to_s.downcase
          Capabilities.new(
            tool_calling: model.match?(/gpt|claude|gemini|llama|mistral|qwen|command/),
            vision_input: model.match?(/vision|gpt-4o|gpt-4\.1|claude-3|claude-sonnet|gemini|pixtral|llava/),
            image_generation: id == "openrouter" && model.match?(/image|flux|dall-e|imagen/),
            streaming: true
          )
        end

        def endpoint(connection)
          base = effective_base(connection).sub(%r{/+\z}, "")
          suffix = id == "anthropic" ? "/messages" : "/chat/completions"
          URI.parse(base.end_with?(suffix) ? base : "#{base}#{suffix}")
        end

        def effective_base(connection)
          configured = connection.base_url.to_s.strip
          return configured unless configured.empty?
          { "openai" => "https://api.openai.com/v1", "anthropic" => "https://api.anthropic.com/v1",
            "openrouter" => "https://openrouter.ai/api/v1" }.fetch(id, configured)
        end

        def headers(connection)
          key = connection.api_key_plain.to_s
          return {} if key.empty?
          id == "anthropic" ? { "x-api-key" => key, "anthropic-version" => "2023-06-01" } :
            { "Authorization" => "Bearer #{key}" }
        end

        def body(model:, messages:, **)
          return { model: model, messages: messages } unless id == "anthropic"
          system = messages.select { |m| m["role"] == "system" }.map { |m| m["content"] }.join("\n\n")
          value = { model: model, max_tokens: 8192, messages: messages.reject { |m| m["role"] == "system" } }
          system.empty? ? value : value.merge(system: system)
        end

        def models_endpoint(connection)
          base = effective_base(connection).sub(%r{/+\z}, "")
          return URI.parse(base.sub(%r{/v1\z}, "") + "/api/tags") if id == "ollama"
          URI.parse(base + "/models")
        end

        def list_models(connection)
          uri = models_endpoint(connection)
          response = Loop.request(uri, method: :get, headers: headers(connection), read_timeout: 8)
          parsed = JSON.parse(response.body)
          rows = id == "ollama" ? parsed["models"] : parsed["data"]
          Array(rows).filter_map do |row|
            next unless row.is_a?(Hash)
            model_id = (row["id"] || row["name"]).to_s
            next if model_id.empty?
            next if id == "openai" && !model_id.match?(/gpt|o[134]-|chat/i)
            caps = capabilities(model_id)
            if id == "openrouter"
              outputs = Array(row.dig("architecture", "output_modalities"))
              caps = caps.with(image_generation: outputs.include?("image"))
            end
            { id: model_id, label: row["name"].to_s.empty? ? model_id : row["name"], capabilities: caps.to_h }
          end.sort_by { |r| r[:id] }
        rescue StandardError
          []
        end

        def chat(connection:, model:, messages:, tools: [], stream: nil)
          Loop.chat(driver: self, connection: connection, model: model, messages: messages, tools: tools, stream: stream)
        end
      end

      DRIVERS = {
        "anthropic" => Driver.new("anthropic", "Anthropic"),
        "openai" => Driver.new("openai", "OpenAI"),
        "openrouter" => Driver.new("openrouter", "OpenRouter"),
        "ollama" => Driver.new("ollama", "Ollama", auth_mode: :base_url),
        "openai_compatible" => Driver.new("openai_compatible", "OpenAI compatible", auth_mode: :base_url),
        "dukafi" => Driver.new("dukafi", "Dukafi"),
      }.freeze

      module_function
      def resolve(id) = DRIVERS.fetch(id.to_s) { raise UnknownProvider, "Unknown AI provider #{id.inspect}" }
      def registered?(id) = DRIVERS.key?(id.to_s)
      def all = DRIVERS.values
    end
  end
end
