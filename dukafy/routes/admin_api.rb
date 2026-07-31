require "bcrypt"
require "digest"
require "fileutils"
require "json"
require "securerandom"

class AdminApi < Roda
  plugin :all_verbs
  plugin :sessions, secret: ENV.fetch("SESSION_SECRET") { "dev-secret-change-me-" + "x" * 64 }
  plugin :json
  plugin :json_parser

  CAPABILITIES = %w[
    content.create content.edit.any content.manage content.publish.any
    data.custom.tables.read data.system.tables.read media.delete media.read media.replace media.write
    pages.edit site.content.edit site.structure.edit site.style.edit system
  ].freeze

  def error_payload(code, message)
    { error: { code: code, message: message } }
  end

  def halt_json(status, code, message)
    request.halt([status, { "content-type" => "application/json" }, [JSON.generate(error_payload(code, message))]])
  end

  def current_admin
    admin_id = session["admin_id"]
    admin_id && Admin[admin_id]
  end

  def require_admin!
    current_admin || halt_json(401, "unauthorized", "Authentication required")
  end

  def user_payload(admin)
    timestamp = admin.created_at.utc.iso8601
    role = {
      id: "owner", slug: "owner", name: "Owner", description: "Store owner",
      isSystem: true, capabilities: CAPABILITIES,
    }
    {
      id: admin.id.to_s, email: admin.email, displayName: admin.email.split("@").first,
      status: "active", role: role, capabilities: CAPABILITIES, lastLoginAt: nil,
      failedLoginCount: 0, lockedUntil: nil, passwordUpdatedAt: nil, mfaEnabled: false,
      mfaEnabledAt: nil, mfaRecoveryCodesRemaining: 0, stepUpAuthMode: "disabled",
      stepUpWindowMinutes: 15, avatarMediaId: nil, avatarUrl: nil,
      gravatarHash: Digest::SHA256.hexdigest(admin.email.strip.downcase),
      createdAt: timestamp, updatedAt: admin.updated_at.utc.iso8601,
    }
  end

  def data_row(page)
    document = page.document_data
    now = page.updated_at.utc.iso8601
    {
      id: page.id.to_s, tableId: "pages",
      cells: {
        title: page.title, slug: page.slug,
        body: { nodes: document.fetch("nodes"), rootNodeId: document.fetch("rootNodeId") },
      },
      slug: page.slug, status: page.status == "published" ? "published" : "draft", seq: 0,
      authorUserId: nil, createdByUserId: nil, updatedByUserId: nil, publishedByUserId: nil,
      author: nil, createdBy: nil, updatedBy: nil, publishedBy: nil,
      createdAt: page.created_at.utc.iso8601, updatedAt: now, publishedAt: nil,
      scheduledPublishAt: nil, deletedAt: nil,
    }
  end

  def media_payload(asset)
    full_path = File.expand_path("../#{asset.path}", __dir__)
    {
      id: asset.id.to_s, filename: File.basename(asset.path), mimeType: asset.mime,
      sizeBytes: File.exist?(full_path) ? File.size(full_path) : 0,
      publicPath: "/#{asset.path}", uploadedByUserId: nil, createdAt: asset.created_at.utc.iso8601,
    }
  end

  def save_page!(raw)
    id = raw.fetch("id").to_s
    page = Page[id.to_i]
    document = raw
    attrs = { slug: raw.fetch("slug"), title: raw.fetch("title"), document: document }
    if page
      page.update(attrs)
    else
      Page.create(attrs.merge(kind: "page", status: "draft"))
    end
  end

  route do |r|
    r.get("health") { { ok: true } }

    r.on("cms") do
      r.get("setup", "status") do
        has_admin = !Admin.first.nil?
        { hasSite: !SiteState.first.nil?, hasAdmin: has_admin, hasOwner: has_admin, needsSetup: !has_admin }
      end

      r.get("public-site") do
        state = SiteState.first
        { name: state&.site&.fetch("name", nil), faviconUrl: nil }
      end

      r.post("setup") do
        halt_json(409, "already_setup", "Setup is already complete") if Admin.first
        password = r.params.fetch("password", "")
        halt_json(422, "invalid_password", "Password must be at least 12 characters") if password.length < 12
        email = r.params.fetch("email").strip.downcase
        DB.transaction do
          Admin.create(email: email, password_digest: BCrypt::Password.create(password))
          StarterSite.create!(name: r.params.fetch("siteName", "Dukafy Store"))
        end
        response.status = 201
        { ok: true }
      end

      r.post("login") do
        admin = Admin.first(email: r.params.fetch("email", "").strip.downcase)
        valid = admin && BCrypt::Password.new(admin.password_digest) == r.params.fetch("password", "")
        halt_json(401, "invalid_credentials", "Invalid email or password") unless valid
        session["admin_id"] = admin.id
        { ok: true, mfaRequired: false }
      end

      r.post("logout") do
        session.delete("admin_id")
        { ok: true }
      end

      r.get("me") do
        admin = require_admin!
        { user: user_payload(admin), role: user_payload(admin)[:role], capabilities: CAPABILITIES }
      end

      r.get("site") do
        require_admin!
        state = SiteState.first || halt_json(404, "site_not_found", "Site has not been created")
        { site: state.site, seq: state.seq }
      end

      r.get("pages") do
        require_admin!
        { rows: Page.where(kind: "page").order(:id).map { |page| data_row(page) } }
      end

      r.get("components") { require_admin!; { rows: [] } }
      r.get("layouts") { require_admin!; { rows: [] } }

      r.put("site-document") do
        require_admin!
        state = SiteState.first || halt_json(404, "site_not_found", "Site has not been created")
        changed_pages = r.params.fetch("changedPages", [])
        DB.transaction do
          state.site = r.params.fetch("site")
          state.seq += 1
          state.save
          changed_pages.each { |page| save_page!(page) }
          r.params.fetch("deletedPageIds", []).each { |id| Page[id.to_i]&.destroy }
        end
        { ok: true, seq: state.seq }
      end

      r.on("pages") do
        require_admin!
        r.post do
          page = save_page!(r.params)
          response.status = 201
          { row: data_row(page) }
        end
        r.on(String) do |id|
          page = Page[id.to_i] || halt_json(404, "page_not_found", "Page not found")
          r.patch do
            attrs = r.params.slice("slug", "title").transform_keys(&:to_sym)
            page.update(attrs)
            { row: data_row(page) }
          end
          r.delete do
            page.destroy
            response.status = 204
            ""
          end
        end
      end

      r.on("media") do
        require_admin!
        r.is do
          r.get { { assets: MediaAsset.order(Sequel.desc(:created_at)).map { |asset| media_payload(asset) } } }
          r.post do
            upload = r.params["file"] || halt_json(422, "file_required", "A file is required")
            original = File.basename(upload[:filename].to_s)
            safe_name = original.gsub(/[^a-zA-Z0-9._-]/, "-")
            stored_name = "#{SecureRandom.hex(8)}-#{safe_name}"
            relative_path = File.join("uploads", stored_name)
            destination = File.expand_path("../#{relative_path}", __dir__)
            FileUtils.copy_file(upload[:tempfile].path, destination)
            asset = MediaAsset.create(path: relative_path, mime: upload[:type] || "application/octet-stream")
            response.status = 201
            { asset: media_payload(asset) }
          end
        end
        r.get("folders") { { folders: [] } }
        r.on(String) do |id|
          asset = MediaAsset[id.to_i] || halt_json(404, "media_not_found", "Media asset not found")
          r.delete do
            path = File.expand_path("../#{asset.path}", __dir__)
            File.delete(path) if File.file?(path)
            asset.destroy
            response.status = 204
            ""
          end
        end
      end

      halt_json(404, "not_found", "API endpoint not found")
    end

    r.on("auth") do
      r.post("login") { r.redirect("/admin/api/cms/login", 307) }
      r.get("me") { r.redirect("/admin/api/cms/me", 307) }
    end

    halt_json(404, "not_found", "API endpoint not found")
  rescue Sequel::ValidationFailed, Sequel::UniqueConstraintViolation, KeyError => e
    halt_json(422, "validation_error", e.message)
  rescue JSON::ParserError => e
    halt_json(400, "invalid_json", e.message)
  end
end
