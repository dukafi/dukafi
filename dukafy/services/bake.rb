require "fileutils"
require "securerandom"

class Bake
  Result = Data.define(:version, :page_count, :slot)
  SAFE_SLUG = /\A[a-zA-Z0-9][a-zA-Z0-9_\/-]*\z/

  def self.call(
    state: SiteState.first,
    pages: Page.where(kind: "page", status: "published").order(:id).all,
    output_root: File.expand_path("../published", __dir__),
    registry: Dukafy::Publisher::REGISTRY,
    use_draft: false,
    commit: nil,
    tailwind_compiler: TailwindCompiler
  )
    new(state:, pages:, output_root:, registry:, use_draft:, commit:, tailwind_compiler:).call
  end

  def initialize(state:, pages:, output_root:, registry:, use_draft:, commit:, tailwind_compiler:)
    @state = state
    @pages = pages
    @output_root = File.expand_path(output_root)
    @registry = registry
    @use_draft = use_draft
    @commit = commit
    @tailwind_compiler = tailwind_compiler
  end

  def call
    raise ArgumentError, "site state is required" unless @state
    raise ArgumentError, "unsafe publish root" if @output_root == File::SEPARATOR

    version = @state.publish_version + 1
    slot_name = "slot_#{version % 2}"
    slot_path = File.join(@output_root, slot_name)
    previous_slot = current_slot
    flipped = false
    prepare_slot(slot_path)

    begin
      rendered_pages = @pages.map { |page| [page, render_page(page)] }
      tailwind_html = rendered_pages.map do |_page, rendered|
        %(<body class="#{rendered.body_classes.join(' ')}">#{rendered.html}</body>)
      end.join("\n")
      tailwind_css = @tailwind_compiler.call(html: tailwind_html)
      rendered_pages.each { |page, rendered| bake_page(page, rendered, tailwind_css, slot_path) }
      flip_current(slot_name)
      flipped = true
      if @commit
        @commit.call(version)
      else
        @state.update(publish_version: version)
      end
    rescue StandardError
      restore_current(previous_slot) if flipped
      FileUtils.rm_rf(slot_path)
      raise
    end

    Result.new(version: version, page_count: @pages.length, slot: slot_name)
  end

  private

  def prepare_slot(slot_path)
    FileUtils.mkdir_p(@output_root)
    FileUtils.rm_rf(slot_path)
    FileUtils.mkdir_p(File.join(slot_path, "assets"))
  end

  def render_page(page)
    document = @use_draft ? page.document_data : (page.published_document_data || page.document_data)
    Dukafy::Publisher::RenderPage.call(document:, registry: @registry, site: @state.site)
  end

  def bake_page(page, rendered, tailwind_css, slot_path)
    relative_html = html_path(page.slug)
    collector = Dukafy::Publisher::CssCollector.new
    collector.add("page-modules", rendered.css)
    framework = Dukafy::Publisher::FrameworkCss.call(@state.site)
    bundle = collector.bundle(framework_css: framework, tailwind_css: tailwind_css)

    File.write(File.join(slot_path, "assets", bundle.filename), bundle.content)
    destination = File.join(slot_path, relative_html)
    FileUtils.mkdir_p(File.dirname(destination))
    File.write(destination, html_document(page, rendered, bundle.filename))
  end

  def html_path(slug)
    value = slug.to_s
    raise ArgumentError, "unsafe page slug #{value.inspect}" unless value.match?(SAFE_SLUG)
    raise ArgumentError, "unsafe page slug #{value.inspect}" if value.split("/").include?("..")

    value == "index" ? "index.html" : "#{value}.html"
  end

  def html_document(page, rendered, css_filename)
    language = @state.site.dig("settings", "language") || "en"
    title = @state.site.dig("settings", "metaTitle") || page.title
    description = @state.site.dig("settings", "metaDescription")
    Dukafy::Publisher::HtmlDocument.call(
      title:, body: rendered.html, body_classes: rendered.body_classes,
      language:, description:, css_href: "/assets/#{bundle_name(css_filename)}"
    )
  end

  def bundle_name(filename)
    raise ArgumentError, "unsafe CSS filename" unless filename.match?(/\Asite-[0-9a-f]{12}\.css\z/)

    filename
  end

  def flip_current(slot_name)
    current = File.join(@output_root, "current")
    temporary = File.join(@output_root, ".current-#{SecureRandom.hex(6)}")
    File.symlink(slot_name, temporary)
    File.rename(temporary, current)
  ensure
    File.delete(temporary) if temporary && File.symlink?(temporary)
  end

  def current_slot
    current = File.join(@output_root, "current")
    File.symlink?(current) ? File.readlink(current) : nil
  end

  def restore_current(slot_name)
    current = File.join(@output_root, "current")
    if slot_name
      flip_current(slot_name)
    else
      File.delete(current) if File.symlink?(current)
    end
  end
end
