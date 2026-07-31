require "cgi"
require "fileutils"
require "securerandom"

class Bake
  Result = Data.define(:version, :page_count, :slot)
  SAFE_SLUG = /\A[a-zA-Z0-9][a-zA-Z0-9_\/-]*\z/

  def self.call(
    state: SiteState.first,
    pages: Page.where(kind: "page", status: "published").order(:id).all,
    output_root: File.expand_path("../published", __dir__),
    registry: Dukafy::Publisher::REGISTRY
  )
    new(state:, pages:, output_root:, registry:).call
  end

  def initialize(state:, pages:, output_root:, registry:)
    @state = state
    @pages = pages
    @output_root = File.expand_path(output_root)
    @registry = registry
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
      @pages.each { |page| bake_page(page, slot_path) }
      flip_current(slot_name)
      flipped = true
      @state.update(publish_version: version)
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

  def bake_page(page, slot_path)
    relative_html = html_path(page.slug)
    document = page.published_document_data || page.document_data
    rendered = Dukafy::Publisher::RenderPage.call(document:, registry: @registry)
    collector = Dukafy::Publisher::CssCollector.new
    collector.add("page-modules", rendered.css)
    framework = Dukafy::Publisher::FrameworkCss.call(@state.site)
    bundle = collector.bundle(framework_css: framework)

    File.write(File.join(slot_path, "assets", bundle.filename), bundle.content)
    destination = File.join(slot_path, relative_html)
    FileUtils.mkdir_p(File.dirname(destination))
    File.write(destination, html_document(page, rendered.html, bundle.filename))
  end

  def html_path(slug)
    value = slug.to_s
    raise ArgumentError, "unsafe page slug #{value.inspect}" unless value.match?(SAFE_SLUG)
    raise ArgumentError, "unsafe page slug #{value.inspect}" if value.split("/").include?("..")

    value == "index" ? "index.html" : "#{value}.html"
  end

  def html_document(page, body, css_filename)
    language = @state.site.dig("settings", "language") || "en"
    title = @state.site.dig("settings", "metaTitle") || page.title
    description = @state.site.dig("settings", "metaDescription")
    description_tag = description ? %(<meta name="description" content="#{CGI.escapeHTML(description)}">) : ""
    %(<!doctype html><html lang="#{CGI.escapeHTML(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>#{CGI.escapeHTML(title)}</title>#{description_tag}<link rel="stylesheet" href="/assets/#{bundle_name(css_filename)}"></head><body>#{body}</body></html>)
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
