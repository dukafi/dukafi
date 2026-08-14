require "json"

class SiteState < Sequel::Model
  def site
    JSON.parse(site_json)
  end

  def site=(value)
    self.site_json = JSON.generate(value)
  end

  def published_site
    published_site_json && JSON.parse(published_site_json)
  end

  def published_site=(value)
    self.published_site_json = value && JSON.generate(value)
  end
end
