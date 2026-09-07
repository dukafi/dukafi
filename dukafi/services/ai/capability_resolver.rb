require "thread"

class Dukafi
  module Ai
    module CapabilityResolver
      TTL = 300
      @cache = {}
      @mutex = Mutex.new
      module_function

      def resolve(connection, model_id)
        fallback = connection.driver.capabilities(model_id)
        key = [connection.id, model_id.to_s, connection.updated_at&.to_f]
        now = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        cached = @mutex.synchronize { @cache[key] }
        return cached[:value] if cached && cached[:expires] > now

        value = live(connection, model_id) || fail_closed(fallback)
        @mutex.synchronize do
          @cache.delete_if { |candidate, _| candidate[0] == connection.id && candidate != key }
          @cache[key] = { value: value, expires: now + TTL }
        end
        value
      rescue StandardError
        fail_closed(fallback)
      end

      def live(connection, model_id)
        row = connection.driver.list_models(connection).find { |entry| entry[:id] == model_id.to_s }
        return nil unless row
        caps = row[:capabilities] || {}
        Capabilities.new(tool_calling: !!caps[:toolCalling], vision_input: !!caps[:visionInput],
                         image_generation: !!caps[:imageGeneration], streaming: caps.fetch(:streaming, true))
      end

      def fail_closed(fallback)
        Capabilities.new(tool_calling: fallback.tool_calling, vision_input: false,
                         image_generation: false, streaming: fallback.streaming)
      end

      def clear! = @mutex.synchronize { @cache.clear }
    end
  end
end
