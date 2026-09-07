#!/usr/bin/env ruby
require_relative "../config/environment"

root = "starter-root"
heading = "starter-heading"
copy = "starter-copy"
button = "starter-button"
document = {
  "id" => "starter-home", "slug" => "index", "title" => "Home", "rootNodeId" => root,
  "nodes" => {
    root => { "id" => root, "moduleId" => "base.body", "props" => {}, "breakpointOverrides" => {},
              "children" => [heading, copy, button], "parentId" => nil, "classIds" => [] },
    heading => { "id" => heading, "moduleId" => "base.text", "props" => { "text" => "Made for everyday moments", "tag" => "h1" },
                 "breakpointOverrides" => {}, "children" => [], "parentId" => root, "classIds" => [] },
    copy => { "id" => copy, "moduleId" => "base.text", "props" => { "text" => "Thoughtful goods, clear prices, and easy local checkout." },
              "breakpointOverrides" => {}, "children" => [], "parentId" => root, "classIds" => [] },
    button => { "id" => button, "moduleId" => "base.button", "props" => { "text" => "Shop the collection" },
                "breakpointOverrides" => {}, "children" => [], "parentId" => root, "classIds" => [] },
  },
}
meta = JSON.parse(File.read(File.expand_path("../themes/starter.json", __dir__)))
payload = {
  "theme" => meta, "media" => [],
  "shell" => { "settings" => { "language" => "en" }, "styleRules" => {}, "breakpoints" => StarterSite::BREAKPOINTS },
  "pages" => [{ "slug" => "index", "title" => "Home", "kind" => "page", "status" => "draft", "access" => "public", "document" => document }],
  "templates" => [], "partials" => [], "tables" => [], "catalogue" => { "products" => [], "collections" => [] }, "reviews" => []
}
File.binwrite(File.expand_path("../themes/starter.theme.tar.gz", __dir__), ThemeArchive.pack(payload))
