require "fileutils"
require "securerandom"

class Bake
  Result = Data.define(:version, :page_count, :slot)
  Entry = Data.define(:path, :title, :rendered, :product_ids)
  SAFE_SLUG = /\A[a-zA-Z0-9][a-zA-Z0-9_\/-]*\z/

  def self.call(
    state: SiteState.first,
    pages: Page.where(kind: "page", status: "published").order(:id).all,
    product_template: nil,
    collection_template: nil,
    output_root: File.expand_path("../published", __dir__),
    registry: Dukafy::Publisher::REGISTRY,
    use_draft: false,
    commit: nil,
    tailwind_compiler: TailwindCompiler
  )
    new(state:, pages:, product_template:, collection_template:, output_root:, registry:, use_draft:, commit:, tailwind_compiler:).call
  end

  def initialize(state:, pages:, product_template:, collection_template:, output_root:, registry:, use_draft:, commit:, tailwind_compiler:)
    @state = state
    @pages = pages
    published_templates = Page.where(kind: "template", status: "published").order(:id).all
    @product_template = product_template || template_for(published_templates, "products")
    @collection_template = collection_template || template_for(published_templates, "collections")
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
      prefetched = CommercePrefetcher.call
      entries = page_entries(prefetched) + product_entries(prefetched) + collection_entries(prefetched)
      tailwind_html = entries.map do |entry|
        %(<body class="#{entry.rendered.body_classes.join(' ')}">#{entry.rendered.html}</body>)
      end.join("\n")
      tailwind_css = @tailwind_compiler.call(html: tailwind_html)
      entries.each { |entry| bake_entry(entry, tailwind_css, slot_path) }
      flip_current(slot_name)
      flipped = true
      DB.transaction do
        DependencyTracker.replace!(entries.to_h { |entry| [dependency_path(entry.path), entry.product_ids] })
        if @commit
          @commit.call(version)
        else
          @state.update(publish_version: version)
        end
      end
    rescue StandardError
      restore_current(previous_slot) if flipped
      FileUtils.rm_rf(slot_path)
      raise
    end

    Result.new(version: version, page_count: entries.length, slot: slot_name)
  end

  private

  def dependency_path(path)
    path == "index" ? "/" : "/#{path}"
  end

  def template_for(templates, table_slug)
    templates.find do |template|
      template.document_data.dig("template", "target", "tableSlugs")&.include?(table_slug)
    end
  end

  def prepare_slot(slot_path)
    FileUtils.mkdir_p(@output_root)
    FileUtils.rm_rf(slot_path)
    FileUtils.mkdir_p(File.join(slot_path, "assets"))
  end

  def page_entries(prefetched)
    @pages.map do |page|
      document = render_document(page)
      Entry.new(
        path: page.slug, title: page.title,
        rendered: render_document_data(document, prefetched:),
        product_ids: DependencyTracker.product_ids(document:, prefetched:)
      )
    end
  end

  def product_entries(prefetched)
    return [] unless @product_template

    prefetched.fetch("products", {}).values.map do |product|
      Entry.new(
        path: "products/#{product.fetch('slug')}", title: product.fetch("title"),
        rendered: render_page(@product_template, prefetched:, current_entry: product),
        product_ids: DependencyTracker.product_ids(
          document: render_document(@product_template), prefetched:, current_entry: product
        )
      )
    end
  end

  def collection_entries(prefetched)
    return [] unless @collection_template

    prefetched.fetch("collections", {}).values.map do |collection|
      Entry.new(
        path: "collections/#{collection.fetch('slug')}", title: collection.fetch("title"),
        rendered: render_page(@collection_template, prefetched:, current_entry: collection),
        product_ids: DependencyTracker.product_ids(
          document: render_document(@collection_template), prefetched:, current_entry: collection
        )
      )
    end
  end

  def render_page(page, prefetched:, current_entry: nil)
    render_document_data(render_document(page), prefetched:, current_entry:)
  end

  def render_document(page)
    @use_draft ? page.document_data : (page.published_document_data || page.document_data)
  end

  def render_document_data(document, prefetched:, current_entry: nil)
    Dukafy::Publisher::RenderPage.call(
      document:, registry: @registry, site: @state.site, prefetched:, current_entry:
    )
  end

  def bake_entry(entry, tailwind_css, slot_path)
    relative_html = html_path(entry.path)
    collector = Dukafy::Publisher::CssCollector.new
    collector.add("page-modules", entry.rendered.css)
    framework = Dukafy::Publisher::FrameworkCss.call(@state.site)
    bundle = collector.bundle(framework_css: framework, tailwind_css: tailwind_css)

    File.write(File.join(slot_path, "assets", bundle.filename), bundle.content)
    destination = File.join(slot_path, relative_html)
    FileUtils.mkdir_p(File.dirname(destination))
    File.write(destination, html_document(entry.title, entry.rendered, bundle.filename))
  end

  def html_path(slug)
    value = slug.to_s
    raise ArgumentError, "unsafe page slug #{value.inspect}" unless value.match?(SAFE_SLUG)
    raise ArgumentError, "unsafe page slug #{value.inspect}" if value.split("/").include?("..")

    value == "index" ? "index.html" : "#{value}.html"
  end

  def html_document(entry_title, rendered, css_filename)
    language = @state.site.dig("settings", "language") || "en"
    title = @state.site.dig("settings", "metaTitle") || entry_title
    description = @state.site.dig("settings", "metaDescription")
    Dukafy::Publisher::HtmlDocument.call(
      title:, body: rendered.html, body_classes: rendered.body_classes,
      language:, description:, css_href: "/assets/#{bundle_name(css_filename)}",
      runtimes: rendered.runtimes
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
