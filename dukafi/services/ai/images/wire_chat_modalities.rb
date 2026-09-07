require "base64"
require "json"
require "uri"

class Dukafi
  module Ai
    module Images
      class WireChatModalities
        DATA_URL = /\Adata:(image\/[a-z0-9.+-]+);base64,(.+)\z/im
        def self.generate(connection:, model:, prompt:, size:, count:)
          driver = connection.driver
          response = Loop.request(driver.endpoint(connection), method: :post, headers: driver.headers(connection),
            body: { model: model, messages: [{ role: "user", content: prompt }], modalities: %w[image text],
                    image_generation: { size: size }, n: count }, read_timeout: 55)
          raise "HTTP #{response.code}: #{response.body.to_s[0, 800]}" unless response.is_a?(Net::HTTPSuccess)
          message = JSON.parse(response.body).dig("choices", 0, "message") || {}
          values = Array(message["images"]).flat_map { |row| row.is_a?(Hash) ? [row["image_url"], row["url"]] : [row] }
          values += Array(message["content"]).filter_map { |row| row["image_url"] || row["url"] if row.is_a?(Hash) }
          values.filter_map do |value|
            value = value["url"] if value.is_a?(Hash)
            match = DATA_URL.match(value.to_s)
            match ? { bytes: Base64.strict_decode64(match[2]), mime: match[1] } : nil
          end
        end
      end
    end
  end
end
