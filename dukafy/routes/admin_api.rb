class AdminApi < Roda
  plugin :json

  route do |r|
    r.get("health") do
      response.status = 501
      { error: { code: "not_implemented", message: "Admin API is not implemented yet" } }
    end

    response.status = 501
    { error: { code: "not_implemented", message: "Admin API is not implemented yet" } }
  end
end
