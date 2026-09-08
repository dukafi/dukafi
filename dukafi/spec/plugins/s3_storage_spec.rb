require_relative "../spec_helper"
require "stringio"

class S3StorageSpec < Minitest::Test
  FakeResponse = Struct.new(:code, :body) do
    def is_a?(klass)
      return Integer(code).between?(200, 299) if klass == Net::HTTPSuccess
      super
    end
  end

  def setup
    PluginSetting.dataset.delete
    @hits = []
    settings = Dukafi::Plugins::Settings.for("s3_storage")
    settings[:bucket] = "media"
    settings[:endpoint] = "http://127.0.0.1:9000"
    settings[:region] = "us-east-1"
    settings[:access_key] = "key"
    settings[:secret_key] = "secret"
    settings[:public_base_url] = "http://127.0.0.1:9000/media"
  end

  def with_http
    hits = @hits
    Net::HTTP.stub :start, ->(*_args, **_kwargs, &block) {
      http = Object.new
      http.define_singleton_method(:request) do |req|
        hits << { method: req.method, path: req.path, auth: req["authorization"], body: req.body.to_s }
        case req.method
        when "PUT" then FakeResponse.new("200", "")
        when "HEAD" then FakeResponse.new("200", "")
        when "DELETE" then FakeResponse.new("204", "")
        else FakeResponse.new("404", "")
        end
      end
      block.call(http)
    } do
      yield
    end
  end

  def test_sigv4_put_head_delete_and_url_generation
    with_http do
      stored = S3Storage::Adapter.store(io: StringIO.new("photo"), path: "uploads/a.png", content_type: "image/png")
      assert_includes stored.url, "uploads/a.png"
      assert S3Storage::Adapter.verify!
      S3Storage::Adapter.delete("uploads/a.png")
    end
    methods = @hits.map { |hit| hit[:method] }
    assert_includes methods, "PUT"
    assert_includes methods, "HEAD"
    assert_includes methods, "DELETE"
    assert @hits.any? { |hit| hit[:auth].to_s.start_with?("AWS4-HMAC-SHA256") }
  end

  def test_failures_raise
    Net::HTTP.stub :start, ->(*) { raise Errno::ECONNREFUSED, "Connection refused - connect(2)" } do
      error = assert_raises(StandardError) do
        S3Storage::Adapter.store(io: StringIO.new("x"), path: "uploads/x.png", content_type: "image/png")
      end
      assert_match(/S3|Connection refused|Failed to open/i, error.message)
    end
  end
end
