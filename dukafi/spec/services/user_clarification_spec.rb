require_relative "../spec_helper"

class UserClarificationSpec < Minitest::Test
  def test_builds_a_structured_blocking_question_envelope
    result = UserClarification.build(
      "reason" => "The framework scope is unclear.",
      "questions" => [{
        "id" => "scope", "prompt" => "Where should this apply?", "kind" => "single_choice",
        "choices" => [{ "value" => "site", "label" => "Entire site" }, { "value" => "page", "label" => "Current page" }],
        "recommendedValue" => "site",
      }],
    )

    assert_equal "requires_user_input", result["status"]
    assert_equal true, result["requiresUserInput"]
    assert_equal "scope", result.dig("questions", 0, "id")
    assert_equal 2, result.dig("questions", 0, "choices").length
    assert_includes result["agentInstruction"], "Stop now"
  end

  def test_rejects_choice_questions_without_choices
    error = assert_raises(ArgumentError) do
      UserClarification.build("questions" => [{ "prompt" => "Choose", "kind" => "single_choice" }])
    end
    assert_includes error.message, "at least two choices"
  end

  def test_limits_questions_to_three
    assert_raises(ArgumentError) do
      UserClarification.build("questions" => 4.times.map { |index| { "prompt" => "Question #{index}" } })
    end
  end
end
