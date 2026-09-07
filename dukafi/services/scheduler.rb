class Scheduler
  INTERVAL = 60
  def self.start!
    return if ENV["DUKAFI_DISABLE_SCHEDULER"] == "1" || ENV["RACK_ENV"] == "test" || @thread&.alive?
    @thread = Thread.new do
      Thread.current.name = "dukafi-scheduler"
      loop do
        begin
          PluginJobs.run_due if SchedulerLock.claim
        rescue StandardError => error
          warn "[scheduler] #{error.class}: #{error.message}"
        end
        sleep INTERVAL
      end
    end
  end

  def self.stop!
    @thread&.kill
    @thread = nil
  end
end
