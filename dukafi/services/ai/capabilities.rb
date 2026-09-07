class Dukafi
  module Ai
    Capabilities = Data.define(:tool_calling, :vision_input, :image_generation, :streaming) do
      def self.none = new(tool_calling: false, vision_input: false, image_generation: false, streaming: true)
      def to_h
        { toolCalling: tool_calling, visionInput: vision_input,
          imageGeneration: image_generation, streaming: streaming }
      end
    end
  end
end
