require "base64"
require "json"
require "uri"

class Dukafi
  module Ai
    module Images
      class WireImagesApi
        def self.generate(connection:, model:, prompt:, size:, count:)
          driver = connection.driver
          base = driver.effective_base(connection).sub(%r{/+\z}, "")
          uri = URI.parse("#{base}/images/generations")
          response = Loop.request(uri, method: :post, headers: driver.headers(connection),
                                  body: { model: model, prompt: prompt, n: count, size: size, response_format: "b64_json" },
                                  read_timeout: 55)
          raise "HTTP #{response.code}: #{response.body.to_s[0, 800]}" unless response.is_a?(Net::HTTPSuccess)
          Array(JSON.parse(response.body)["data"]).map do |item|
            if item["b64_json"]
              { bytes: Base64.strict_decode64(item["b64_json"]), mime: "image/png" }
            elsif item["url"]
              fetch(item["url"])
            end
          end.compact
        end

        def self.fetch(url)
          uri = URI.parse(url.to_s)
          raise "Image URL must use HTTPS." unless Loop.valid_uri?(uri)
          response = Loop.request(uri, method: :get, read_timeout: 20)
          raise "Image download failed with HTTP #{response.code}." unless response.is_a?(Net::HTTPSuccess)
          mime = response["content-type"].to_s.split(";").first
          raise "Provider returned a non-image URL." unless mime.start_with?("image/")
          raise "Provider image exceeds 20 MB." if response.body.bytesize > MediaIngest::MAX_BYTES
          { bytes: response.body, mime: mime }
        end
      end
    end
  end
end
