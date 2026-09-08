require_relative "../spec_helper"

class TailwindChecksumsSpec < Minitest::Test
  ROOT = File.expand_path("../../..", __dir__)

  def test_install_tailwind_pins_linux_x64_and_arm64_checksums
    source = File.read(File.join(ROOT, "dukafi", "scripts", "install_tailwind.rb"))
    assert_match(/LINUX_X64_SHA256\s*=\s*"[0-9a-f]{64}"/, source)
    assert_match(/LINUX_ARM64_SHA256\s*=\s*"[0-9a-f]{64}"/, source)
  end

  def test_deploy_image_releases_both_architectures
    source = File.read(File.join(ROOT, "deploy-image"))
    assert_includes source, 'RELEASE_PLATFORMS="linux/amd64,linux/arm64"'
  end
end
