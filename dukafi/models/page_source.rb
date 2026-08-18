class PageSource < Sequel::Model
  set_primary_key %i[page_path source]
end
