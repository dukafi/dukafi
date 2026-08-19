require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require "fileutils"
require "tmpdir"
require_relative "../../app"

class McpSitemapSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Rack::Lint.new(Dukafi.app)

  def setup
    Page.dataset.delete
    PersonalAccessToken.dataset.delete
    Admin.dataset.delete
    clear_cookies
    _, @token = PersonalAccessToken.issue!(name: "Cursor")
    @published_root = Dir.mktmpdir("dukafi-mcp-sitemap-")
    @previous_root = ENV["DUKAFY_PUBLISHED_ROOT"]
    ENV["DUKAFY_PUBLISHED_ROOT"] = @published_root
  end

  def teardown
    if @previous_root
      ENV["DUKAFY_PUBLISHED_ROOT"] = @previous_root
    else
      ENV.delete("DUKAFY_PUBLISHED_ROOT")
    end
    FileUtils.remove_entry(@published_root) if @published_root && File.exist?(@published_root)
  end

  def tool(name)
    McpTools.all.find { |entry| entry.fetch(:name) == name }.fetch(:run)
  end

  def call(name, args = {}) = tool(name).call(args)

  def test_generate_list_and_read_are_wired
    SiteState.dataset.delete
    SiteState.create(site: { "name" => "Shop", "settings" => { "language" => "en" } }, publish_version: 1)
    document = {
      "id" => "home", "slug" => "index", "title" => "Home", "rootNodeId" => "b",
      "nodes" => { "b" => { "id" => "b", "moduleId" => "base.body", "children" => [],
                            "props" => {}, "classIds" => [], "breakpointOverrides" => {} } },
    }
    Page.create(slug: "index", title: "Home", kind: "page", status: "published",
                document: JSON.generate(document))
    FileUtils.mkdir_p(File.join(@published_root, "slot_0"))
    File.symlink("slot_0", File.join(@published_root, "current"))

    generated = call("generate_sitemaps")
    listed = call("list_sitemaps")
    xml = call("read_sitemap", { "name" => "sitemap-0.xml" })

    assert generated.fetch("urlCount") >= 1
    assert listed.dig("index", "name") == "sitemap.xml"
    assert_includes xml.fetch("xml"), "<urlset"
    assert McpTools.write_tool?("generate_sitemaps")
    refute McpTools.write_tool?("list_sitemaps")
    refute McpTools.write_tool?("read_sitemap")
  end

  def test_generate_without_a_published_site_explains_itself
    error = assert_raises(McpTools::ArgumentError) { call("generate_sitemaps") }
    assert_match(/Publish/, error.message)
  end
end
