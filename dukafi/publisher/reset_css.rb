class Dukafi
  module Publisher
    RESET_CSS = [
      ":where(*, *::before, *::after) { box-sizing: border-box; }",
      ":where(*) { margin: 0; padding: 0; }",
      ':where(body) { line-height: 1.5; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }',
      ":where(img, picture, video, canvas, svg) { display: block; max-width: 100%; height: auto; }",
      ":where(input, button, textarea, select) { font: inherit; color: inherit; }",
      ":where(button) { background: none; border: 0; cursor: pointer; }",
      ":where(p, h1, h2, h3, h4, h5, h6) { overflow-wrap: break-word; }",
      ":where(ol, ul, menu) { list-style: none; }",
      ":where(a) { color: inherit; text-decoration: inherit; }",
      ":where(table) { border-collapse: collapse; }",
    ].join("\n").freeze
  end
end
