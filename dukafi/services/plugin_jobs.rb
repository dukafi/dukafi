require "json"
require "time"

# Registered plugin jobs, run off the visitor request.
#
# `every` is a duration string: "30s", "15m", "6h", "1d". The lab page (and
# a future timer) calls `run_due`; a named job can be fired immediately.
class PluginJobs
  def self.parse_every(every)
    case every.to_s.strip
    when /\A(\d+)\s*s\z/i then Regexp.last_match(1).to_i
    when /\A(\d+)\s*m\z/i then Regexp.last_match(1).to_i * 60
    when /\A(\d+)\s*h\z/i then Regexp.last_match(1).to_i * 3600
    when /\A(\d+)\s*d\z/i then Regexp.last_match(1).to_i * 86_400
    when /\A\d+\z/ then every.to_i
    else 3600
    end
  end

  def self.run(plugin_id, name)
    plugin = Dukafi::Plugins.find_visible(plugin_id)
    raise ArgumentError, "No plugin #{plugin_id.inspect}." unless plugin

    job = plugin.jobs.find { |entry| entry[:name] == name.to_s }
    raise ArgumentError, "#{plugin_id.inspect} has no job #{name.inspect}." unless job

    fire(plugin, job)
  end

  def self.run_due(now = Time.now)
    ran = []
    Dukafi::Plugins.visible.each do |plugin|
      plugin.jobs.each do |job|
        next unless due?(plugin, job, now)

        fire(plugin, job)
        ran << "#{plugin.id}.#{job[:name]}"
      end
    end
    ran
  end

  def self.due?(plugin, job, now)
    key = job_key(job[:name])
    last = PluginSetting.first(plugin_id: plugin.id, key: key)&.value
    return true if last.to_s.empty?

    (now - Time.parse(last)) >= parse_every(job[:every])
  rescue ArgumentError
    true
  end

  def self.fire(plugin, job)
    job[:handler].call({ plugin: plugin, settings: plugin.settings.to_h })
    stamp(plugin.id, job[:name])
    { "ok" => true, "pluginId" => plugin.id, "job" => job[:name] }
  rescue StandardError => e
    warn "[plugin:#{plugin.id}] job #{job[:name]} failed: #{e.class}: #{e.message}"
    { "ok" => false, "pluginId" => plugin.id, "job" => job[:name], "error" => e.message }
  end
  private_class_method :fire

  def self.stamp(plugin_id, name)
    key = job_key(name)
    row = PluginSetting.first(plugin_id: plugin_id, key: key)
    value = Time.now.utc.iso8601
    if row
      row.update(value: value, updated_at: Time.now)
    else
      PluginSetting.create(plugin_id: plugin_id, key: key, value: value, updated_at: Time.now)
    end
  end
  private_class_method :stamp

  def self.job_key(name) = "_job:#{name}:ran_at"
end
