require "securerandom"

class StarterSite
  BREAKPOINTS = [
    { "id" => "mobile", "label" => "Mobile", "width" => 375, "mediaQuery" => "(max-width: 375px)", "icon" => "smartphone" },
    { "id" => "tablet", "label" => "Tablet", "width" => 768, "mediaQuery" => "(max-width: 768px)", "icon" => "tablet" },
    { "id" => "desktop", "label" => "Desktop", "width" => 1440, "mediaQuery" => "(max-width: 1440px)", "icon" => "monitor" },
  ].freeze

  EXPLORER = {
    "pages" => { "expandedFolders" => [], "emptyFolders" => [], "rowOrder" => [] },
    "styles" => { "expandedFolders" => [], "emptyFolders" => [], "rowOrder" => [] },
    "scripts" => { "expandedFolders" => [], "emptyFolders" => [], "rowOrder" => [] },
    "templates" => { "folders" => [], "items" => [] },
    "components" => { "folders" => [], "items" => [] },
  }.freeze

  def self.create!(name:)
    now_ms = (Time.now.to_f * 1000).to_i
    shell = {
      "id" => SecureRandom.hex(8),
      "name" => name,
      "breakpoints" => BREAKPOINTS,
      "settings" => { "shortcuts" => {} },
      "styleRules" => {},
      "files" => [],
      "explorer" => EXPLORER,
      "packageJson" => { "dependencies" => {}, "devDependencies" => {} },
      "runtime" => { "dependencyLock" => { "version" => 1, "packages" => {}, "updatedAt" => 0 }, "scripts" => {}, "styles" => {} },
      "createdAt" => now_ms,
      "updatedAt" => now_ms,
    }

    root_id = SecureRandom.hex(8)
    page_id = SecureRandom.hex(8)
    page = {
      "id" => page_id,
      "slug" => "index",
      "title" => "Home",
      "nodes" => {
        root_id => {
          "id" => root_id,
          "moduleId" => "base.body",
          "props" => {},
          "breakpointOverrides" => {},
          "children" => [],
          "parentId" => nil,
          "classIds" => [],
        },
      },
      "rootNodeId" => root_id,
    }

    DB.transaction do
      SiteState.create(site: shell, seq: 0)
      Page.create(slug: "index", title: "Home", kind: "page", document: page, status: "draft")
    end
  end
end
