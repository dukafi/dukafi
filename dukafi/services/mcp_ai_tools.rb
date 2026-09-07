require_relative "ai/images"

module McpAiTools
  module_function

  def all = [get_ai_status, generate_image]
  READ_TOOLS = %w[get_ai_status].freeze

  def get_ai_status
    {
      name: "get_ai_status", title: "Get AI configuration status",
      description: "Reports which AI tasks are configured without exposing provider credentials.",
      input_schema: { "type" => "object", "properties" => {}, "additionalProperties" => false },
      run: lambda do |_args|
        tasks = %w[chat image].to_h { |task| [task, !AiDefault.first(task: task).nil?] }
        { "configured" => tasks.values.any?, "tasks" => tasks }
      end,
    }
  end

  def generate_image
    {
      name: "generate_image", title: "Generate an image",
      description: "Generate an image through the store's configured fallback chain and add it to the media library.",
      input_schema: {
        "type" => "object", "properties" => {
          "prompt" => { "type" => "string" },
          "size" => { "type" => "string", "enum" => Dukafi::Ai::Images::SIZES },
          "count" => { "type" => "integer", "minimum" => 1, "maximum" => 4 },
          "connectionId" => { "type" => "integer" }, "model" => { "type" => "string" },
        }, "required" => %w[prompt], "additionalProperties" => false,
      },
      run: lambda do |args|
        request = Dukafi::Ai::Images::Request.new(prompt: args["prompt"], size: args["size"], count: args["count"],
          connection_id: args["connectionId"], model: args["model"])
        result = Dukafi::Ai::Images.generate(request, actor: :mcp)
        raise McpTools::ArgumentError, "Image generation failed: #{result.attempts.map { |a| a[:error] }.join('; ')}" if result.is_a?(Dukafi::Ai::Images::Failure)
        { "asset" => result.media_asset.to_payload, "provider" => result.provider, "model" => result.model }
      end,
    }
  end
end
