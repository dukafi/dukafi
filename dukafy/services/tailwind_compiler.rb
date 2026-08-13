require "fileutils"
require "open3"
require "tmpdir"

class TailwindCompiler
  class Error < StandardError; end

  # `site` — the site document, for its font tokens. Tailwind v4's `--font-*`
  # theme namespace generates a font-family utility per entry, so registering
  # the merchant's tokens turns `--font-primary` into a real `font-primary`
  # class they can put on any element.
  #
  # Without this a font could be installed and tokenised but never APPLIED:
  # the Styles panel writes `fontFamily` into `styleRules[].styles`, which the
  # Ruby publisher does not emit (it only forwards class NAMES to Tailwind), so
  # the only publishable way to set a family is a utility class — and none
  # existed for a merchant's own token.
  def self.call(html: nil, classes: nil, site: nil, binary: ENV.fetch("TAILWINDCSS_BIN", File.expand_path("../vendor/tailwindcss", __dir__)))
    # UNION, not either/or.
    #
    # Tailwind is usage-driven: it only emits a utility it has seen. Scanning
    # the rendered HTML alone misses every class that CAN appear but did not
    # this time — the inside of a cart region (which bakes as an empty
    # placeholder) and the losing side of every `visibleWhen` condition. Those
    # markups arrive later, from a fragment endpoint, by which point the
    # stylesheet is already written and has no rule for them.
    #
    # Callers that know the document therefore pass its DECLARED class names
    # as well, so a utility is compiled if it is reachable, not merely if it
    # happened to render.
    candidates = (Array(classes) + html.to_s.scan(/\bclass\s*=\s*(["'])(.*?)\1/m)
      .flat_map { |_quote, value| value.split })
      .select { |candidate| candidate.is_a?(String) && !candidate.empty? }
      .uniq
      .sort
    return "" if candidates.empty?
    raise Error, "Tailwind compiler is missing; run ruby scripts/install_tailwind.rb" unless File.executable?(binary)

    Dir.mktmpdir("dukafy-tailwind-") do |directory|
      source_path = File.join(directory, "published.html")
      input_path = File.join(directory, "tailwind.css")
      output_path = File.join(directory, "compiled.css")
      # Tailwind deliberately scans source as plain text. Feeding the full HTML
      # would make prose such as "flex" generate a utility even when it is not
      # a class. A candidate-only source enforces Dukafy's used-class contract.
      File.write(source_path, candidates.join("\n"))
      # Utilities are emitted UNLAYERED on purpose.
      #
      # Dukafy's reset (`:where(*) { margin: 0; padding: 0 }`) is unlayered,
      # and in the CSS cascade an unlayered declaration beats a layered one
      # NO MATTER the specificity. With utilities inside `@layer utilities`,
      # that zero-specificity reset silently defeated every padding and margin
      # utility — `p-5`, `px-6`, `py-20` all computed but never applied, while
      # colours, borders, grid and gap (which the reset doesn't touch) worked
      # fine. Unlayered, normal specificity applies and `.p-5` (0,1,0) wins.
      #
      # The theme layer stays: custom properties resolve regardless of layer.
      File.write(input_path, <<~CSS)
        @layer theme;
        @import "tailwindcss/theme.css" layer(theme);
        @import "tailwindcss/utilities.css" source(none);
        @source "./published.html";
        #{font_theme(site)}
      CSS
      _stdout, stderr, status = Open3.capture3(
        binary, "-i", input_path, "-o", output_path, "--minify", "--cwd", directory
      )
      raise Error, "Tailwind compilation failed: #{stderr.strip}" unless status.success?

      File.binread(output_path)
    end
  end

  # `@theme { --font-primary: "Saira", sans-serif; }` for each of the site's
  # font tokens. Tailwind reads the theme namespace to decide which utilities
  # exist, so this is what makes `font-primary` compile; the same variables are
  # emitted separately by `Publisher::FontsCss` for anything that references
  # `var(--font-primary)` directly.
  def self.font_theme(site)
    declarations = Dukafy::Publisher::FontsCss.theme_declarations(site)
    return "" if declarations.empty?

    "@theme {\n#{declarations.join("\n")}\n}"
  end
  private_class_method :font_theme
end
