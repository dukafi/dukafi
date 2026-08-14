class PluginSetting < Sequel::Model
  def validate
    super
    validates_presence %i[plugin_id key]
  end
end
