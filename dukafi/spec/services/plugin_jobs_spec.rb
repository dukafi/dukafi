require_relative "../spec_helper"

class PluginJobsSpec < Minitest::Test
  def setup
    PluginLog.dataset.delete
    PluginSetting.where(plugin_id: "probe", key: PluginJobs.job_key("heartbeat")).delete
  end

  def test_every_parses_duration_strings
    assert_equal 30, PluginJobs.parse_every("30s")
    assert_equal 900, PluginJobs.parse_every("15m")
    assert_equal 21_600, PluginJobs.parse_every("6h")
    assert_equal 86_400, PluginJobs.parse_every("1d")
  end

  def test_run_fires_a_named_job_immediately
    result = PluginJobs.run("probe", "heartbeat")

    assert result.fetch("ok")
    assert_equal "heartbeat", result.fetch("job")
    row = PluginLog.where(plugin_id: "probe", kind: "job").last
    assert row
    assert_includes row.message, "Heartbeat"
  end

  def test_run_due_skips_a_job_that_just_ran
    PluginJobs.run("probe", "heartbeat")
    before = PluginLog.where(plugin_id: "probe", kind: "job").count

    ran = PluginJobs.run_due

    refute_includes ran, "probe.heartbeat"
    assert_equal before, PluginLog.where(plugin_id: "probe", kind: "job").count
  end
end
