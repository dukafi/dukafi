require "socket"
require "securerandom"

class SchedulerLock
  TTL = 90
  HOLDER = "#{Socket.gethostname}:#{Process.pid}:#{SecureRandom.hex(4)}"

  def self.claim(id: 1, holder: HOLDER, now: Time.now)
    stale = now - TTL
    DB[:scheduler_locks].where(id: id).where(
      Sequel.|({ holder: holder }, { heartbeat_at: nil }, Sequel[:heartbeat_at] < stale)
    ).update(holder: holder, heartbeat_at: now) == 1
  end

  def self.release(id: 1, holder: HOLDER)
    DB[:scheduler_locks].where(id: id, holder: holder).update(holder: nil, heartbeat_at: nil) == 1
  end
end
