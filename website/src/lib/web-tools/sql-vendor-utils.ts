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
export const dedupe = (arr: string[]) => [...new Set(arr)];

// Last element from array
export const last = <T>(arr: T[]): T | undefined => arr[arr.length - 1];

// Sorts strings by length, so that longer ones are first
// Also sorts alphabetically after sorting by length.
export const sortByLengthDesc = (strings: string[]) =>
  strings.sort((a, b) => b.length - a.length || a.localeCompare(b));

/** Get length of longest string in list of strings */
export const maxLength = (strings: string[]) =>
  strings.reduce((max, cur) => Math.max(max, cur.length), 0);

// replaces long whitespace sequences with just one space
export const equalizeWhitespace = (s: string) => s.replace(/\s+/gu, " ");

// True when string contains multiple lines
export const isMultiline = (text: string): boolean => /\n/.test(text);

// Given a type and a field name, returns a type where this field is optional
//
// For example, these two type definitions are equivalent:
//
//   type Foo = Optional<{ foo: string, bar: number }, 'foo'>;
//   type Foo = { foo?: string, bar: number };
//
export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
