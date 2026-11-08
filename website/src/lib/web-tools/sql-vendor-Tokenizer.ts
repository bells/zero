/*
The MIT License (MIT)

Copyright (c) 2016-2020 ZeroTurnaround LLC
Copyright (c) 2020-2021 George Leslie-Waksman and other contributors
Copyright (c) 2021-Present inferrinizzard and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Pinned sql-formatter v15.9.0 lexer source. Local changes use erasable TypeScript and local imports.
*/
import { type Token, TokenType } from "./sql-vendor-token.ts";
import * as regex from "./sql-vendor-regexFactory.ts";
import {
  type ParamTypes,
  type TokenizerOptions,
} from "./sql-vendor-TokenizerOptions.ts";
import TokenizerEngine, {
  type TokenRule,
} from "./sql-vendor-TokenizerEngine.ts";
import { escapeRegExp, patternToRegex } from "./sql-vendor-regexUtil.ts";
import { equalizeWhitespace, type Optional } from "./sql-vendor-utils.ts";
import { NestedComment } from "./sql-vendor-NestedComment.ts";

type OptionalTokenRule = Optional<TokenRule, "regex">;

export default class Tokenizer {
  private rulesBeforeParams: TokenRule[];
  private rulesAfterParams: TokenRule[];

  private cfg: TokenizerOptions;
  private dialectName: string;
  constructor(cfg: TokenizerOptions, dialectName: string) {
    this.cfg = cfg;
    this.dialectName = dialectName;
    this.rulesBeforeParams = this.buildRulesBeforeParams(cfg);
    this.rulesAfterParams = this.buildRulesAfterParams(cfg);
  }

  public tokenize(input: string, paramTypesOverrides: ParamTypes): Token[] {
    const rules = [
      ...this.rulesBeforeParams,
      ...this.buildParamRules(this.cfg, paramTypesOverrides),
      ...this.rulesAfterParams,
    ];
    const tokens = new TokenizerEngine(rules, this.dialectName).tokenize(input);
    return this.cfg.postProcess ? this.cfg.postProcess(tokens) : tokens;
  }

  // These rules can be cached as they only depend on
  // the Tokenizer config options specified for each SQL dialect
  private buildRulesBeforeParams(cfg: TokenizerOptions): TokenRule[] {
    return this.validRules([
      {
        type: TokenType.DISABLE_COMMENT,
        regex:
          /(\/\* *sql-formatter-disable *\*\/[\s\S]*?(?:\/\* *sql-formatter-enable *\*\/|$))/uy,
      },
      {
        type: TokenType.BLOCK_COMMENT,
        regex: cfg.nestedBlockComments
          ? new NestedComment()
          : /(\/\*[^]*?\*\/)/uy,
      },
      {
        type: TokenType.LINE_COMMENT,
        regex: regex.lineComment(cfg.lineCommentTypes ?? ["--"]),
      },
      {
        type: TokenType.QUOTED_IDENTIFIER,
        regex: regex.string(cfg.identTypes),
      },
      {
        type: TokenType.NUMBER,
        regex: cfg.underscoresInNumbers
          ? /(?:0x[0-9a-fA-F_]+|0b[01_]+|(?:-\s*)?(?:[0-9_]*\.[0-9_]+|[0-9_]+(?:\.[0-9_]*)?)(?:[eE][-+]?[0-9_]+(?:\.[0-9_]+)?)?)(?![\w\p{Alphabetic}])/uy
          : /(?:0x[0-9a-fA-F]+|0b[01]+|(?:-\s*)?(?:[0-9]*\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+(?:\.[0-9]+)?)?)(?![\w\p{Alphabetic}])/uy,
      },
      // RESERVED_KEYWORD_PHRASE and RESERVED_DATA_TYPE_PHRASE  is matched before all other keyword tokens
      // to e.g. prioritize matching "TIMESTAMP WITH TIME ZONE" phrase over "WITH" clause.
      {
        type: TokenType.RESERVED_KEYWORD_PHRASE,
        regex: regex.reservedWord(
          cfg.reservedKeywordPhrases ?? [],
          cfg.identChars,
        ),
        text: toCanonical,
      },
      {
        type: TokenType.RESERVED_DATA_TYPE_PHRASE,
        regex: regex.reservedWord(
          cfg.reservedDataTypePhrases ?? [],
          cfg.identChars,
        ),
        text: toCanonical,
      },
      {
        type: TokenType.CASE,
        regex: /CASE\b/iuy,
        text: toCanonical,
      },
      {
        type: TokenType.END,
        regex: /END\b/iuy,
        text: toCanonical,
      },
      {
        type: TokenType.BETWEEN,
        regex: /BETWEEN\b/iuy,
        text: toCanonical,
      },
      {
        type: TokenType.LIMIT,
        regex: cfg.reservedClauses.includes("LIMIT") ? /LIMIT\b/iuy : undefined,
        text: toCanonical,
      },
      {
        type: TokenType.RESERVED_CLAUSE,
        regex: regex.reservedWord(cfg.reservedClauses, cfg.identChars),
        text: toCanonical,
      },
      {
        type: TokenType.RESERVED_SELECT,
        regex: regex.reservedWord(cfg.reservedSelect, cfg.identChars),
        text: toCanonical,
      },
      {
        type: TokenType.RESERVED_SET_OPERATION,
        regex: regex.reservedWord(cfg.reservedSetOperations, cfg.identChars),
        text: toCanonical,
      },
      {
        type: TokenType.WHEN,
        regex: /WHEN\b/iuy,
        text: toCanonical,
      },
      {
        type: TokenType.ELSE,
        regex: /ELSE\b/iuy,
        text: toCanonical,
      },
      {
        type: TokenType.THEN,
        regex: /THEN\b/iuy,
        text: toCanonical,
      },
      {
        type: TokenType.RESERVED_JOIN,
        regex: regex.reservedWord(cfg.reservedJoins, cfg.identChars),
        text: toCanonical,
      },
      {
        type: TokenType.AND,
        regex: /AND\b/iuy,
        text: toCanonical,
      },
      {
        type: TokenType.OR,
        regex: /OR\b/iuy,
        text: toCanonical,
      },
      {
        type: TokenType.XOR,
        regex: cfg.supportsXor ? /XOR\b/iuy : undefined,
        text: toCanonical,
      },
      ...(cfg.operatorKeyword
        ? [
            {
              type: TokenType.OPERATOR,
              regex: /OPERATOR *\([^)]+\)/iuy,
            },
          ]
        : []),
      {
        type: TokenType.RESERVED_FUNCTION_NAME,
        regex: regex.reservedWord(cfg.reservedFunctionNames, cfg.identChars),
        text: toCanonical,
      },
      {
        type: TokenType.RESERVED_DATA_TYPE,
        regex: regex.reservedWord(cfg.reservedDataTypes, cfg.identChars),
        text: toCanonical,
      },
      {
        type: TokenType.RESERVED_KEYWORD,
        regex: regex.reservedWord(cfg.reservedKeywords, cfg.identChars),
        text: toCanonical,
      },
    ]);
  }

  // These rules can also be cached as they only depend on
  // the Tokenizer config options specified for each SQL dialect
  private buildRulesAfterParams(cfg: TokenizerOptions): TokenRule[] {
    return this.validRules([
      {
        type: TokenType.VARIABLE,
        regex: cfg.variableTypes
          ? regex.variable(cfg.variableTypes)
          : undefined,
      },
      { type: TokenType.STRING, regex: regex.string(cfg.stringTypes) },
      {
        type: TokenType.IDENTIFIER,
        regex: regex.identifier(cfg.identChars),
      },
      { type: TokenType.DELIMITER, regex: /[;]/uy },
      { type: TokenType.COMMA, regex: /[,]/y },
      {
        type: TokenType.OPEN_PAREN,
        regex: regex.parenthesis("open", cfg.extraParens),
      },
      {
        type: TokenType.CLOSE_PAREN,
        regex: regex.parenthesis("close", cfg.extraParens),
      },
      {
        type: TokenType.OPERATOR,
        regex: regex.operator([
          // standard operators
          "+",
          "-",
          "/",
          ">",
          "<",
          "=",
          "<>",
          "<=",
          ">=",
          "!=",
          ...(cfg.operators ?? []),
        ]),
      },
      { type: TokenType.ASTERISK, regex: /[*]/uy },
      {
        type: TokenType.PROPERTY_ACCESS_OPERATOR,
        regex: regex.operator([".", ...(cfg.propertyAccessOperators ?? [])]),
      },
    ]);
  }

  // These rules can't be blindly cached as the paramTypesOverrides object
  // can differ on each invocation of the format() function.
  private buildParamRules(
    cfg: TokenizerOptions,
    paramTypesOverrides: ParamTypes,
  ): TokenRule[] {
    // Each dialect has its own default parameter types (if any),
    // but these can be overriden by the user of the library.
    const paramTypes = {
      named: paramTypesOverrides?.named || cfg.paramTypes?.named || [],
      quoted: paramTypesOverrides?.quoted || cfg.paramTypes?.quoted || [],
      numbered: paramTypesOverrides?.numbered || cfg.paramTypes?.numbered || [],
      positional:
        typeof paramTypesOverrides?.positional === "boolean"
          ? paramTypesOverrides.positional
          : cfg.paramTypes?.positional,
      custom: paramTypesOverrides?.custom || cfg.paramTypes?.custom || [],
    };

    return this.validRules([
      {
        type: TokenType.NAMED_PARAMETER,
        regex: regex.parameter(
          paramTypes.named,
          regex.identifierPattern(cfg.paramChars || cfg.identChars),
        ),
        key: (v) => v.slice(1),
      },
      {
        type: TokenType.QUOTED_PARAMETER,
        regex: regex.parameter(
          paramTypes.quoted,
          regex.stringPattern(cfg.identTypes),
        ),
        key: (v) =>
          (({ tokenKey, quoteChar }) =>
            tokenKey.replace(
              new RegExp(escapeRegExp("\\" + quoteChar), "gu"),
              quoteChar,
            ))({
            tokenKey: v.slice(2, -1),
            quoteChar: v.slice(-1),
          }),
      },
      {
        type: TokenType.NUMBERED_PARAMETER,
        regex: regex.parameter(paramTypes.numbered, "[0-9]+"),
        key: (v) => v.slice(1),
      },
      {
        type: TokenType.POSITIONAL_PARAMETER,
        regex: paramTypes.positional ? /[?]/y : undefined,
      },
      ...paramTypes.custom.map(
        (customParam): TokenRule => ({
          type: TokenType.CUSTOM_PARAMETER,
          regex: patternToRegex(customParam.regex),
          key: customParam.key ?? ((v) => v),
        }),
      ),
    ]);
  }

  // filters out rules for token types whose regex is undefined
  private validRules(rules: OptionalTokenRule[]): TokenRule[] {
    return rules.filter((rule): rule is TokenRule => Boolean(rule.regex));
  }
}

/**
 * Converts keywords (and keyword sequences) to canonical form:
 * - in uppercase
 * - single spaces between words
 */
const toCanonical = (v: string) => equalizeWhitespace(v.toUpperCase());
