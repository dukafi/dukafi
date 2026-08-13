require "json"

# The bundled Google Fonts directory snapshot.
#
# Generated from the editor by `bun run scripts/export-schemas.ts` (see
# `publisher/fonts/google-fonts.json`), so the picker and the installer are
# always describing the same directory. Nothing here touches the network: the
# directory is a build artefact, and only `GoogleFontInstaller` ever reaches
# out to Google — once, at install time.
#
# Loaded once and frozen. It is ~270 KiB of JSON and every font-picker open
# would otherwise re-parse it.
class GoogleFonts
  PATH = File.expand_path("../publisher/fonts/google-fonts.json", __dir__).freeze

  class << self
    def families
      @families ||= load_families
    end

    def find(family)
      name = family.to_s
      return nil if name.empty?

      index[name]
    end

    # Narrow a request down to what the directory actually offers.
    #
    # This is the validation boundary for the install endpoint: the family,
    # variants and subsets all arrive from the client, and they end up in a URL
    # we fetch and in a directory name we write to. Anything the snapshot does
    # not list is dropped rather than passed through.
    def resolve(family:, variants:, subsets:)
      entry = find(family)
      return nil unless entry

      wanted_variants = Array(variants).map(&:to_s) & entry.fetch("variants", [])
      wanted_subsets = Array(subsets).map(&:to_s) & entry.fetch("subsets", [])
      return nil if wanted_variants.empty?

      # A family always has at least one subset; falling back to `latin` keeps
      # a request that named none (or only unknown ones) useful instead of
      # installing an empty font.
      wanted_subsets = ["latin"] & entry.fetch("subsets", []) if wanted_subsets.empty?
      wanted_subsets = entry.fetch("subsets", []).first(1) if wanted_subsets.empty?

      { "family" => entry.fetch("family"), "category" => entry["category"],
        "variants" => wanted_variants, "subsets" => wanted_subsets }
    end

    private

    def load_families
      parsed = JSON.parse(File.read(PATH))
      list = parsed.is_a?(Hash) ? parsed["families"] : nil
      (list.is_a?(Array) ? list : []).freeze
    rescue Errno::ENOENT, JSON::ParserError
      # A missing or corrupt snapshot must not take the admin down — the font
      # picker simply comes back empty.
      [].freeze
    end

    def index
      @index ||= families.each_with_object({}) do |entry, map|
        name = entry.is_a?(Hash) ? entry["family"] : nil
        map[name] = entry if name.is_a?(String)
      end.freeze
    end
  end
end
