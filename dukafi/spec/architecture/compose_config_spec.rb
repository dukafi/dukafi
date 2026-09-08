require_relative "../spec_helper"

class ComposeConfigSpec < Minitest::Test
  ROOT = File.expand_path("../../..", __dir__)

  def docker?
    system("docker", "info", out: File::NULL, err: File::NULL)
  end

  def compose_config(*files)
    args = files.flat_map { |file| ["-f", file] } + ["config"]
    Dir.chdir(ROOT) do
      system("docker", "compose", *args, out: File::NULL, err: File::NULL)
    end
  end

  def test_compose_prod_and_overlays_config_validate
    skip "docker not available" unless docker?

    assert compose_config("compose.prod.yml"), "compose.prod.yml config failed"
    assert compose_config("compose.prod.yml", "compose.postgres.yml"), "postgres overlay failed"
    assert compose_config("compose.prod.yml", "compose.caddy.yml"), "caddy overlay failed"
    assert compose_config("compose.prod.yml", "compose.scale.yml"), "scale overlay failed"
    assert compose_config(
      "compose.prod.yml", "compose.postgres.yml", "compose.caddy.yml", "compose.scale.yml"
    ), "full overlay stack failed"
  end
end
