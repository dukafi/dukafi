require "json"

class SiteState < Sequel::Model
  def site
    JSON.parse(site_json)
  end

  def site=(value)
    self.site_json = JSON.generate(value)
  end
end
