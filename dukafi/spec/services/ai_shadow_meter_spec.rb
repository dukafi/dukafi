require_relative "../spec_helper"

class AiShadowMeterSpec < Minitest::Test
  def setup
    @path = File.join(Dir.tmpdir, "dukafi-ai-shadow-#{Process.pid}.jsonl")
    ENV["DUKAFI_AI_SHADOW_LOG"] = @path
    File.delete(@path) if File.exist?(@path)
  end

  def teardown
    File.delete(@path) if File.exist?(@path)
    ENV.delete("DUKAFI_AI_SHADOW_LOG")
  end

  def test_reads_openai_usage
    usage = AiShadowMeter.usage_from("usage" => { "prompt_tokens" => 100, "completion_tokens" => 20 })
    assert_equal 100, usage[:prompt]
    assert_equal 20, usage[:completion]
  end

  def test_reads_anthropic_usage
    usage = AiShadowMeter.usage_from("usage" => { "input_tokens" => 50, "output_tokens" => 10 })
    assert_equal 50, usage[:prompt]
    assert_equal 10, usage[:completion]
  end

  def test_logs_an_edit_without_charging
    row = AiShadowMeter.record(action: "edit", model: "gpt-4o-mini", prompt_tokens: 1000, completion_tokens: 200)

    assert_equal false, row.fetch("billed")
    assert_equal 1, row.fetch("creditsWouldCharge")
    assert_equal 5, row.fetch("kesWouldCharge")
    assert File.exist?(@path)
    logged = JSON.parse(File.read(@path).lines.last)
    assert_equal "edit", logged.fetch("action")
  end
end
