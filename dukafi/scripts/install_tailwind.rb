require "digest"
require "fileutils"
require "open-uri"
require "rbconfig"
require "tempfile"

VERSION = "4.3.0"
LINUX_X64_SHA256 = "73f0e5459054e5cfaa8ab6f3b940f3fbe0f13cc7fd83bc24e7c655033c203400"
destination = File.expand_path("../vendor/tailwindcss", __dir__)

if File.file?(destination) && Digest::SHA256.file(destination).hexdigest == LINUX_X64_SHA256
  puts "tailwindcss v#{VERSION} ready"
  exit
end

platform = [RbConfig::CONFIG.fetch("host_os"), RbConfig::CONFIG.fetch("host_cpu")]
unless platform[0].match?(/linux/) && platform[1].match?(/x86_64|amd64/)
  abort "Tailwind standalone setup currently supports Linux x86_64; set TAILWINDCSS_BIN to a v#{VERSION} executable for this platform"
end

url = "https://github.com/tailwindlabs/tailwindcss/releases/download/v#{VERSION}/tailwindcss-linux-x64"
FileUtils.mkdir_p(File.dirname(destination))
Tempfile.create("dukafi-tailwind") do |file|
  puts "downloading tailwindcss v#{VERSION} (one-time, about 119 MB)..."
  URI.open(url, "rb") { |source| IO.copy_stream(source, file) }
  file.flush
  actual = Digest::SHA256.file(file.path).hexdigest
  abort "Tailwind checksum mismatch (expected #{LINUX_X64_SHA256}, got #{actual})" unless actual == LINUX_X64_SHA256

  FileUtils.install(file.path, destination, mode: 0o755)
end
puts "tailwindcss v#{VERSION} installed"
