require "digest"
require "fileutils"
require "open-uri"
require "rbconfig"
require "tempfile"

VERSION = "4.3.0"
LINUX_X64_SHA256 = "73f0e5459054e5cfaa8ab6f3b940f3fbe0f13cc7fd83bc24e7c655033c203400"
LINUX_ARM64_SHA256 = "8f48dcb72be3b351c10563c5329b4638ba8516820dc3b3a1609625a166e87cbd"
destination = File.expand_path("../vendor/tailwindcss", __dir__)

cpu = RbConfig::CONFIG.fetch("host_cpu")
asset, expected = if cpu.match?(/aarch64|arm64/)
  ["tailwindcss-linux-arm64", LINUX_ARM64_SHA256]
else
  ["tailwindcss-linux-x64", LINUX_X64_SHA256]
end

if File.file?(destination) && Digest::SHA256.file(destination).hexdigest == expected
  puts "tailwindcss v#{VERSION} ready"
  exit
end

platform = [RbConfig::CONFIG.fetch("host_os"), RbConfig::CONFIG.fetch("host_cpu")]
unless platform[0].match?(/linux/) && platform[1].match?(/x86_64|amd64|aarch64|arm64/)
  abort "Tailwind standalone setup supports Linux x86_64 and arm64; set TAILWINDCSS_BIN for this platform"
end

url = "https://github.com/tailwindlabs/tailwindcss/releases/download/v#{VERSION}/#{asset}"
FileUtils.mkdir_p(File.dirname(destination))
Tempfile.create("dukafi-tailwind") do |file|
  puts "downloading tailwindcss v#{VERSION} (one-time, about 119 MB)..."
  URI.open(url, "rb") { |source| IO.copy_stream(source, file) }
  file.flush
  actual = Digest::SHA256.file(file.path).hexdigest
  abort "Tailwind checksum mismatch (expected #{expected}, got #{actual})" unless actual == expected

  FileUtils.install(file.path, destination, mode: 0o755)
end
puts "tailwindcss v#{VERSION} installed"
