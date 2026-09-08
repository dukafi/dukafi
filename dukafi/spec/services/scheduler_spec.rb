require_relative "../spec_helper"

class SchedulerSpec < Minitest::Test
  def setup
    PluginLog.dataset.delete
    PluginSetting.where(plugin_id: "probe", key: PluginJobs.job_key("heartbeat")).delete
    DB[:scheduler_locks].update(holder: nil, heartbeat_at: nil)
    Scheduler.stop!
    @previous = ENV["DUKAFI_ENABLE_SCHEDULER"]
    ENV["DUKAFI_ENABLE_SCHEDULER"] = "1"
  end

  def teardown
    Scheduler.stop!
    ENV["DUKAFI_ENABLE_SCHEDULER"] = @previous
    ENV.delete("DUKAFI_DISABLE_SCHEDULER")
  end

  def test_due_job_executes_and_is_stamped_once
    ENV.delete("DUKAFI_DISABLE_SCHEDULER")
    Scheduler.start!(interval: 0.05)
    sleep 0.2
    first = PluginLog.where(plugin_id: "probe", kind: "job").count
    sleep 0.2
    second = PluginLog.where(plugin_id: "probe", kind: "job").count
    assert first >= 1
    assert_equal first, second
  ensure
    Scheduler.stop!
  end

  def test_exception_does_not_kill_the_thread
    ENV.delete("DUKAFI_DISABLE_SCHEDULER")
    PluginJobs.stub :run_due, -> { raise "boom" } do
      Scheduler.start!(interval: 0.05)
      sleep 0.15
      assert Scheduler.instance_variable_get(:@thread)&.alive?
    end
  ensure
    Scheduler.stop!
  end

  def test_kill_switch_prevents_start
    ENV["DUKAFI_DISABLE_SCHEDULER"] = "1"
    Scheduler.start!(interval: 0.05)
    assert_nil Scheduler.instance_variable_get(:@thread)
  end

  def test_non_leader_does_not_run_jobs
    ENV.delete("DUKAFI_DISABLE_SCHEDULER")
    SchedulerLock.claim(id: 1, holder: "other", now: Time.now)
    PluginJobs.stub :run_due, -> { flunk "non-leader ran jobs" } do
      Scheduler.start!(interval: 0.05)
      sleep 0.15
    end
  ensure
    Scheduler.stop!
  end
end
