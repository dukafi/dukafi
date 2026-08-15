require_relative "../spec_helper"
require_relative "../../app"

# Making a draft live, from MCP.
#
# The one tool here that a visitor can see the result of. Everything else edits
# a draft nobody but the merchant can reach; this regenerates the storefront.
# That is why it is a separate tool rather than a flag on `apply_edits` — a
# model has to decide to do it, not arrive at it.
class McpPublishSpec < Minitest::Test
  def setup
    Page.dataset.delete
    SiteState.dataset.delete
    @published_root = Dir.mktmpdir("dukafi-mcp-publish-")
    ENV["DUKAFI_PUBLISHED_ROOT"] = @published_root
  end

  def teardown
    ENV.delete("DUKAFI_PUBLISHED_ROOT")
    FileUtils.remove_entry(@published_root) if @published_root && Dir.exist?(@published_root)
  end

  def page!(slug: "index")
    document = {
      "id" => slug, "slug" => slug, "title" => "Home", "rootNodeId" => "root",
      "nodes" => { "root" => { "id" => "root", "moduleId" => "base.body", "children" => [],
                               "props" => {}, "classIds" => [], "breakpointOverrides" => {} } },
    }
    Page.create(slug:, title: "Home", kind: "page", status: "draft",
                document: JSON.generate(document), created_at: Time.now, updated_at: Time.now)
  end

  def site!
    state = SiteState.new
    state.site = { "styleRules" => {} }
    state.created_at = Time.now
    state.updated_at = Time.now
    state.save
  end

  def refusal
    McpTools.run_publish
    flunk "expected a refusal"
  rescue McpTools::ArgumentError => e
    e.message
  end

  def test_publishing_makes_the_draft_live
    page = page!
    site!

    outcome = McpTools.run_publish

    assert outcome.fetch("published")
    assert_operator outcome.fetch("pages"), :>=, 1
    assert_equal "published", Page[page.id].status
    refute_nil Page[page.id].published_document
  end

  # A full bake costs a Tailwind compile and a rewrite of every page. Doing
  # that to produce byte-identical output is pure waste, and models retry.
  def test_publishing_an_unchanged_draft_does_nothing
    page!
    site!
    McpTools.run_publish

    outcome = McpTools.run_publish

    refute outcome.fetch("published")
    assert_match(/already matches/, outcome.fetch("reason"))
  end

  def test_an_edit_makes_it_publishable_again
    page = page!
    site!
    McpTools.run_publish

    document = page.document_data
    document["nodes"]["root"]["children"] = []
    page.document = JSON.generate(document.merge("title" => "Changed"))
    page.save

    assert McpTools.run_publish.fetch("published")
  end

  # `PublishSite` raises Ruby's ::ArgumentError, while a bare `ArgumentError`
  # inside McpTools is McpTools' own — an unqualified rescue would miss it and
  # the model would get a bare stack message instead of the reason.
  def test_a_store_with_no_pages_explains_itself
    site!

    assert_match(/Could not publish/, refusal)
  end

  def test_a_store_with_no_site_explains_itself
    page!

    assert_match(/Could not publish/, refusal)
  end

  # Publishing is separate from editing on purpose: nothing else in the tool
  # set may make a draft live as a side effect.
  def test_no_other_tool_publishes
    assert_equal ["publish"], McpTools.all.map { |tool| tool.fetch(:name) }.grep(/publish/)
  end
end
