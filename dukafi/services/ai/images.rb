require_relative "images/wire_images_api"
require_relative "images/wire_chat_modalities"

class Dukafi
  module Ai
    module Images
      Request = Data.define(:prompt, :size, :count, :connection_id, :model)
      Success = Data.define(:media_asset, :provider, :connection_id, :model)
      Failure = Data.define(:attempts)
      SIZES = %w[1024x1024 1536x1024 1024x1536].freeze
      MAX_ATTEMPTS = 4
      BUDGET_SECONDS = 60

      module_function

      def generate(request, actor: nil)
        prompt = request.prompt.to_s.strip
        raise ArgumentError, "Prompt is required." if prompt.empty?
        size = request.size.to_s.empty? ? "1024x1024" : request.size.to_s
        raise ArgumentError, "Unsupported image size." unless SIZES.include?(size)
        count = [[request.count.to_i.nonzero? || 1, 1].max, 4].min
        attempts = []
        started = Process.clock_gettime(Process::CLOCK_MONOTONIC)

        candidates(request).first(MAX_ATTEMPTS).each do |candidate|
          break if Process.clock_gettime(Process::CLOCK_MONOTONIC) - started >= BUDGET_SECONDS
          before = Process.clock_gettime(Process::CLOCK_MONOTONIC)
          begin
            images, = generate_candidate(candidate, prompt: prompt, size: size, count: count)
            raise "Provider returned no images." if images.empty?
            first = images.first
            ext = { "image/jpeg" => "jpg", "image/webp" => "webp" }.fetch(first[:mime], "png")
            asset = MediaIngest.call(bytes: first[:bytes], filename: "ai-#{Time.now.to_i}.#{ext}", mime: first[:mime],
              origin: "ai", origin_meta: { prompt: prompt, model: candidate[:model], provider: candidate[:provider],
                                           connection_id: candidate[:connection]&.id }, alt_text: prompt)
            record(candidate, true, before, nil)
            return Success.new(media_asset: asset, provider: candidate[:provider],
                               connection_id: candidate[:connection]&.id, model: candidate[:model])
          rescue StandardError => error
            record(candidate, false, before, error)
            attempts << { connection: candidate[:connection]&.id, provider: candidate[:provider],
                          model: candidate[:model], wire: candidate[:wire], error: sanitize(error.message) }
          end
        end
        Failure.new(attempts: attempts)
      end

      def candidates(request)
        if request.connection_id
          connection = AiConnection[request.connection_id.to_i]
          return [] unless connection && !connection.disabled
          return [connection_candidate(connection, request.model)]
        end
        rows = []
        if (default = AiDefault.first(task: "image")) && !default.ai_connection.disabled
          rows << connection_candidate(default.ai_connection, default[:model])
        end
        AiConnection.where(disabled: false).order(:priority, :id).each do |connection|
          model = connection.image_model.to_s
          next if model.empty? || !Dukafi::Ai::CapabilityResolver.resolve(connection, model).image_generation
          candidate = connection_candidate(connection, model)
          rows << candidate unless rows.any? { |row| row[:connection]&.id == connection.id && row[:model] == model }
        end
        Dukafi::Plugins.configured_image_providers.each do |entry|
          rows << { provider: entry["slug"], plugin: entry, model: entry.dig("config", "model"), wire: "plugin" }
        end
        rows
      end

      def connection_candidate(connection, model)
        { provider: connection.provider, connection: connection,
          model: model.to_s.empty? ? connection.image_model : model,
          wire: connection.provider == "openrouter" ? "images-api,chat-modalities" : "images-api" }
      end

      def generate_candidate(candidate, prompt:, size:, count:)
        if (plugin = candidate[:plugin])
          result = plugin["provider"].generate(prompt: prompt, size: size, count: count, config: plugin["config"])
          raise(result.error || "Plugin image provider failed.") if result.respond_to?(:error) && result.error
          return [result.respond_to?(:images) ? result.images : result.fetch(:images), "plugin"]
        end
        connection = candidate[:connection]
        raise "This provider does not support image generation." unless %w[openai openrouter openai_compatible].include?(connection.provider)
        begin
          [WireImagesApi.generate(connection: connection, model: candidate[:model], prompt: prompt, size: size, count: count), "images-api"]
        rescue StandardError
          raise unless connection.provider == "openrouter"
          [WireChatModalities.generate(connection: connection, model: candidate[:model], prompt: prompt, size: size, count: count), "chat-modalities"]
        end
      end

      def record(candidate, ok, started, error)
        AiUsageEvent.create(kind: "image", provider: candidate[:provider], model: candidate[:model],
          connection_id: candidate[:connection]&.id, ok: ok,
          duration_ms: ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round,
          error_class: error&.class&.name)
      rescue StandardError => logging_error
        warn "[ai:image] usage logging failed: #{logging_error.message}"
      end

      def sanitize(message) = message.to_s.gsub(/(Bearer|api[_-]?key)\s*[:=]?\s*\S+/i, "\\1 [REDACTED]")[0, 1_000]
    end
  end
end
