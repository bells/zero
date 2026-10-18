import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const binding = process.env.IMAGE_CODEC_HEIF_BINDING || fileURLToPath(new URL('../src/lib/libheif-without-unsafe-eval.js', pathToFileURL(require.resolve('heic-to'))));
if (!isAbsolute(binding) || !existsSync(binding)) throw new Error('IMAGE_CODEC_HEIF_BINDING must name an existing absolute local file');
export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/image-lab/',
  publicDir: fileURLToPath(new URL('../../output/image-codecs/fixtures', import.meta.url)),
  resolve: { alias: { '@zero-experiment/libheif': binding } },
  build: { outDir: '../../output/image-codecs/dist', emptyOutDir: true },
  worker: { format: 'es' },
  preview: { host: '127.0.0.1', port: 4325, strictPort: true },
};
