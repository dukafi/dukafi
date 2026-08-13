require_relative "../spec_helper"

# The published `@font-face` block.
#
# This emitter is the half that was missing: the editor had one (canvas), the
# Ruby publisher had none, so a merchant picked a font, saw it in the editor,
# published, and the live site silently fell back to a system font.
class FontsCssSpec < Minitest::Test
  def file(overrides = {})
    {
      "variant" => "400", "subset" => "latin", "format" => "woff2",
      "path" => "/uploads/fonts/inter/400-latin-0.woff2",
    }.merge(overrides)
  end

  def site(items: [], tokens: nil)
    fonts = { "items" => items }
    fonts["tokens"] = tokens if tokens
    { "settings" => { "fonts" => fonts } }
  end

  def entry(files, overrides = {})
    {
      "id" => "font-inter", "source" => "google", "family" => "Inter",
      "category" => "Sans Serif", "variants" => ["400"], "subsets" => ["latin"],
      "files" => files, "createdAt" => 0, "updatedAt" => 0,
    }.merge(overrides)
  end

  def css(items: [], tokens: nil)
    Dukafy::Publisher::FontsCss.call(site(items: items, tokens: tokens))
  end

  def test_a_site_with_no_fonts_emits_nothing
    assert_equal "", Dukafy::Publisher::FontsCss.call({})
    assert_equal "", css
  end

  def test_emits_one_face_per_installed_file
    result = css(items: [entry([file, file("variant" => "700italic", "path" => "/uploads/fonts/inter/700i.woff2")])])

    assert_equal 2, result.scan("@font-face").length
    assert_includes result, %(font-family: "Inter";)
    assert_includes result, "font-weight: 400;"
    assert_includes result, "font-style: italic;"
    assert_includes result, "font-weight: 700;"
  end

  # Without this the browser hides text until the woff2 arrives — up to three
  # seconds of invisible content on a slow connection.
  def test_every_face_swaps_rather_than_blocking_paint
    assert_includes css(items: [entry([file])]), "font-display: swap;"
  end

  # Google shards a family across many files, each pinned to a slice of
  # Unicode. Dropping the range would make the browser download every slice
  # for every page.
  def test_preserves_the_unicode_range_of_a_slice
    result = css(items: [entry([file("unicodeRange" => "U+0000-00FF, U+0131")])])

    assert_includes result, "unicode-range: U+0000-00FF, U+0131;"
  end

  # ── The no-CDN rule ──────────────────────────────────────────────────────

  # The whole point of downloading fonts at install time is that a visitor's
  # browser never contacts Google. A corrupted site document must not be able
  # to reintroduce that request.
  def test_refuses_a_third_party_url
    result = css(items: [entry([file("path" => "https://fonts.gstatic.com/s/inter/x.woff2")])])

    refute_includes result, "gstatic"
    refute_includes result, "@font-face"
  end

  # ...unless it came from our own media pipeline, which is how an external
  # storage adapter serves uploads.
  def test_allows_a_media_backed_external_url
    result = css(items: [entry([file(
      "path" => "https://cdn.example.com/a.woff2", "mediaAssetId" => "asset-1"
    )])])

    assert_includes result, %(url("https://cdn.example.com/a.woff2"))
  end

  def test_refuses_a_traversal_path
    assert_equal "", css(items: [entry([file("path" => "/uploads/../../etc/passwd")])])
  end

  # The declared format decides the CSS `format()` token, so a path that does
  # not match it is inconsistent data, not a rendering choice.
  def test_refuses_a_path_that_contradicts_its_format
    assert_equal "", css(items: [entry([file("format" => "woff", "path" => "/uploads/f/a.woff2")])])
  end

  def test_maps_outline_formats_to_their_css_keywords
    result = css(items: [entry([file("format" => "ttf", "path" => "/uploads/f/a.ttf")])])

    assert_includes result, %(format("truetype"))
  end

  # A family name is merchant-controlled and lands inside a <style> block, so
  # `</style>` in it would terminate the tag.
  def test_a_family_name_cannot_break_out_of_the_style_tag
    result = css(items: [entry([file], "family" => %(Ev"il</style><script>))])

    refute_includes result, "</style>"
    refute_includes result, "<script>"
  end

  def test_a_hostile_unicode_range_is_dropped_but_the_face_survives
    result = css(items: [entry([file("unicodeRange" => "U+00; } body { display:none")])])

    assert_includes result, "@font-face"
    refute_includes result, "display:none"
  end

  # ── Tokens ───────────────────────────────────────────────────────────────

  # Authored styles bind to a token, so swapping the family behind
  # `--font-heading` re-skins every rule that used it.
  def test_tokens_resolve_to_the_installed_family_plus_fallback
    result = css(
      items: [entry([file])],
      tokens: [{ "id" => "t", "name" => "Heading", "variable" => "heading",
                 "familyId" => "font-inter", "fallback" => "sans-serif", "order" => 0 }],
    )

    assert_includes result, %(--font-heading: "Inter", sans-serif;)
  end

  # A token pointing at a font that was uninstalled must still produce a
  # usable stack rather than a dangling family name.
  def test_a_token_with_no_installed_family_falls_back
    result = css(tokens: [{ "id" => "t", "name" => "Body", "variable" => "font-body",
                            "familyId" => "gone", "fallback" => "Georgia, serif", "order" => 0 }])

    assert_includes result, "--font-body: Georgia, serif;"
  end

  def test_tokens_are_emitted_in_author_order
    result = css(tokens: [
      { "id" => "b", "name" => "B", "variable" => "second", "fallback" => "serif", "order" => 2 },
      { "id" => "a", "name" => "A", "variable" => "first", "fallback" => "serif", "order" => 1 },
    ])

    assert_operator result.index("--font-first"), :<, result.index("--font-second")
  end

  # A fallback stack cannot escape its own declaration.
  #
  # The characters that would end it — `;` `{` `}` `<` `>` quotes — are
  # stripped, which leaves the injected TEXT behind as a nonsense font name.
  # That is deliberate and matches `sanitizeFontFallbackStack` in the editor:
  # an unusable family name is inert, whereas dropping the whole token would
  # silently unstyle everything bound to it.
  def test_a_hostile_fallback_stack_cannot_escape_its_declaration
    result = css(tokens: [{ "id" => "t", "name" => "X", "variable" => "x",
                            "fallback" => "serif; } :root { color: red", "order" => 0 }])

    declaration = result[/--font-x:[^\n]*/]
    refute_nil declaration
    assert_equal 1, declaration.count(";")
    refute_includes declaration, "{"
    refute_includes declaration, "}"
  end
end
