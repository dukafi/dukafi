require "json"

# In-process HTTP double for AI/image/S3 clients that call Loop.request or
# Net::HTTP.start. Specs never open a socket unless they are explicitly testing
# a local TCP server (SMTP, fake S3).
module HttpStub
  Response = Struct.new(:code, :body, :content_type, keyword_init: true) do
    def is_a?(klass)
      return Integer(code).between?(200, 299) if klass == Net::HTTPSuccess
      super
    end
    def [](header)
      header.to_s.downcase == "content-type" ? content_type : nil
    end
  end

  module_function

  def png
    ["89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478" \
     "9c636000000200010005fe02fea7c2b7ee0000000049454e44ae426082"].pack("H*")
  end

  def json_ok(payload, code: "200")
    Response.new(code: code, body: JSON.generate(payload), content_type: "application/json")
  end

  def bytes_ok(bytes, content_type:)
    Response.new(code: "200", body: bytes, content_type: content_type)
  end

  def error(code, payload)
    Response.new(code: code.to_s, body: payload.is_a?(String) ? payload : JSON.generate(payload),
                 content_type: "application/json")
  end
end
