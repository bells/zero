import {registerPlugin} from '@zero/sdk';
import {createPaperHost} from './host.js';
import {mountPaper} from './mount.js';

const locale = navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US';
document.documentElement.lang = locale;
const registration = registerPlugin({activate(context) {
  const node = document.getElementById('root');
  if (!node) throw new Error('Missing Paper root');
  context.subscriptions.push(mountPaper(node, createPaperHost(context.bridge), {
    locale, surface: context.session.surfaceId.endsWith('.tray') ? 'tray' : 'main',
  }));
}});
window.addEventListener('pagehide', registration.dispose, {once: true});
void registration.ready.then(result => {
  if (result.ok) return;
  const node = document.getElementById('root');
  if (!node) return;
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = locale === 'zh-CN' ? 'Paper 无法启动，请重新打开工具。' : 'Paper could not start. Reopen the tool to retry.';
  node.replaceChildren(message);
});
