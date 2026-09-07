require_relative "../spec_helper"

class SecretBoxSpec < Minitest::Test
  def test_round_trip_uses_a_random_nonce
    first = SecretBox.encrypt("sk-secret")
    second = SecretBox.encrypt("sk-secret")
    refute_equal first, second
    assert_equal "sk-secret", SecretBox.decrypt(first)
    assert_equal "sk-secret", SecretBox.decrypt(second)
  end

  def test_tampering_fails_as_a_key_mismatch
    encrypted = SecretBox.encrypt("secret")
    assert_raises(SecretBox::KeyMismatch) { SecretBox.decrypt(encrypted.sub(/.$/, "x")) }
  end
end
