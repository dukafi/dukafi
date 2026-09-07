# Provider-neutral clarification envelope returned through MCP. The MCP tool
# cannot own a client's conversation UI, so its result tells the calling agent
# to surface these questions and end the current turn. The user's next message
# then resumes the ordinary model/tool loop with the missing context present.
module UserClarification
  MAX_QUESTIONS = 3
  KINDS = %w[text single_choice multiple_choice confirm].freeze

  module_function

  def build(args)
    args = {} unless args.is_a?(Hash)
    questions = Array(args["questions"])
    raise ArgumentError, "questions must contain between 1 and #{MAX_QUESTIONS} questions." unless questions.length.between?(1, MAX_QUESTIONS)

    normalized = questions.each_with_index.map { |row, index| normalize_question(row, index) }
    {
      "status" => "requires_user_input",
      "requiresUserInput" => true,
      "reason" => clean(args["reason"], 300),
      "questions" => normalized,
      "agentInstruction" => "Stop now. Present these questions clearly to the user and do not call more tools, make assumptions, mutate the draft, or publish. Resume only after the user answers. Preserve each question id when interpreting the response.",
    }
  end

  def normalize_question(row, index)
    raise ArgumentError, "questions[#{index}] must be an object." unless row.is_a?(Hash)

    prompt = clean(row["prompt"], 500)
    raise ArgumentError, "questions[#{index}].prompt is required." if prompt.empty?
    id = clean(row["id"], 60).downcase.gsub(/[^a-z0-9_]+/, "_").gsub(/\A_+|_+\z/, "")
    id = "question_#{index + 1}" if id.empty?
    kind = row["kind"].to_s
    kind = "text" if kind.empty?
    raise ArgumentError, "questions[#{index}].kind must be one of: #{KINDS.join(', ')}." unless KINDS.include?(kind)

    choices = Array(row["choices"]).first(8).each_with_index.map do |choice, choice_index|
      raise ArgumentError, "questions[#{index}].choices[#{choice_index}] must be an object." unless choice.is_a?(Hash)
      label = clean(choice["label"], 120)
      raise ArgumentError, "questions[#{index}].choices[#{choice_index}].label is required." if label.empty?
      value = clean(choice["value"], 120)
      { "value" => value.empty? ? label : value, "label" => label, "description" => clean(choice["description"], 240) }.reject { |_key, value| value == "" }
    end
    if %w[single_choice multiple_choice].include?(kind) && choices.length < 2
      raise ArgumentError, "questions[#{index}] needs at least two choices for #{kind}."
    end

    {
      "id" => id, "prompt" => prompt, "kind" => kind, "choices" => choices,
      "allowCustom" => row.key?("allowCustom") ? !!row["allowCustom"] : kind == "text",
      "recommendedValue" => clean(row["recommendedValue"], 120),
    }.reject { |_key, value| value == "" || value == [] }
  end

  def clean(value, limit)
    value.to_s.strip.gsub(/[\u0000-\u001f&&[^\n\t]]/, "").slice(0, limit).to_s
  end
end
