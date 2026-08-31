require_relative "../spec_helper"
require "rack/test"
require_relative "../../app"

# The write path, from the MCP tool down to what gets saved.
#
# The sidecar itself is stubbed here: it is a separate Bun process, and a Ruby
# spec that needs it running would be a spec about process management rather
# than about behaviour. What the stub cannot fake — that `importHtml` really
# turns HTML into nodes — is covered on the TypeScript side by
# `applyEditsHeadless.test.ts`.
#
# What IS asserted here is everything Ruby owns: refusing bad input, persisting
# the document and its style rules together, and turning a sidecar failure into
# something a model can act on rather than a stack trace.
class McpApplyEditsSpec < Minitest::Test
  def setup
    Page.dataset.delete
    SiteState.dataset.delete
    @original = EditorSidecar.method(:call)
  end

  def teardown
    EditorSidecar.define_singleton_method(:call, @original)
  end

  # Stands in for the sidecar: returns a document with one node added, and a
  # style rule, so the persistence assertions have something real to check.
  def stub_sidecar(applied: 1, reason: nil)
    EditorSidecar.define_singleton_method(:call) do |document:, style_rules:, edits:|
      if reason
        EditorSidecar::Result.new(document: nil, style_rules: nil, applied: 0, reason: reason)
      else
        grown = document.dup
        grown["nodes"] = document.fetch("nodes").merge(
          "added" => { "id" => "added", "moduleId" => "base.text", "children" => [],
                       "props" => { "text" => "Hello" }, "classIds" => ["rule-1"],
                       "breakpointOverrides" => {} },
        )
        grown["nodes"]["root"] = grown["nodes"].fetch("root").merge("children" => ["added"])
        EditorSidecar::Result.new(
          document: grown,
          style_rules: style_rules.merge("rule-1" => { "id" => "rule-1", "name" => "text-xl", "kind" => "class" }),
          applied: applied, reason: nil,
        )
      end
    end
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

  def insert = [{ "op" => "insert", "parentId" => "root", "html" => "<p>Hello</p>" }]

  def apply(args) = McpTools.run_apply_edits(args)

  def refusal(args)
    apply(args)
    flunk "expected a refusal"
  rescue McpTools::ArgumentError => e
    e.message
  end

  # ── What Ruby refuses before ever calling out ────────────────────────────

  def test_an_unknown_page_says_how_to_find_the_right_one
    site!
    assert_match(/list_pages/, refusal({ "slug" => "nope", "edits" => insert }))
  end

  def test_an_empty_batch_is_refused
    page!
    site!
    assert_match(/non-empty/, refusal({ "slug" => "index", "edits" => [] }))
  end

  # A model asking for 60 edits on one page has usually lost track of what it
  # is doing; the message tells it what to do instead.
  def test_an_oversized_batch_is_refused_with_advice
    page!
    site!
    edits = Array.new(McpTools::MAX_EDITS + 1) { insert.first }

    message = refusal({ "slug" => "index", "edits" => edits })

    assert_match(/#{McpTools::MAX_EDITS} is the limit/, message)
    assert_match(/read the page again/, message)
  end

  # ── Persistence ──────────────────────────────────────────────────────────

  def test_the_edited_document_is_saved
    page = page!
    site!
    stub_sidecar

    outcome = apply({ "slug" => "index", "edits" => insert })

    assert_equal 1, outcome.fetch("applied")
    assert_includes Page[page.id].document_data.fetch("nodes").keys, "added"
  end

  # A document referencing style rules that were never saved publishes as
  # unstyled markup — so both writes have to land, or neither.
  def test_style_rules_are_saved_alongside_the_document
    page!
    site!
    stub_sidecar

    apply({ "slug" => "index", "edits" => insert })

    assert_equal "text-xl", SiteState.first.site.dig("styleRules", "rule-1", "name")
  end

  def test_section_id_is_resolved_to_a_node_id_before_the_sidecar
    document = {
      "id" => "index", "slug" => "index", "title" => "Home", "rootNodeId" => "root",
      "nodes" => {
        "root" => { "id" => "root", "moduleId" => "base.body", "children" => ["hero"],
                    "props" => {}, "classIds" => [], "breakpointOverrides" => {} },
        "hero" => { "id" => "hero", "moduleId" => "base.container", "children" => [],
                    "props" => { "htmlAttributes" => { "id" => "index__hero", "data-section-id" => "index__hero" } },
                    "classIds" => [], "breakpointOverrides" => {} },
      },
    }
    Page.create(slug: "index", title: "Home", kind: "page", status: "draft",
                document: JSON.generate(document), created_at: Time.now, updated_at: Time.now)
    site!
    captured = nil
    EditorSidecar.define_singleton_method(:call) do |document:, style_rules:, edits:|
      captured = edits
      EditorSidecar::Result.new(document:, style_rules:, applied: 1, reason: nil)
    end

    apply({ "slug" => "index", "edits" => [{
      "op" => "replace", "sectionId" => "index__hero",
      "html" => %(<section id="index__hero" data-section-id="index__hero">Hi</section>),
    }] })

    assert_equal "hero", captured.fetch(0).fetch("nodeId")
    refute captured.fetch(0).key?("sectionId")
  end

  def test_unknown_section_id_is_refused_before_the_sidecar
    page!
    site!
    called = false
    EditorSidecar.define_singleton_method(:call) do |**|
      called = true
      flunk "sidecar should not run"
    end

    assert_match(/list_children/, refusal({
      "slug" => "index",
      "edits" => [{ "op" => "replace", "sectionId" => "missing", "html" => "<p>x</p>" }],
    }))
    refute called
  end

  def test_editing_touches_the_draft_and_says_so
    page = page!
    site!
    stub_sidecar

    outcome = apply({ "slug" => "index", "edits" => insert })

    assert_match(/publish/i, outcome.fetch("note"))
    assert_equal "draft", Page[page.id].status
  end

  # The document goes through Page#document=, which validates it against the
  # page schema. A sidecar returning something malformed must not be able to
  # write an unloadable page.
  def test_a_malformed_document_from_the_sidecar_does_not_get_saved
    page = page!
    site!
    EditorSidecar.define_singleton_method(:call) do |document:, style_rules:, edits:|
      EditorSidecar::Result.new(document: { "nonsense" => true }, style_rules: style_rules,
                                applied: 1, reason: nil)
    end

    assert_raises(Sequel::ValidationFailed) { apply({ "slug" => "index", "edits" => insert }) }
    assert_empty Page[page.id].document_data.fetch("nodes").fetch("root").fetch("children")
  end

  # ── Failures the model can act on ────────────────────────────────────────

  def test_a_sidecar_that_is_down_reads_as_temporary_and_says_reads_still_work
    page!
    site!
    stub_sidecar(reason: "unreachable")

    message = refusal({ "slug" => "index", "edits" => insert })

    assert_match(/temporarily unavailable/, message)
    assert_match(/Reads still work/, message)
  end

  def test_an_unconfigured_sidecar_is_distinguished_from_a_broken_one
    page!
    site!
    stub_sidecar(reason: "not_configured")

    assert_match(/not configured/, refusal({ "slug" => "index", "edits" => insert }))
  end

  # Applying nothing usually means the model is working from ids it read
  # before an earlier edit changed them.
  def test_zero_applied_tells_the_model_to_re_read
    page!
    site!
    stub_sidecar(applied: 0)

    assert_match(/read_page again/, refusal({ "slug" => "index", "edits" => insert }))
  end

  def test_an_unknown_reason_still_produces_a_usable_message
    page!
    site!
    stub_sidecar(reason: "something_new")

    assert_match(/something_new/, refusal({ "slug" => "index", "edits" => insert }))
  end
end
