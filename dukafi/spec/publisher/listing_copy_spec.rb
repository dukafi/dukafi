require_relative "../spec_helper"

class ListingCopySpec < Minitest::Test
  Copy = Dukafi::Publisher::ListingCopy

  def test_titlecase_and_word_boundary_truncate
    assert_equal "Fragrance", Copy.titlecase("fragrance")
    assert_equal "Cheap Loans Nairobi", Copy.titlecase("cheap loans nairobi")
    assert_equal "Handcrafted Mahogany Dining Chairs",
                 Copy.truncate_words("Handcrafted Mahogany Dining Chairs For Nairobi", 35)
  end

  def test_brands_prefer_an_explicit_field_then_the_title
    items = [
      { "title" => "CK One", "brand" => "Calvin Klein" },
      { "title" => "Chanel Coco Noir Eau De" },
      { "title" => "Dior J'adore" },
      { "title" => "water" },
    ]

    assert_equal ["Calvin Klein", "Chanel", "Dior"], Copy.top_brands(items)
    assert_nil Copy.brand_from_title("Water 500ml")
    assert_nil Copy.brand_from_title("Bag 1")
  end

  def test_two_word_surnames_stay_together
    assert_equal "Calvin Klein", Copy.brand_from_title("Calvin Klein CK One")
  end
end
