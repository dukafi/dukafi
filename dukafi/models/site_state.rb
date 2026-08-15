require "json"

class SiteState < Sequel::Model
  def site
    JSON.parse(site_json)
  end

  def site=(value)
    self.site_json = JSON.generate(value)
  end

  # One monotonic counter for the whole site.
  #
  # Every page records the value it was last written at (`pages.seq`), so
  # "has this changed since I loaded it?" is a single comparison rather than a
  # per-row version scheme. The editor seeds every row's base from the seq it
  # got at load, which is why one global counter is enough.
  #
  # EVERY writer must call this — the editor's save, MCP's `apply_edits`,
  # anything else added later. A write that skips it is a write the editor
  # cannot detect, and silently overwriting an agent's work is exactly the
  # failure this exists to stop.
  def bump_seq!
    self.seq = (seq || 0) + 1
    save
    seq
  end

  def published_site
    published_site_json && JSON.parse(published_site_json)
  end

  def published_site=(value)
    self.published_site_json = value && JSON.generate(value)
  end
end
