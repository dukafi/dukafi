require_relative "../spec_helper"
require "rack/test"
require "rack/lint"
require_relative "../../app"

# Two writers, one store.
#
# Until MCP existed the editor was the only thing that wrote pages, so nothing
# needed to detect a concurrent change. `core/persistence/cms.ts` has always
# SHIPPED base seqs for exactly this — and the server threw them away, with
# `pages` carrying no seq column and `data_row` reporting a hardcoded 0.
#
# The failure that closes: an agent edits a page, the merchant's open tab is
# still holding the version from before, and their next save silently replaces
# the agent's work with no error anywhere.
class SaveConflictSpec < Minitest::Test
  include Rack::Test::Methods

  def app = Rack::Lint.new(Dukafi.app)

  def setup
    Page.dataset.delete
    SiteState.dataset.delete
    Admin.dataset.delete
    clear_cookies
    sign_in!
  end

  def post_json(path, payload)
    post path, JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  def sign_in!
    post_json "/admin/api/cms/setup",
              siteName: "Store", email: "owner@example.com", password: "correct-horse-battery"
    post_json "/admin/api/cms/login", email: "owner@example.com", password: "correct-horse-battery"
  end

  def body = JSON.parse(last_response.body)

  def document_for(page, title: page.title)
    { "id" => page.id.to_s, "slug" => page.slug, "title" => title,
      "rootNodeId" => "b",
      "nodes" => { "b" => { "id" => "b", "moduleId" => "base.body", "children" => [],
                            "props" => {}, "classIds" => [], "breakpointOverrides" => {} } } }
  end

  # What the editor sends: the shell, the changed pages, and the seq each one
  # was last synchronized at.
  def editor_save(page, base_seqs:, title: "Edited by the merchant", shell_base: nil)
    payload = {
      mode: "incremental",
      site: SiteState.first.site,
      changedPages: [document_for(page, title: title)],
      deletedPageIds: [],
      baseSeqs: base_seqs,
    }
    payload[:shellBaseSeq] = shell_base if shell_base
    put "/admin/api/cms/site-document", JSON.generate(payload), "CONTENT_TYPE" => "application/json"
  end

  # Stands in for MCP writing the page out from under the open editor.
  def external_write!(page)
    state = SiteState.first
    seq = state.bump_seq!
    page.update(seq: seq, title: "Edited by an agent")
    seq
  end

  def a_page
    Page.first || Page.create(slug: "about", title: "About", kind: "page", status: "draft",
                              document: JSON.generate({
                                "id" => "about", "slug" => "about", "title" => "About",
                                "rootNodeId" => "b",
                                "nodes" => { "b" => { "id" => "b", "moduleId" => "base.body",
                                                      "children" => [], "props" => {},
                                                      "classIds" => [], "breakpointOverrides" => {} } },
                              }))
  end

  # ── The reason this exists ───────────────────────────────────────────────

  def test_a_save_built_on_a_stale_copy_is_refused
    page = a_page
    loaded_at = SiteState.first.seq
    external_write!(page)

    editor_save(page, base_seqs: { page.id.to_s => loaded_at })

    assert_equal 409, last_response.status
    assert_equal "save_conflict", body.fetch("error")
    conflict = body.fetch("conflicts").first
    assert_equal "pages", conflict.fetch("table")
    assert_equal page.id.to_s, conflict.fetch("rowId")
  end

  # A rejected save must write NOTHING — a partial one leaves the store in a
  # state neither writer intended.
  def test_a_refused_save_changes_nothing
    page = a_page
    loaded_at = SiteState.first.seq
    external_write!(page)
    seq_before = SiteState.first.seq

    editor_save(page, base_seqs: { page.id.to_s => loaded_at })

    assert_equal "Edited by an agent", Page[page.id].title
    assert_equal seq_before, SiteState.first.seq
  end

  # After reloading, the merchant's base is current and the save goes through.
  def test_reloading_makes_the_save_succeed
    page = a_page
    external_write!(page)

    editor_save(page, base_seqs: { page.id.to_s => SiteState.first.seq })

    assert_equal 200, last_response.status
    assert_equal "Edited by the merchant", Page[page.id].title
  end

  def test_an_uncontended_save_is_untouched
    page = a_page

    editor_save(page, base_seqs: { page.id.to_s => SiteState.first.seq })

    assert_equal 200, last_response.status
  end

  # ── The seq itself ───────────────────────────────────────────────────────

  def test_saving_stamps_the_page_with_the_site_seq
    page = a_page

    editor_save(page, base_seqs: { page.id.to_s => SiteState.first.seq })

    assert_equal SiteState.first.seq, Page[page.id].seq
  end

  # The editor reads this to seed its bases; a hardcoded 0 is what made every
  # comparison meaningless.
  def test_a_page_reports_its_real_seq
    page = a_page
    editor_save(page, base_seqs: { page.id.to_s => SiteState.first.seq })

    get "/admin/api/cms/pages"

    row = body.fetch("rows").find { |entry| entry.fetch("id") == page.id.to_s }
    assert_operator row.fetch("seq"), :>, 0
  end

  # ── Deliberate looseness ─────────────────────────────────────────────────

  # A client that ships no bases gets no conflict checking rather than a 409 it
  # could never clear. See the comment on `save_conflicts`.
  def test_a_client_that_sends_no_bases_is_allowed_through
    page = a_page
    external_write!(page)

    editor_save(page, base_seqs: {})

    assert_equal 200, last_response.status
  end

  # `replace` is an import or a bootstrap — replacing deliberately, with
  # nothing to conflict with.
  def test_replace_mode_never_conflicts
    page = a_page
    loaded_at = SiteState.first.seq
    external_write!(page)

    put "/admin/api/cms/site-document", JSON.generate({
      mode: "replace", site: SiteState.first.site,
      changedPages: [document_for(page)], deletedPageIds: [],
      baseSeqs: { page.id.to_s => loaded_at },
    }), "CONTENT_TYPE" => "application/json"

    assert_equal 200, last_response.status
  end

  # Only when the incoming shell actually DIFFERS — otherwise every page save
  # would collide with any unrelated settings change.
  def test_an_unchanged_shell_does_not_conflict
    page = a_page
    stale = SiteState.first.seq
    external_write!(page)

    editor_save(page, base_seqs: {}, shell_base: stale)

    assert_equal 200, last_response.status
  end

  def test_a_changed_shell_built_on_a_stale_copy_is_refused
    page = a_page
    stale = SiteState.first.seq
    external_write!(page)

    put "/admin/api/cms/site-document", JSON.generate({
      mode: "incremental", site: SiteState.first.site.merge("name" => "Renamed by the merchant"),
      changedPages: [], deletedPageIds: [], baseSeqs: {}, shellBaseSeq: stale,
    }), "CONTENT_TYPE" => "application/json"

    assert_equal 409, last_response.status
    assert_equal "site", body.fetch("conflicts").first.fetch("table")
  end

  # Deleting a row that moved on is an overwrite too.
  def test_deleting_a_page_that_changed_since_load_is_refused
    page = a_page
    loaded_at = SiteState.first.seq
    external_write!(page)

    put "/admin/api/cms/site-document", JSON.generate({
      mode: "incremental", site: SiteState.first.site,
      changedPages: [], deletedPageIds: [page.id.to_s],
      baseSeqs: { page.id.to_s => loaded_at },
    }), "CONTENT_TYPE" => "application/json"

    assert_equal 409, last_response.status
    refute_nil Page[page.id]
  end
end
