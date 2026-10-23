import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { searchKeymap, openSearchPanel } from '@codemirror/search';
export interface MarkdownEditor {
  set(source: string): void; replace(before: string, after?: string): void; command(action: string): void;
  scrollLine(line: number): void; topLine(): number; destroy(): void;
}
export function createMarkdownEditor(source: HTMLTextAreaElement, host: HTMLElement, changed: () => void, scrolled: () => void): MarkdownEditor {
  const phrases: Record<string, string> = document.documentElement.lang.startsWith('zh') ? { Find: '查找', Replace: '替换', next: '下一处', previous: '上一处', all: '全部', 'match case': '区分大小写', regexp: '正则', 'by word': '整词匹配', replace: '替换', 'replace all': '全部替换', close: '关闭', 'Go to line': '跳转到行', go: '跳转', 'current match': '当前匹配', 'on line': '所在行', 'replaced $ matches': '已替换 $ 处', 'replaced match on line $': '已替换第 $ 行匹配' } : {};
  const view = new EditorView({ parent: host, state: EditorState.create({ doc: source.value, selection: { anchor: source.selectionDirection === 'backward' ? source.selectionEnd : source.selectionStart, head: source.selectionDirection === 'backward' ? source.selectionStart : source.selectionEnd }, extensions: [EditorState.phrases.of(phrases), markdown(), history(), lineNumbers(), highlightActiveLine(), syntaxHighlighting(HighlightStyle.define([{ tag: tags.heading, color: 'var(--accent)', fontWeight: 'bold' }, { tag: tags.strong, fontWeight: 'bold' }, { tag: tags.emphasis, fontStyle: 'italic' }, { tag: tags.link, color: 'var(--accent)', textDecoration: 'underline' }, { tag: tags.url, color: 'var(--wt-code-string)' }, { tag: [tags.keyword, tags.tagName], color: 'var(--wt-code-keyword)' }, { tag: tags.string, color: 'var(--wt-code-string)' }, { tag: [tags.number, tags.bool, tags.null], color: 'var(--wt-code-number)' }, { tag: [tags.comment, tags.meta, tags.quote], color: 'var(--muted)' }])), keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]), EditorView.lineWrapping, EditorView.contentAttributes.of({ 'aria-label': source.labels?.[0]?.textContent ?? 'Markdown', spellcheck: 'false' }), EditorView.theme({ '&': { height: '100%', background: 'var(--paper)', color: 'var(--ink)' }, '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--mono)' }, '.cm-gutters': { background: 'var(--wt-soft)', color: 'var(--muted)', borderColor: 'var(--line)' }, '.cm-panels': { background: 'var(--wt-soft)', color: 'var(--ink)' }, '.cm-button, .cm-textfield': { background: 'var(--wt-surface)', color: 'var(--ink)', borderColor: 'var(--line)' }, '.cm-search': { paddingRight: '48px' }, '.cm-search label': { display: 'inline-flex', minHeight: '44px', alignItems: 'center', gap: '4px' }, '.cm-content': { padding: '20px 0', caretColor: 'var(--ink)' }, '.cm-line': { padding: '0 16px' }, '.cm-activeLine': { background: 'var(--wt-soft)' }, '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { background: '#487d8055' } }), EditorView.updateListener.of(update => { if (update.docChanged) { source.value = update.state.doc.toString(); changed(); } }), EditorView.domEventHandlers({ scroll: () => { scrolled(); } })] }) });
  source.hidden = true; host.hidden = false; view.focus();
  return {
    set(text) { if (text !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); },
    replace(before, after = '') { const { from, to } = view.state.selection.main; const text = view.state.sliceDoc(from, to); view.dispatch({ changes: { from, to, insert: before + text + after }, selection: { anchor: from + before.length, head: from + before.length + text.length } }); view.focus(); },
    command(action) { if (action === 'undo') undo(view); else if (action === 'redo') redo(view); else openSearchPanel(view); view.focus(); },
    scrollLine(line) { const at = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines))).from; view.dispatch({ effects: EditorView.scrollIntoView(at, { y: 'start' }) }); },
    topLine() { const at = view.lineBlockAtHeight(view.scrollDOM.scrollTop).from; return view.state.doc.lineAt(at).number; },
    destroy() { view.destroy(); host.hidden = true; source.hidden = false; }
  };
}
