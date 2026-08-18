require_relative "../spec_helper"
require "socket"
require "tmpdir"

# The sidecar is a Bun process. These specs do not start it — they assert that
# Ruby can reach whatever is listening, including a Unix socket, which is what
# the production image uses so the container has one TCP port.
class EditorSidecarSpec < Minitest::Test
  def setup
    @original = {
      "DUKAFI_SIDECAR_URL" => ENV["DUKAFI_SIDECAR_URL"],
      "DUKAFI_SIDECAR_SOCKET" => ENV["DUKAFI_SIDECAR_SOCKET"],
      "DUKAFI_SIDECAR_TOKEN" => ENV["DUKAFI_SIDECAR_TOKEN"],
    }
  end

  def teardown
    @original.each do |key, value|
      value.nil? ? ENV.delete(key) : ENV[key] = value
    end
  end

  def test_a_unix_socket_healthcheck_succeeds
    Dir.mktmpdir do |dir|
      socket = File.join(dir, "sidecar.sock")
      ENV["DUKAFI_SIDECAR_SOCKET"] = socket
      ENV.delete("DUKAFI_SIDECAR_URL")

      serve_unix(socket, body: '{"ok":true}') do
        assert EditorSidecar.healthy?
      end
    end
  end

  def test_apply_edits_over_a_unix_socket
    Dir.mktmpdir do |dir|
      socket = File.join(dir, "sidecar.sock")
      ENV["DUKAFI_SIDECAR_SOCKET"] = socket
      ENV["DUKAFI_SIDECAR_TOKEN"] = "spec-token"
      ENV.delete("DUKAFI_SIDECAR_URL")

      document = { "rootNodeId" => "root", "nodes" => { "root" => { "id" => "root" } } }
      payload = { "document" => document, "styleRules" => { "r" => {} }, "applied" => 1 }

      serve_unix(socket, body: JSON.generate(payload)) do
        result = EditorSidecar.call(document: document, style_rules: {}, edits: [{ "op" => "set" }])
        assert result.ok?
        assert_equal 1, result.applied
        assert_equal document, result.document
      end
    end
  end

  def test_a_unix_url_is_enough_without_the_socket_env
    Dir.mktmpdir do |dir|
      socket = File.join(dir, "sidecar.sock")
      ENV.delete("DUKAFI_SIDECAR_SOCKET")
      ENV["DUKAFI_SIDECAR_URL"] = "unix://#{socket}"

      serve_unix(socket, body: '{"ok":true}') do
        assert EditorSidecar.healthy?
      end
    end
  end

  def test_a_missing_socket_is_unreachable_not_an_exception
    ENV["DUKAFI_SIDECAR_SOCKET"] = "/tmp/dukafi-sidecar-does-not-exist.sock"
    ENV["DUKAFI_SIDECAR_TOKEN"] = "spec-token"
    ENV.delete("DUKAFI_SIDECAR_URL")

    result = EditorSidecar.call(
      document: { "rootNodeId" => "root", "nodes" => {} },
      style_rules: {},
      edits: [],
    )
    assert_equal "unreachable", result.reason
  end

  def serve_unix(path, body:)
    File.unlink(path) if File.exist?(path)
    server = UNIXServer.new(path)
    thread = Thread.new do
      sock = server.accept
      buf = +""
      buf << sock.readpartial(4096) until buf.include?("\r\n\r\n")
      if (match = buf.match(/Content-Length:\s*(\d+)/i))
        need = match[1].to_i
        _, remainder = buf.split("\r\n\r\n", 2)
        have = remainder.to_s.bytesize
        sock.read(need - have) if have < need
      end
      sock.write(
        "HTTP/1.1 200 OK\r\n" \
        "Content-Type: application/json\r\n" \
        "Content-Length: #{body.bytesize}\r\n" \
        "Connection: close\r\n" \
        "\r\n#{body}",
      )
      sock.close
    end
    thread.abort_on_exception = true
    yield
  ensure
    thread&.kill
    server&.close
    File.unlink(path) if path && File.exist?(path)
  end
end
