import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
import type { Theme } from "../../types";

/**
 * Builds a VS Code-like CodeMirror 6 theme from the app's Theme colors.
 * Returns an array of extensions: editor chrome theme + syntax highlighting.
 */
export function buildEditorTheme(theme: Theme): Extension {
  const c = theme.colors;
  const isDark = theme.type === "dark";

  // ANSI palette indices:
  // 0=black 1=red 2=green 3=yellow 4=blue 5=magenta 6=cyan 7=white
  // 8-15 = bright variants of the same
  const ansi = c.ansi;

  // --- Editor chrome (gutters, cursor, selection, active line, etc.) ---
  const chromeTheme = EditorView.theme(
    {
      "&": {
        backgroundColor: c.editorBg,
        color: c.editorFg,
        fontSize: "14px",
      },
      ".cm-content": {
        caretColor: c.accent,
        fontFamily:
          "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
        lineHeight: "1.6",
        padding: "4px 0",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: c.accent,
        borderLeftWidth: "2px",
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: c.accent,
      },

      // Active line
      ".cm-activeLine": {
        backgroundColor: isDark
          ? "rgba(255, 255, 255, 0.04)"
          : "rgba(0, 0, 0, 0.04)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: isDark
          ? "rgba(255, 255, 255, 0.04)"
          : "rgba(0, 0, 0, 0.04)",
        color: c.editorFg,
      },

      // Gutters (line numbers)
      ".cm-gutters": {
        backgroundColor: c.editorBg,
        color: c.editorLineNumber,
        borderRight: `1px solid ${c.border}`,
        paddingRight: "4px",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 8px 0 16px",
        minWidth: "40px",
        fontSize: "13px",
      },

      // Selection
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: c.editorSelection,
      },
      ".cm-selectionMatch": {
        backgroundColor: isDark
          ? "rgba(255, 255, 255, 0.1)"
          : "rgba(0, 0, 0, 0.08)",
      },

      // Matching brackets
      "&.cm-focused .cm-matchingBracket": {
        backgroundColor: isDark
          ? "rgba(255, 255, 255, 0.12)"
          : "rgba(0, 0, 0, 0.1)",
        outline: `1px solid ${c.accent}80`,
      },
      "&.cm-focused .cm-nonmatchingBracket": {
        backgroundColor: `${ansi[1]}30`,
        outline: `1px solid ${ansi[1]}80`,
      },

      // Search highlights
      ".cm-searchMatch": {
        backgroundColor: `${c.accent}30`,
        outline: `1px solid ${c.accent}60`,
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: `${c.accent}50`,
      },

      // Fold gutter
      ".cm-foldGutter .cm-gutterElement": {
        color: c.editorLineNumber,
        padding: "0 4px",
      },
      ".cm-foldGutter .cm-gutterElement:hover": {
        color: c.editorFg,
      },

      // Panels (search bar, etc.)
      ".cm-panels": {
        backgroundColor: c.editorBg,
        borderBottom: `1px solid ${c.border}`,
        color: c.editorFg,
      },
      ".cm-panels input, .cm-panels button": {
        backgroundColor: isDark
          ? "rgba(255, 255, 255, 0.08)"
          : "rgba(0, 0, 0, 0.06)",
        color: c.editorFg,
        border: `1px solid ${c.border}`,
        borderRadius: "4px",
        padding: "2px 6px",
      },
      ".cm-panels button:hover": {
        backgroundColor: isDark
          ? "rgba(255, 255, 255, 0.14)"
          : "rgba(0, 0, 0, 0.1)",
      },

      // Tooltips / autocomplete
      ".cm-tooltip": {
        backgroundColor: c.editorBg,
        border: `1px solid ${c.border}`,
        borderRadius: "6px",
        boxShadow: isDark
          ? "0 4px 16px rgba(0, 0, 0, 0.4)"
          : "0 4px 16px rgba(0, 0, 0, 0.12)",
        color: c.editorFg,
      },
      ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
        padding: "2px 8px",
      },
      ".cm-tooltip-autocomplete ul li[aria-selected]": {
        backgroundColor: c.editorSelection,
        color: c.editorFg,
      },

      // Scrollbars
      ".cm-scroller": {
        overflow: "auto",
      },
      ".cm-scroller::-webkit-scrollbar": {
        width: "10px",
        height: "10px",
      },
      ".cm-scroller::-webkit-scrollbar-track": {
        backgroundColor: "transparent",
      },
      ".cm-scroller::-webkit-scrollbar-thumb": {
        backgroundColor: isDark
          ? "rgba(255, 255, 255, 0.15)"
          : "rgba(0, 0, 0, 0.15)",
        borderRadius: "5px",
        border: `2px solid ${c.editorBg}`,
      },
      ".cm-scroller::-webkit-scrollbar-thumb:hover": {
        backgroundColor: isDark
          ? "rgba(255, 255, 255, 0.25)"
          : "rgba(0, 0, 0, 0.25)",
      },
      ".cm-scroller::-webkit-scrollbar-corner": {
        backgroundColor: "transparent",
      },
    },
    { dark: isDark }
  );

  // --- Syntax highlighting ---
  // Maps language tokens to colors from the theme's ANSI palette,
  // producing a VS Code-like highlighting scheme.
  const highlightStyle = HighlightStyle.define([
    // Keywords & control flow → magenta
    { tag: tags.keyword, color: ansi[5], fontWeight: "normal" },
    { tag: tags.controlKeyword, color: ansi[5] },
    { tag: tags.operatorKeyword, color: ansi[5] },
    { tag: tags.moduleKeyword, color: ansi[5] },
    { tag: tags.definitionKeyword, color: ansi[5] },

    // Operators & punctuation
    { tag: tags.operator, color: c.editorFg },
    { tag: tags.punctuation, color: c.editorFg },
    { tag: tags.separator, color: c.editorFg },
    { tag: tags.bracket, color: c.editorFg },
    { tag: tags.angleBracket, color: c.editorFg },
    { tag: tags.squareBracket, color: c.editorFg },
    { tag: tags.paren, color: c.editorFg },
    { tag: tags.brace, color: c.editorFg },

    // Strings → green
    { tag: tags.string, color: ansi[2] },
    { tag: tags.special(tags.string), color: ansi[2] },
    { tag: tags.character, color: ansi[2] },

    // Regex → red
    { tag: tags.regexp, color: ansi[1] },

    // Numbers & booleans → yellow
    { tag: tags.number, color: ansi[3] },
    { tag: tags.integer, color: ansi[3] },
    { tag: tags.float, color: ansi[3] },
    { tag: tags.bool, color: ansi[3] },
    { tag: tags.null, color: ansi[3] },

    // Comments → muted (bright black for dark, textMuted for light)
    {
      tag: tags.comment,
      color: isDark ? ansi[8] : c.textMuted,
      fontStyle: "italic",
    },
    { tag: tags.lineComment, color: isDark ? ansi[8] : c.textMuted, fontStyle: "italic" },
    { tag: tags.blockComment, color: isDark ? ansi[8] : c.textMuted, fontStyle: "italic" },
    { tag: tags.docComment, color: isDark ? ansi[8] : c.textMuted, fontStyle: "italic" },

    // Type names → cyan
    { tag: tags.typeName, color: ansi[6] },
    { tag: tags.className, color: ansi[6] },
    { tag: tags.namespace, color: ansi[6] },
    { tag: tags.macroName, color: ansi[6] },
    { tag: tags.annotation, color: ansi[6] },

    // Functions → blue
    { tag: tags.function(tags.variableName), color: ansi[4] },
    { tag: tags.function(tags.definition(tags.variableName)), color: ansi[4] },
    { tag: tags.function(tags.propertyName), color: ansi[4] },

    // Definitions → blue (function/variable declarations)
    { tag: tags.definition(tags.variableName), color: ansi[4] },

    // Properties → cyan
    { tag: tags.propertyName, color: ansi[6] },
    { tag: tags.special(tags.propertyName), color: ansi[6] },

    // Variables → foreground
    { tag: tags.variableName, color: c.editorFg },
    { tag: tags.local(tags.variableName), color: c.editorFg },

    // Constants → yellow
    { tag: tags.constant(tags.variableName), color: ansi[3] },

    // Labels & self → red
    { tag: tags.labelName, color: ansi[1] },
    { tag: tags.self, color: ansi[1] },

    // HTML/JSX tags → red
    { tag: tags.tagName, color: ansi[1] },
    { tag: tags.attributeName, color: ansi[3] },
    { tag: tags.attributeValue, color: ansi[2] },

    // Links → accent, underlined
    { tag: tags.link, color: c.accent, textDecoration: "underline" },
    { tag: tags.url, color: c.accent, textDecoration: "underline" },

    // Headings → blue, bold
    { tag: tags.heading, color: ansi[4], fontWeight: "bold" },
    { tag: tags.heading1, color: ansi[4], fontWeight: "bold" },
    { tag: tags.heading2, color: ansi[4], fontWeight: "bold" },

    // Emphasis & strong
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong, fontWeight: "bold" },

    // Invalid / errors → red with background
    { tag: tags.invalid, color: ansi[1], textDecoration: "underline wavy" },

    // Escape sequences → yellow
    { tag: tags.escape, color: ansi[3] },

    // Meta / preprocessor → magenta (bright)
    { tag: tags.meta, color: ansi[13] },
    { tag: tags.processingInstruction, color: ansi[13] },
  ]);

  return [chromeTheme, syntaxHighlighting(highlightStyle)];
}
