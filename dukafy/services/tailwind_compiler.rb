require "fileutils"
require "open3"
require "tmpdir"

class TailwindCompiler
  class Error < StandardError; end

  def self.call(html: nil, classes: nil, binary: ENV.fetch("TAILWINDCSS_BIN", File.expand_path("../vendor/tailwindcss", __dir__)))
    candidates = (classes || html.to_s.scan(/\bclass\s*=\s*(["'])(.*?)\1/m)
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
      File.write(input_path, <<~CSS)
        @layer theme, utilities;
        @import "tailwindcss/theme.css" layer(theme);
        @import "tailwindcss/utilities.css" layer(utilities) source(none);
        @source "./published.html";
      CSS
      _stdout, stderr, status = Open3.capture3(
        binary, "-i", input_path, "-o", output_path, "--minify", "--cwd", directory
      )
      raise Error, "Tailwind compilation failed: #{stderr.strip}" unless status.success?

      File.binread(output_path)
    end
  end
end
