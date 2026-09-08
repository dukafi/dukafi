require_relative "../spec_helper"

class EnvExampleSpec < Minitest::Test
  ROOT = File.expand_path("../../..", __dir__)
  EXAMPLE = File.join(ROOT, ".env.example")
  ALLOWLIST = %w[
    DUKAFY_DB DUKAFY_STORAGE_ROOT DUKAFY_PUBLISHED_ROOT DUKAFY_PLUGINS_ROOT DUKAFY_REGISTRY_URL
    HOME PATH USER TMPDIR TMP TEMP LANG LC_ALL TERM SHELL PWD OLDPWD _
    BUNDLE_GEMFILE BUNDLE_PATH GEM_HOME GEM_PATH RUBYOPT RUBYLIB
    CI GITHUB_ACTIONS RUNNER_TEMP
    DUKAFI_TEST DUKAFI_SMOKE_IMAGE
  ].freeze

  PREFIXES = %w[
    DUKAFI_ DUKAFY_ SESSION_ DATABASE_ PORT RACK_ APP_ SKIP_ DB_ DOMAIN
  ].freeze

  def documented_keys
    File.read(EXAMPLE).each_line.filter_map do |line|
      line = line.sub(/\A#\s*/, "")
      next unless line =~ /\A([A-Z][A-Z0-9_]*)=/
      Regexp.last_match(1)
    end.uniq
  end

  def referenced_keys
    keys = []
    Dir[File.join(ROOT, "dukafi", "**", "*.rb")].each do |path|
      next if path.include?("/spec/")
      File.read(path).scan(/ENV(?:\.fetch)?\(\s*["']([A-Z][A-Z0-9_]*)["']/).each { |m| keys << m[0] }
      File.read(path).scan(/ENV\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/).each { |m| keys << m[0] }
    end
    keys.uniq
  end

  def relevant?(key)
    return true if PREFIXES.any? { |prefix| key.start_with?(prefix) || key == prefix.delete_suffix("_") }
    key == "DOMAIN" || key.start_with?("DUKAFI_IMAGE") || key == "PORT"
  end

  def test_env_example_documents_runtime_reads
    documented = documented_keys
    missing = referenced_keys.select { |key| relevant?(key) }
                             .reject { |key| documented.include?(key) || ALLOWLIST.include?(key) }
    assert_empty missing, "undocumented ENV keys (add to .env.example with a comment):\n#{missing.sort.join("\n")}"
  end
end
