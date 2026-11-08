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
/* eslint-disable no-cond-assign */
import type { RegExpLike } from "./sql-vendor-TokenizerEngine.ts";

const START = /\/\*/uy; // matches: /*
const ANY_CHAR = /[\s\S]/uy; // matches single character
const END = /\*\//uy; // matches: */

/**
 * An object mimicking a regular expression,
 * for matching nested block-comments.
 */
export class NestedComment implements RegExpLike {
  public lastIndex: number = 0;

  public exec(input: string): string[] | null {
    let result = "";
    let match: string | null;
    let nestLevel = 0;

    if ((match = this.matchSection(START, input))) {
      result += match;
      nestLevel++;
    } else {
      return null;
    }

    while (nestLevel > 0) {
      if ((match = this.matchSection(START, input))) {
        result += match;
        nestLevel++;
      } else if ((match = this.matchSection(END, input))) {
        result += match;
        nestLevel--;
      } else if ((match = this.matchSection(ANY_CHAR, input))) {
        result += match;
      } else {
        return null;
      }
    }

    return [result];
  }

  private matchSection(regex: RegExp, input: string): string | null {
    regex.lastIndex = this.lastIndex;
    const matches = regex.exec(input);
    if (matches) {
      this.lastIndex += matches[0].length;
    }
    return matches ? matches[0] : null;
  }
}
