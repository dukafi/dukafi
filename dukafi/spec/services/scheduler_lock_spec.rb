require_relative "../spec_helper"

class SchedulerLockSpec < Minitest::Test
  def setup
    DB[:scheduler_locks].update(holder: nil, heartbeat_at: nil)
  end

  def test_first_claim_succeeds
    assert SchedulerLock.claim(id: 1, holder: "a", now: Time.now)
    refute SchedulerLock.claim(id: 1, holder: "b", now: Time.now)
  end

  def test_contention_leaves_the_first_holder
    now = Time.now
    assert SchedulerLock.claim(id: 1, holder: "a", now: now)
    refute SchedulerLock.claim(id: 1, holder: "b", now: now + 10)
    assert_equal "a", DB[:scheduler_locks].first(id: 1)[:holder]
  end

  def test_stale_lock_can_be_stolen
    now = Time.now
    assert SchedulerLock.claim(id: 1, holder: "a", now: now)
    assert SchedulerLock.claim(id: 1, holder: "b", now: now + SchedulerLock::TTL + 1)
    assert_equal "b", DB[:scheduler_locks].first(id: 1)[:holder]
  end

  def test_heartbeat_renewal_for_the_same_holder
    now = Time.now
    assert SchedulerLock.claim(id: 1, holder: "a", now: now)
    assert SchedulerLock.claim(id: 1, holder: "a", now: now + 30)
    heartbeat = DB[:scheduler_locks].first(id: 1)[:heartbeat_at]
    assert heartbeat && heartbeat >= now + 30 - 1
  end
end
