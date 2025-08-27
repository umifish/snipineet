/**
 * This file contains the Monarch language definition for the Groovy language,
 * rewritten in TypeScript.
 *
 * To use this in your project, you'll need to have the `monaco-editor` package installed
 * to get the necessary type definitions.
 *
 * @example
 * import * as monaco from 'monaco-editor';
 * import { groovyConfiguration, groovyLanguageDefinition } from './groovy-monarch';
 *
 * monaco.languages.register({ id: 'groovy' });
 * monaco.languages.setMonarchTokensProvider('groovy', groovyLanguageDefinition);
 * monaco.languages.setLanguageConfiguration('groovy', groovyConfiguration);
 */

// Import types from the Monaco Editor API
import type { languages } from "monaco-editor";

/**
 * Language configuration for Groovy.
 * Defines settings like comments, brackets, and auto-closing pairs.
 */
export const groovyConfiguration: languages.LanguageConfiguration = {
  comments: {
    lineComment: "//",
    blockComment: ["/*", "*/"],
  },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "'", close: "'", notIn: ["string", "comment"] },
    { open: '"', close: '"', notIn: ["string", "comment"] },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
  ],
};

/**
 * Monarch language definition for Groovy syntax highlighting.
 */
export const groovyLanguageDefinition: languages.IMonarchLanguage = {
  defaultToken: "invalid",
  tokenPostfix: ".groovy",

  keywords: [
    "as",
    "assert",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "def",
    "default",
    "do",
    "else",
    "enum",
    "extends",
    "finally",
    "for",
    "goto",
    "if",
    "implements",
    "import",
    "in",
    "instanceof",
    "interface",
    "new",
    "package",
    "return",
    "super",
    "switch",
    "this",
    "throw",
    "throws",
    "trait",
    "try",
    "while",
    "true",
    "false",
    "null",
    "void",
  ],

  typeKeywords: [
    "boolean",
    "byte",
    "char",
    "double",
    "float",
    "int",
    "long",
    "short",
  ],

  operators: [
    "=",
    ">",
    "<",
    "!",
    "~",
    "?",
    ":",
    "==",
    "<=",
    ">=",
    "!=",
    "&&",
    "||",
    "++",
    "--",
    "+",
    "-",
    "*",
    "/",
    "&",
    "|",
    "^",
    "%",
    "<<",
    ">>",
    ">>>",
    "+=",
    "-=",
    "*=",
    "/=",
    "&=",
    "|=",
    "^=",
    "%=",
    "<<=",
    ">>=",
    ">>>=",
    "<=>",
    "**",
    "?.",
    "*.",
    "..",
    "...",
  ],

  symbols: /[=><!~?:&|+\-*\/\^%]+/,

  escapes:
    /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  tokenizer: {
    root: [
      [
        /[a-zA-Z_$][\w$]*/,
        {
          cases: {
            "@typeKeywords": "keyword.type",
            "@keywords": "keyword",
            "@default": "identifier",
          },
        },
      ],
      { include: "@whitespace" },
      [/[{}()\[\]]/, "@brackets"],
      [/[<>](?!@symbols)/, "@brackets"],
      [
        /@symbols/,
        {
          cases: {
            "@operators": "operator",
            "@default": "",
          },
        },
      ],
      [/@\s*[a-zA-Z_\$][\w\$]*/, "annotation"],
      [/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
      [/0[xX][0-9a-fA-F]+/, "number.hex"],
      [/\d+/, "number"],
      [/[;,.]/, "delimiter"],
      [/"([^"\\]|\\.)*$/, "string.invalid"],
      [/'([^'\\]|\\.)*$/, "string.invalid"],
      [/"""/, { token: "string", next: "@gstring_double" }],
      [/"/, { token: "string", next: "@string_double" }],
      [/'''/, { token: "string", next: "@string_single" }],
      [/'/, { token: "string", next: "@string_single" }],
    ],

    whitespace: [
      [/[ \t\r\n]+/, ""],
      [/\/\*/, "comment", "@comment"],
      [/\/\/.*$/, "comment"],
    ],

    comment: [
      [/[^\/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[\/*]/, "comment"],
    ],

    string_double: [
      [/[^\\"$]+/, "string"],
      [/@escapes/, "string.escape"],
      [/\$/, "string.escape", "@gstring_variable"],
      [/\\./, "string.escape.invalid"],
      [/"/, "string", "@pop"],
    ],

    gstring_double: [
      [/[^\\"$]+/, "string"],
      [/@escapes/, "string.escape"],
      [/\$/, "string.escape", "@gstring_variable"],
      [/\\./, "string.escape.invalid"],
      [/"""/, "string", "@pop"],
    ],

    string_single: [
      [/[^\\']+/, "string"],
      [/@escapes/, "string.escape"],
      [/\\./, "string.escape.invalid"],
      [/'/, "string", "@pop"],
    ],

    gstring_variable: [
      [/\$([a-zA-Z_]\w*)/, "identifier"],
      [/\{/, "delimiter", "@gstring_expression"],
      ["", "", "@pop"],
    ],

    gstring_expression: [[/}/, "delimiter", "@pop"], { include: "root" }],
  },
};
