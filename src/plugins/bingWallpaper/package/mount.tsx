import {createRoot} from 'react-dom/client';
import {createPaperController, type PaperController} from './controller.js';
import {PaperView, type PaperSurface} from './PaperView.js';
import type {PaperLocale} from './i18n.js';
import type {PaperHostPort} from './ports.js';
import {usePaper} from './usePaper.js';
import './style.css';
export interface PaperDisposable {dispose(): void}
function PaperApp({controller, locale, surface}: {controller: PaperController; locale: PaperLocale; surface: PaperSurface}) {
  const state = usePaper(controller);
  return <PaperView state={state} controller={controller} locale={locale} surface={surface} />;
}
export function mountPaper(node: HTMLElement, host: PaperHostPort, options: {locale: PaperLocale; surface: PaperSurface}): PaperDisposable {
  const controller = createPaperController(host);
  const root = createRoot(node);
  root.render(<PaperApp controller={controller} {...options} />);
  return {dispose() {root.unmount(); controller.dispose();}};
}
