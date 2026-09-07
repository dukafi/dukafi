require "openssl"
require "base64"

module SecretBox
  PREFIX = "sb1:"
  INFO = "dukafi-secret-box-v1"
  class KeyMismatch < StandardError; end

  module_function

  def encrypt(plaintext)
    cipher = OpenSSL::Cipher.new("aes-256-gcm").encrypt
    iv = OpenSSL::Random.random_bytes(12)
    cipher.key = key
    cipher.iv = iv
    cipher.auth_data = INFO
    encrypted = cipher.update(plaintext.to_s) + cipher.final
    PREFIX + Base64.strict_encode64(iv + cipher.auth_tag + encrypted)
  end

  def decrypt(payload)
    raw = Base64.strict_decode64(payload.to_s.delete_prefix(PREFIX))
    raise KeyMismatch, "re-enter this API key" if raw.bytesize < 28
    cipher = OpenSSL::Cipher.new("aes-256-gcm").decrypt
    cipher.key = key
    cipher.iv = raw.byteslice(0, 12)
    cipher.auth_tag = raw.byteslice(12, 16)
    cipher.auth_data = INFO
    cipher.update(raw.byteslice(28..)) + cipher.final
  rescue OpenSSL::Cipher::CipherError, ArgumentError
    raise KeyMismatch, "re-enter this API key"
  end

  def fingerprint
    OpenSSL::Digest::SHA256.hexdigest(key).slice(0, 16)
  end

  def key
    configured = ENV["DUKAFI_SECRET_KEY"].to_s
    unless configured.empty?
      decoded = Base64.strict_decode64(configured)
      raise ArgumentError, "DUKAFI_SECRET_KEY must be base64 for exactly 32 bytes" unless decoded.bytesize == 32
      return decoded
    end
    secret = ENV["SESSION_SECRET"].to_s
    secret = SessionSecret.fetch if secret.empty?
    OpenSSL::KDF.hkdf(secret, salt: "dukafi", info: INFO, length: 32, hash: "SHA256")
  end
end
