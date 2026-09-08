class Scheduler
  INTERVAL = 60
  class << self
    attr_accessor :interval
  end

  def self.disabled?
    ENV["DUKAFI_DISABLE_SCHEDULER"] == "1" ||
      (ENV["RACK_ENV"] == "test" && ENV["DUKAFI_ENABLE_SCHEDULER"] != "1")
  end

  def self.start!(interval: nil)
    return if disabled? || @thread&.alive?
    wait = interval || self.interval || INTERVAL
    @thread = Thread.new do
      Thread.current.name = "dukafi-scheduler"
      loop do
        begin
          PluginJobs.run_due if SchedulerLock.claim
        rescue StandardError => error
          warn "[scheduler] #{error.class}: #{error.message}"
        end
        sleep wait
      end
    end
  end

  def self.stop!
    @thread&.kill
    @thread = nil
  end
end
