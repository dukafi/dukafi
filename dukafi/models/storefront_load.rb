# Aggregated storefront page views: successful HTML loads, by day and path.
#
# This is not unique visitors. Two loads of `/` on the same day are two
# views, whether they came from one browser or two. IP and cookies are not
# used to invent an audience.
class StorefrontLoad < Sequel::Model
  MAX_PATH = 200
  SKIP_PREFIXES = %w[/assets/ /admin /uploads /fragments /forms /payments /plugins].freeze
  SKIP_EXACT = %w[/robots.txt /favicon.ico].freeze
  SKIP_SUFFIXES = %w[
    .css .js .map .xml .txt .json .ico .png .jpg .jpeg .gif .webp .svg .woff .woff2
  ].freeze

  def self.record_from_rack!(env, status, headers)
    return unless env["REQUEST_METHOD"].to_s.upcase == "GET"
    return unless status.to_i == 200
    return unless html?(headers)

    path = normalize_path(env["PATH_INFO"])
    return unless path
    return if skip_path?(path)

    record!(path: path)
  end

  def self.record!(path:, at: Time.now)
    normalized = normalize_path(path)
    return unless normalized
    return if skip_path?(normalized)

    day = at.to_date
    updated = where(day: day, path: normalized).update(views: Sequel[:views] + 1)
    return self if updated == 1

    create(day: day, path: normalized, views: 1)
  rescue Sequel::UniqueConstraintViolation
    where(day: day, path: normalized).update(views: Sequel[:views] + 1)
    self
  end

  def self.normalize_path(raw)
    path = raw.to_s.split("?", 2).first.to_s
    path = "/#{path}" unless path.start_with?("/")
    path = path.gsub(%r{/+}, "/")
    path = path.sub(%r{/+\z}, "")
    path = "/" if path.empty?
    return if path.include?("\0") || path.include?("..")
    return if path.bytesize > MAX_PATH

    path
  end

  def self.skip_path?(path)
    return true if SKIP_EXACT.include?(path)
    return true if SKIP_PREFIXES.any? { |prefix| prefixed?(path, prefix) }
    lower = path.downcase
    SKIP_SUFFIXES.any? { |suffix| lower.end_with?(suffix) }
  end

  def self.html?(headers)
    type = header(headers, "content-type").to_s.downcase
    type.include?("text/html")
  end

  def self.header(headers, name)
    headers.each do |key, value|
      return value if key.to_s.downcase == name
    end
    nil
  end

  def self.prefixed?(path, prefix)
    return path == prefix.chomp("/") || path.start_with?(prefix) if prefix.end_with?("/")

    path == prefix || path.start_with?("#{prefix}/")
  end
  private_class_method :prefixed?, :header
end
