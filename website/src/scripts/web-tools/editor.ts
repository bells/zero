import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { foldGutter, foldKeymap, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { json } from '@codemirror/lang-json';
import { setDiagnostics } from '@codemirror/lint';
import type { ToolError } from '../../lib/web-tools/contracts';
export interface EditorHandle { set(text: string): void; error(error?: ToolError): void; focus(): void; destroy(): void }
export function createEditor(source: HTMLTextAreaElement, host: HTMLElement, changed: () => void): EditorHandle {
  const view = new EditorView({ parent: host, state: EditorState.create({ doc: source.value, selection: { anchor: source.selectionStart, head: source.selectionEnd }, extensions: [json(), lineNumbers(), foldGutter(), highlightActiveLine(), history(), keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]), syntaxHighlighting(HighlightStyle.define([{ tag: tags.string, color: 'var(--wt-code-string)' }, { tag: tags.number, color: 'var(--wt-code-number)' }, { tag: [tags.bool, tags.null], color: 'var(--wt-code-keyword)' }, { tag: tags.propertyName, color: 'var(--ink)' }])), EditorView.contentAttributes.of({ 'aria-label': source.labels?.[0]?.textContent ?? 'JSON', spellcheck: 'false' }), EditorView.theme({ '&': { color: 'var(--ink)', backgroundColor: 'var(--paper)' }, '.cm-content': { caretColor: 'var(--ink)' }, '.cm-gutters': { backgroundColor: 'var(--wt-soft)', color: 'var(--muted)', borderColor: 'var(--line)' }, '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--wt-soft)' }, '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#487d8055' } }), EditorView.updateListener.of((update) => { if (update.docChanged) { source.value = update.state.doc.toString(); changed(); } })] }) });
  host.hidden = false; source.hidden = true; view.focus();
  return { set(text) { if (view.state.doc.toString() !== text) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); }, error(error) { const line = error?.line ? view.state.doc.line(Math.min(error.line, view.state.doc.lines)) : undefined; const from = line ? Math.min(line.to, line.from + (error?.column ?? 1) - 1) : 0; view.dispatch(setDiagnostics(view.state, error && line ? [{ from, to: Math.min(from + 1, view.state.doc.length), severity: 'error', message: error.code === 'json' ? `JSON: ${error.line}:${error.column}` : error.code }] : [])); }, focus() { view.focus(); }, destroy() { view.destroy(); host.hidden = true; source.hidden = false; } };
}
