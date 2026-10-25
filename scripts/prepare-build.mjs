import { resolveBuildProfile } from './build-profile.mjs';
import { prepareFileEngine } from './prepare-file-engine.mjs';
import { prepareWindowsOcr, windowsOcrRequired } from './prepare-windows-ocr.mjs';
const profile = resolveBuildProfile(process.env.ZERO_BUILD_PROFILE);
if (profile.tools.includes('file')) prepareFileEngine();
const target = process.env.ZERO_TARGET_TRIPLE ?? process.env.TAURI_ENV_TARGET_TRIPLE;
if (windowsOcrRequired({ target, tools: profile.tools })) {
  if (target && !target.startsWith('x86_64-')) throw new Error('Bundled Windows OCR currently requires x86_64');
  await prepareWindowsOcr({ download: true });
}
