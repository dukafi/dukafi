require_relative "../spec_helper"

# Inline SVG is markup the browser executes in the page's own origin, and it
# arrives from a merchant pasting a logo or a model writing an icon. Escaping
# is not an option — that would print the source as text — so this is the only
# thing between that markup and the published page.
class SvgSanitizerSpec < Minitest::Test
  def test_keeps_an_ordinary_icon_intact
    markup = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" fill="currentColor"/></svg>'

    assert_equal markup, SvgSanitizer.call(markup)
  end

  def test_drops_a_script_and_everything_in_it
    result = SvgSanitizer.call('<svg><script>fetch("/admin/api/cms/me")</script><circle r="4"/></svg>')

    refute_includes result, "script"
    refute_includes result, "fetch"
    # The drawing survives — sanitising must not mean discarding.
    assert_includes result, "<circle"
  end

  def test_drops_inline_event_handlers
    ['<svg onload="steal()"><rect/></svg>',
     "<svg><rect onmouseover='steal()'/></svg>",
     "<svg><rect onclick=steal()/></svg>"].each do |markup|
      result = SvgSanitizer.call(markup)

      refute_match(/\bon[a-z]+\s*=/i, result, "handler survived in #{markup}")
    end
  end

  def test_drops_a_script_url_wherever_it_hides
    result = SvgSanitizer.call(
      %(<svg><a href="javascript:steal()"><text xlink:href="javascript:x()">go</text></a></svg>),
    )

    refute_includes result.downcase, "javascript:"
    # The elements themselves are harmless; only the attribute goes.
    assert_includes result, "<text"
  end

  # `<foreignObject>` is an escape hatch into arbitrary HTML, which is the whole
  # attack surface the rest of this guards against.
  def test_drops_foreign_object
    result = SvgSanitizer.call('<svg><foreignObject><img src=x onerror="steal()"></foreignObject></svg>')

    refute_includes result, "foreignObject"
    refute_includes result, "onerror"
  end

  def test_drops_embedded_frames_and_objects
    result = SvgSanitizer.call('<svg><iframe src="https://evil.example"></iframe><embed src="x"></svg>')

    refute_includes result, "<iframe"
    refute_includes result, "<embed"
  end

  # The publisher inlines module CSS next to this output; `</style>` here would
  # close that block and let the rest render as markup.
  def test_cannot_close_a_surrounding_style_block
    result = SvgSanitizer.call('<svg><style>a{}</style>x</svg>'.sub("</style>", "</style"))

    refute_match(%r{</style}i, result)
  end

  # Nothing outside an <svg> root belongs in an svg prop.
  def test_refuses_markup_that_is_not_an_svg
    assert_equal "", SvgSanitizer.call('<img src=x onerror="steal()">')
    assert_equal "", SvgSanitizer.call("")
    assert_equal "", SvgSanitizer.call(nil)
  end
end
