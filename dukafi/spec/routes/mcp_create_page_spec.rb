require_relative "../spec_helper"
require_relative "../../app"

# Making a page from MCP.
#
# The slug becomes a URL, so this is the one tool where bad input produces
# something permanently unreachable rather than merely wrong. Everything here
# is about refusing that clearly enough for a model to correct itself.
class McpCreatePageSpec < Minitest::Test
  def setup
    Page.dataset.delete
  end

  def create(args) = McpTools.run_create_page(args)

  def refusal(args)
    create(args)
    flunk "expected a refusal"
  rescue McpTools::ArgumentError => e
    e.message
  end

  def test_a_page_is_created_as_an_empty_draft
    outcome = create({ "slug" => "contact", "title" => "Contact" })

    assert_equal "contact", outcome.fetch("slug")
    assert_equal "/contact", outcome.fetch("url")
    page = Page.first(slug: "contact")
    assert_equal "draft", page.status
    assert_equal "page", page.kind
  end

  # A page is a node tree, and the editor cannot open one without a root.
  def test_the_new_page_has_a_body_root_the_editor_can_open
    create({ "slug" => "contact", "title" => "Contact" })

    document = Page.first(slug: "contact").document_data
    root = document.fetch("rootNodeId")
    assert_equal "base.body", document.dig("nodes", root, "moduleId")
    assert_equal "contact", document.fetch("slug")
  end

  def test_it_can_be_read_back_immediately
    create({ "slug" => "contact", "title" => "Contact" })

    assert_match(/base\.body/, McpTools.run_read_page({ "slug" => "contact" }).fetch("outline"))
  end

  # Silently overwriting someone's page would be the worst possible outcome.
  def test_an_existing_slug_is_refused_and_points_at_the_right_tool
    create({ "slug" => "contact", "title" => "Contact" })

    assert_match(/apply_edits/, refusal({ "slug" => "contact", "title" => "Other" }))
  end

  # `Storefront::SAFE_SLUG` decides what can be routed. A slug that fails it
  # creates a page no visitor could ever reach.
  def test_a_slug_that_cannot_be_a_url_is_refused
    assert_match(/cannot be a URL/, refusal({ "slug" => "Contact Me!", "title" => "X" }))
    assert_match(/cannot be a URL/, refusal({ "slug" => "-leading-hyphen", "title" => "X" }))
  end

  def test_reserved_slugs_are_refused
    %w[index product-template collection-template search].each do |slug|
      assert_match(/reserved/, refusal({ "slug" => slug, "title" => "X" }))
    end
  end

  def test_slug_and_title_are_both_required
    assert_match(/slug is required/, refusal({ "slug" => "  ", "title" => "X" }))
    assert_match(/title is required/, refusal({ "slug" => "ok", "title" => "  " }))
  end

  # Models produce "Contact" as often as "contact"; lowercasing beats refusing.
  def test_a_capitalised_slug_is_lowercased_rather_than_refused
    assert_equal "contact-us", create({ "slug" => "Contact-Us", "title" => "X" }).fetch("slug")
  end

  # Creating a page changes the store, so it must need mcp:write.
  def test_creating_counts_as_a_write
    assert McpTools.write_tool?("create_page")
  end
end
