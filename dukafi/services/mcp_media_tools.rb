require "base64"
require "json"

# Media, for an external agent.
#
# No delete tool, deliberately: removing an asset breaks every page and
# product that references it, silently, with no undo and no draft. Metadata is
# safe for an agent to change; the file is not.
#
# Upload takes bytes two ways — base64 for a client that can read a local file
# (Claude Code can), or an https URL the server fetches. Both land in
# `MediaIntake`, which decides the file type by SNIFFING THE BYTES rather than
# believing the caller, sanitises SVG, and refuses to fetch anything resolving
# to a private address.
#
# The PATH is the handle. `/uploads/ab12-hero.png` is what goes in an <img
# src> when an agent adds a picture to a page through `apply_edits`, so
# `list_media` exists mainly so a model can find that string rather than
# invent one.
module McpMediaTools
  MAX_LIMIT = 100
  DEFAULT_LIMIT = 50

  module_function

  def all
    [list_media, read_media, upload_media, update_media, set_product_images, set_product_og_image, set_collection_image]
  end

  READ_TOOLS = %w[list_media read_media].freeze

  def summary(asset)
    {
      "id" => asset.id.to_s,
      "path" => "/#{asset.path}",
      "filename" => File.basename(asset.path),
      "mimeType" => asset.mime,
      "width" => asset.width, "height" => asset.height,
      "altText" => asset.alt_text.to_s,
      "title" => asset.title.to_s,
      "tags" => asset.tags,
      # The single most useful thing to surface: an image with no alt text is
      # invisible to a screen reader and to a search engine, and nothing else
      # in the payload makes that obvious at a glance.
      "needsAltText" => asset.image? && asset.alt_text.to_s.strip.empty?,
    }
  end

  def detail(asset)
    summary(asset).merge(
      "caption" => asset.caption.to_s,
      "usedByProducts" => asset.products.map(&:slug),
      "variants" => asset.variants.map { |variant| variant["path"] },
      "createdAt" => asset.created_at&.utc&.iso8601,
    )
  end

  def find!(reference)
    value = reference.to_s.strip
    raise McpTools::ArgumentError, "id or path is required" if value.empty?

    asset =
      if value.match?(/\A\d+\z/)
        MediaAsset[value.to_i]
      else
        MediaAsset.first(path: value.delete_prefix("/"))
      end

    asset || raise(McpTools::ArgumentError,
                   "No media matching #{value.inspect}. Call list_media to see what exists.")
  end

  def clamp_limit(value)
    (Integer(value, exception: false) || DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
  end

  # ── Reads ──────────────────────────────────────────────────────────────────

  def list_media
    {
      name: "list_media",
      title: "List media",
      description: "Every uploaded image and file. The PATH (\"/uploads/...\") " \
                   "is what goes in an <img src> when you add a picture to a " \
                   "page with apply_edits — find it here rather than guessing. " \
                   "`needsAltText` flags images nobody has described yet.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "search" => { "type" => "string",
                        "description" => "Match against filename, title, alt text or tags." },
          "missingAltText" => { "type" => "boolean",
                                "description" => "Only images with no alt text." },
          "limit" => { "type" => "integer", "minimum" => 1, "maximum" => MAX_LIMIT },
        },
        "additionalProperties" => false,
      },
      run: lambda do |args|
        rows = MediaAsset.order(Sequel.desc(:created_at)).all

        if (needle = args["search"].to_s.strip.downcase) && !needle.empty?
          rows = rows.select do |asset|
            [asset.path, asset.title, asset.alt_text, asset.tags.join(" ")]
              .join(" ").downcase.include?(needle)
          end
        end

        rows = rows.select { |asset| asset.image? && asset.alt_text.to_s.strip.empty? } if args["missingAltText"]

        limited = rows.first(clamp_limit(args["limit"]))
        {
          "media" => limited.map { |asset| summary(asset) },
          "total" => rows.length,
          "missingAltText" => MediaAsset.all.count { |a| a.image? && a.alt_text.to_s.strip.empty? },
        }
      end,
    }
  end

  def read_media
    {
      name: "read_media",
      title: "Read a media asset",
      description: "One asset in full, including its caption, its generated " \
                   "responsive variants, and which products use it.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "reference" => { "type" => "string",
                           "description" => "The asset id, or its path (\"/uploads/...\")." },
        },
        "required" => ["reference"], "additionalProperties" => false,
      },
      run: ->(args) { detail(find!(args["reference"])) },
    }
  end

  # ── Upload ─────────────────────────────────────────────────────────────────

  def upload_media
    {
      name: "upload_media",
      title: "Upload an image",
      description: "Add a new image, either from base64 `data` or by giving a " \
                   "`url` for the server to download. PNG, JPEG, WebP, GIF and " \
                   "SVG, up to 10 MB. Responsive WebP variants are generated " \
                   "automatically. Set altText in the same call — describing it " \
                   "later is how images end up undescribed.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "filename" => { "type" => "string", "description" => "E.g. \"blue-shirt.jpg\"." },
          "data" => { "type" => "string", "description" => "Base64-encoded file bytes." },
          "url" => { "type" => "string", "description" => "An https:// URL to download instead." },
          "altText" => { "type" => "string", "description" => "What the image shows." },
        },
        "additionalProperties" => false,
      },
      run: lambda do |args|
        data = args["data"].to_s
        url = args["url"].to_s
        if data.empty? == url.empty?
          raise McpTools::ArgumentError, "Give exactly one of `data` (base64) or `url`."
        end

        asset =
          begin
            if url.empty?
              bytes =
                begin
                  # `strict_decode64` so silently-truncated base64 fails here
                  # rather than becoming a corrupt file on disk.
                  Base64.strict_decode64(data.gsub(/\s+/, ""))
                rescue ::ArgumentError
                  raise McpTools::ArgumentError, "`data` is not valid base64."
                end
              MediaIntake.from_bytes!(bytes: bytes, filename: args.fetch("filename", "upload"),
                                      alt_text: args.fetch("altText", ""))
            else
              MediaIntake.from_url!(url: url, filename: args["filename"],
                                    alt_text: args.fetch("altText", ""))
            end
          rescue MediaIntake::Invalid => e
            raise McpTools::ArgumentError, e.message
          end

        detail(asset).merge(
          "note" => "Uploaded. Use its `path` in an <img src> via apply_edits, " \
                    "or attach it to a product with set_product_images.",
        )
      end,
    }
  end

  # ── Update ─────────────────────────────────────────────────────────────────

  def update_media
    {
      name: "update_media",
      title: "Describe a media asset",
      description: "Set alt text, title, caption or tags. ALT TEXT is the one " \
                   "that matters: it is what a screen reader announces and what " \
                   "a search engine reads, and it appears in the published HTML " \
                   "immediately. Describe what the image SHOWS, in a sentence — " \
                   "not \"photo of\" or the filename. Leave it empty only for " \
                   "purely decorative images. Fields you omit keep their value.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "reference" => { "type" => "string", "description" => "The asset id, or its path." },
          "altText" => { "type" => "string", "description" => "What the image shows." },
          "title" => { "type" => "string" },
          "caption" => { "type" => "string" },
          "tags" => { "type" => "array", "items" => { "type" => "string" } },
        },
        "required" => ["reference"], "additionalProperties" => false,
      },
      run: lambda do |args|
        asset = find!(args["reference"])
        params = args.slice("altText", "title", "caption", "tags")
        raise McpTools::ArgumentError, "Nothing to change. Pass altText, title, caption or tags." if params.empty?

        detail(asset.apply_metadata!(params))
      end,
    }
  end

  # ── Product images ─────────────────────────────────────────────────────────

  def set_product_images
    {
      name: "set_product_images",
      title: "Set a product's images",
      description: "Attach images to a product, in order — the FIRST is the one " \
                   "product cards and listings show. The share / Open Graph image " \
                   "defaults to the first too unless set_product_og_image picked " \
                   "another. Send every image the product should have: anything " \
                   "omitted is detached (the file itself is not deleted). Paths " \
                   "come from list_media. This changes the live storefront immediately.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "productSlug" => { "type" => "string" },
          "media" => {
            "type" => "array",
            "items" => { "type" => "string" },
            "description" => "Asset ids or paths, in display order. The complete list, not a delta.",
          },
        },
        "required" => %w[productSlug media], "additionalProperties" => false,
      },
      run: lambda do |args|
        product = McpCommerceTools.find_product!(args["productSlug"])
        assets = Array(args["media"]).map { |reference| find!(reference) }
        McpCommerceTools.writing { CommerceWrites.set_product_images!(product, assets.map(&:id)) }
        McpCommerceTools.product_detail(product.refresh)
      end,
    }
  end

  def set_product_og_image
    {
      name: "set_product_og_image",
      title: "Set a product's Open Graph image",
      description: "Pick which attached product image is used for link previews " \
                   "on /products/{slug} (og:image). Pass a path from list_media " \
                   "that is already on the product, or an empty string to fall " \
                   "back to the first product image. This changes the live " \
                   "storefront immediately.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "productSlug" => { "type" => "string" },
          "media" => {
            "type" => "string",
            "description" => "Asset id or path already attached to the product. Empty string clears the override.",
          },
        },
        "required" => %w[productSlug media],
        "additionalProperties" => false,
      },
      run: lambda do |args|
        product = McpCommerceTools.find_product!(args["productSlug"])
        reference = args["media"].to_s.strip
        asset = reference.empty? ? nil : find!(reference)
        McpCommerceTools.writing { CommerceWrites.set_product_og_image!(product, asset&.id) }
        McpCommerceTools.product_detail(product.refresh)
      end,
    }
  end

  def set_collection_image
    {
      name: "set_collection_image",
      title: "Set a collection's cover image",
      description: "Attach one cover photo to a collection — the image on " \
                   "the collection page, not a product packshot. Pass a path " \
                   "from list_media, or an empty string to clear it. This " \
                   "changes the live storefront immediately.",
      input_schema: {
        "type" => "object",
        "properties" => {
          "slug" => { "type" => "string", "description" => "The collection." },
          "media" => {
            "type" => "string",
            "description" => "Asset id or path. Empty string clears the cover.",
          },
        },
        "required" => %w[slug media], "additionalProperties" => false,
      },
      run: lambda do |args|
        collection = McpCommerceTools.find_collection!(args["slug"])
        reference = args["media"].to_s.strip
        asset = reference.empty? ? nil : find!(reference)
        McpCommerceTools.writing { CommerceWrites.set_collection_image!(collection, asset) }
        McpCommerceTools.collection_detail(collection.refresh)
      end,
    }
  end
end
