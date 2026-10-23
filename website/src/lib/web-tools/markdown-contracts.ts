import type { Root } from 'mdast';

export type MarkdownLocale = 'zh' | 'en';
export interface MarkdownHeading { id: string; text: string; line: number }
export interface MarkdownImage { id: string; url: string; alt: string }
export interface MarkdownDocument {
  tree: Root;
  html: string;
  title: string;
  headings: MarkdownHeading[];
  images: MarkdownImage[];
  characters: number;
  words: number;
}
export type MarkdownAssets = Record<string, string>;
export type MarkdownErrorCode = 'source-limit' | 'invalid-source' | 'invalid-utf8' | 'unsupported-file'
  | 'parse-failed' | 'parse-timeout' | 'image-limit' | 'image-type' | 'image-decode' | 'image-fetch'
  | 'unsafe-url' | 'font-limit' | 'font-fetch' | 'font-glyph' | 'output-limit' | 'pdf-pages'
  | 'pdf-timeout' | 'pdf-failed' | 'cancelled' | 'worker-failed' | 'draft-invalid' | 'draft-conflict'
  | 'storage-unavailable' | 'download-failed';
