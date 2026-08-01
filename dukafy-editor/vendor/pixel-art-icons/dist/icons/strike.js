import { jsx as _jsx } from "react/jsx-runtime";
// Authored in-house for the content editor's bubble menu — the upstream
// pixel-art catalogue ships an "underline" icon but no strikethrough at
// the time this was added. Visual cue: same stylised letter shape as the
// underline glyph (two vertical strokes with an inner crossbar), with the
// horizontal rule moved from beneath to cut through the middle.
export function StrikeIcon({ size = 24, color = 'currentColor', className, style }) {
    return (_jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: color, xmlns: "http://www.w3.org/2000/svg", className: className, style: style, children: _jsx("path", { d: "M19 13H5v-2h14v2Z M16 18H8v-2h8v2Z M8 16H6V4h2v12Z M18 16h-2V4h2v12Z" }) }));
}
