require "json"
require "fileutils"

# Shadow metering for Assist. Billing is off. The chat reply is unchanged.
#
# This lives in the store on purpose: Assist must not call dukafi-ai. The
# harness logs Build the same way in its own process.
module AiShadowMeter
  EDIT_CREDITS = 1
  CREDIT_KES = 5
  # Placeholder Sonnet-class rates from dukafi-ai/vision.md. Not a price.
  INPUT_USD_PER_MTOK = 3.0
  OUTPUT_USD_PER_MTOK = 15.0

  module_function

  def record(action:, model:, prompt_tokens:, completion_tokens:)
    prompt = prompt_tokens.to_i
    completion = completion_tokens.to_i
    credits = action.to_s == "section" ? 4 : EDIT_CREDITS
    usd = (prompt / 1_000_000.0 * INPUT_USD_PER_MTOK) + (completion / 1_000_000.0 * OUTPUT_USD_PER_MTOK)
    row = {
      "at" => Time.now.utc.iso8601,
      "action" => action.to_s,
      "model" => model.to_s,
      "promptTokens" => prompt,
      "completionTokens" => completion,
      "creditsWouldCharge" => credits,
      "kesWouldCharge" => credits * CREDIT_KES,
      "estimatedUsd" => usd.round(6),
      "billed" => false,
    }
    FileUtils.mkdir_p(File.dirname(log_path))
    File.open(log_path, "a") { |file| file.puts(JSON.generate(row)) }
    row
  rescue StandardError => e
    warn "[ai] shadow meter failed: #{e.class}: #{e.message}"
    nil
  end

  def usage_from(parsed)
    return { prompt: 0, completion: 0 } unless parsed.is_a?(Hash)

    usage = parsed["usage"]
    return { prompt: 0, completion: 0 } unless usage.is_a?(Hash)

    prompt = usage["prompt_tokens"] || usage["input_tokens"] || 0
    completion = usage["completion_tokens"] || usage["output_tokens"] || 0
    { prompt: prompt.to_i, completion: completion.to_i }
  end

  def log_path
    ENV["DUKAFI_AI_SHADOW_LOG"].to_s.strip.empty? ? default_path : ENV["DUKAFI_AI_SHADOW_LOG"]
  end

  def default_path
    File.expand_path("../tmp/ai-shadow.jsonl", __dir__)
  end
end
