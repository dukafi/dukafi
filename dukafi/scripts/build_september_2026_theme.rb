#!/usr/bin/env ruby
require_relative "../config/environment"

payload = September2026Theme.payload
root = File.expand_path("../themes", __dir__)
File.binwrite(File.join(root, "september-2026.theme.tar.gz"), ThemeArchive.pack(payload))
meta = payload.fetch("theme")
File.write(File.join(root, "september-2026.json"), JSON.pretty_generate(meta) + "\n")
