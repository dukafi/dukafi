require "net/http"
require "openssl"
require "digest"
require "uri"

module S3Storage
  module Adapter
    module_function
    def settings = Dukafi::Plugins::Settings.for("s3_storage").to_h

    def store(io:, path:, content_type:)
      body = io.read
      request(:put, path, body: body, content_type: content_type)
      MediaStorage::StoredFile.new(url: read_url(path), path: path)
    end

    def delete(path)
      request(:delete, path)
      nil
    end

    def read_url(path)
      base = settings[:public_base_url].to_s.sub(%r{/+\z}, "")
      base = "#{settings[:endpoint].to_s.sub(%r{/+\z}, '')}/#{settings[:bucket]}" if base.empty?
      "#{base}/#{escape_path(path)}"
    end

    def verify!
      request(:head, "")
      true
    end

    def request(method, path, body: "", content_type: nil)
      config = settings
      endpoint = URI.parse(config.fetch(:endpoint).to_s)
      raise "S3 endpoint must use HTTPS." unless endpoint.scheme == "https" || %w[localhost 127.0.0.1].include?(endpoint.host)
      canonical_uri = "/#{escape_path(config.fetch(:bucket))}"
      canonical_uri += "/#{escape_path(path)}" unless path.to_s.empty?
      uri = URI.join("#{endpoint}/", canonical_uri.delete_prefix("/"))
      now = Time.now.utc
      date = now.strftime("%Y%m%d")
      timestamp = now.strftime("%Y%m%dT%H%M%SZ")
      payload_hash = Digest::SHA256.hexdigest(body)
      headers = { "host" => uri.host, "x-amz-content-sha256" => payload_hash, "x-amz-date" => timestamp }
      headers["content-type"] = content_type if content_type
      signed = headers.keys.sort
      canonical_headers = signed.map { |key| "#{key}:#{headers[key]}\n" }.join
      canonical = [method.to_s.upcase, canonical_uri, "", canonical_headers, signed.join(";"), payload_hash].join("\n")
      scope = "#{date}/#{config.fetch(:region)}/s3/aws4_request"
      string_to_sign = ["AWS4-HMAC-SHA256", timestamp, scope, Digest::SHA256.hexdigest(canonical)].join("\n")
      key = hmac("AWS4#{config.fetch(:secret_key)}", date)
      key = hmac(key, config.fetch(:region).to_s)
      key = hmac(key, "s3")
      key = hmac(key, "aws4_request")
      signature = OpenSSL::HMAC.hexdigest("SHA256", key, string_to_sign)
      headers["authorization"] = "AWS4-HMAC-SHA256 Credential=#{config.fetch(:access_key)}/#{scope}, SignedHeaders=#{signed.join(';')}, Signature=#{signature}"
      klass = { put: Net::HTTP::Put, delete: Net::HTTP::Delete, head: Net::HTTP::Head }.fetch(method)
      req = klass.new(uri)
      headers.each { |name, value| req[name] = value }
      req.body = body unless body.empty?
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 10, read_timeout: 30) { |http| http.request(req) }
      raise "S3 returned HTTP #{response.code}." unless response.is_a?(Net::HTTPSuccess)
      response
    end

    def hmac(key, data) = OpenSSL::HMAC.digest("SHA256", key, data)
    def escape_path(path) = path.to_s.split("/").map { |part| URI.encode_www_form_component(part).gsub("+", "%20") }.join("/")
  end
end

Dukafi::Plugins.register("s3_storage") do |p|
  p.name "S3-compatible storage"
  p.version "1.0.0"
  p.setting :bucket, label: "Bucket"
  p.setting :endpoint, label: "Endpoint"
  p.setting :region, label: "Region"
  p.setting :access_key, label: "Access key"
  p.secret :secret_key, label: "Secret key"
  # Leave blank to use endpoint/bucket directly; Settings treats declared fields
  # as required, so the UI should fill this with the public bucket URL.
  p.setting :public_base_url, label: "Public base URL"
  p.media_storage "s3", S3Storage::Adapter, label: "S3-compatible"
end
