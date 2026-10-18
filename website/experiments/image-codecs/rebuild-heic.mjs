import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../output/image-codecs/', import.meta.url));
const sdk = join(root, 'toolchain/emsdk-6.0.12');
const em = join(sdk, 'upstream/emscripten');
const cmake = join(root, 'toolchain/python/cmake/data/bin');
const src = join(root, 'rebuild/src');
const build = join(root, 'rebuild');
const environment = { ...process.env, EMSDK: sdk, EM_CONFIG: join(sdk, '.emscripten'), EM_CACHE: join(root, 'toolchain/em-cache-6.0.12'), PATH: `${join(sdk, 'python/3.13.3_64bit/bin')}:${em}:${cmake}:${process.env.PATH}` };
for (const name of ['CFLAGS', 'CXXFLAGS', 'CPPFLAGS', 'LDFLAGS', 'CPATH', 'C_INCLUDE_PATH', 'CPLUS_INCLUDE_PATH', 'LIBRARY_PATH', 'SDKROOT', 'CC', 'CXX']) delete environment[name];
environment.CFLAGS = '-O3';
environment.CXXFLAGS = '-O3';
function run(command, args, cwd) {
  console.log(`Running ${command.split('/').at(-1)} ${args.map((arg) => arg.startsWith('-sEXPORTED_FUNCTIONS=') ? '-sEXPORTED_FUNCTIONS=<derived symbol list>' : arg).join(' ')}`);
  return execFileSync(command, args, { cwd, env: environment, encoding: 'utf8', stdio: 'inherit' });
}
const manifest = JSON.parse(await readFile(join(root, 'sources/manifest.json'), 'utf8'));
for (const id of ['libheif-1.23.6', 'libde265-1.0.16']) {
  const record = manifest.downloaded.find((entry) => entry.id === id);
  const archive = join(root, `sources/${id}.tar.gz`);
  const bytes = await readFile(archive);
  if (!record || createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error(`Source integrity: ${id}`);
  const directory = join(src, id.startsWith('libheif') ? 'libheif' : 'libde265');
  await mkdir(directory, { recursive: true });
  run('/usr/bin/tar', ['-xzf', archive, '-C', directory, '--strip-components', '1'], root);
}
run(join(em, 'emcc'), ['--version'], root);
const de265Build = join(build, 'de265-build-6.0.12');
await mkdir(de265Build, { recursive: true });
run(join(em, 'emconfigure'), [join(src, 'libde265/configure'), '--host=wasm32', '--enable-static', '--disable-shared', '--disable-sse', '--disable-dec265', '--disable-sherlock265'], de265Build);
run(join(em, 'emmake'), ['/usr/bin/make', '-j2'], de265Build);
const heifBuild = join(build, 'heif-build-6.0.12');
await mkdir(heifBuild, { recursive: true });
const disable = ['X264', 'OpenH264_DECODER', 'X265', 'KVAZAAR', 'FFMPEG_DECODER', 'UVG266', 'VVDEC', 'VVENC', 'RAV1E', 'SvtEnc', 'AOM_DECODER', 'AOM_ENCODER', 'DAV1D', 'JPEG_DECODER', 'JPEG_ENCODER', 'OpenJPEG_ENCODER', 'OpenJPEG_DECODER', 'OPENJPH_ENCODER', 'LIBSHARPYUV', 'WEBCODECS', 'UNCOMPRESSED_CODEC', 'GDK_PIXBUF', 'EXAMPLES', 'LIBSHARPYUV_INTERNAL'];
run(join(em, 'emcmake'), [join(cmake, 'cmake'), join(src, 'libheif'), '-G', 'Unix Makefiles', '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DENABLE_PLUGIN_LOADING=OFF', '-DENABLE_MULTITHREADING_SUPPORT=OFF', '-DBUILD_TESTING=OFF', '-DWITH_LIBDE265=ON', `-DLIBDE265_INCLUDE_DIR=${join(src, 'libde265')}`, `-DLIBDE265_LIBRARY=${join(de265Build, 'libde265/.libs/libde265.a')}`, ...disable.map((name) => `-DWITH_${name}=OFF`)], heifBuild);
run(join(em, 'emmake'), ['/usr/bin/make', '-j2'], heifBuild);
const library = join(heifBuild, 'libheif/libheif.a');
const symbols = execFileSync(join(sdk, 'upstream/bin/llvm-nm'), [library, '--format=just-symbols'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const exported = [...new Set(symbols.split('\n').map((line) => line.trim()).filter((name) => /^(?:heif_|de265_)[A-Za-z0-9_]+$/.test(name)).map((name) => `_${name}`))];
const output = join(build, 'libheif-rebuilt.js');
run(join(em, 'em++'), ['-Wl,--whole-archive', library, '-Wl,--no-whole-archive', join(de265Build, 'libde265/.libs/libde265.a'), '-lembind', '--post-js', join(src, 'libheif/post.js'), '-sWASM=0', '-sDYNAMIC_EXECUTION=0', '-sMODULARIZE', '-sEXPORT_ES6', '-sEXPORT_NAME=libheif', '-sWASM_ASYNC_COMPILATION=0', '-sALLOW_MEMORY_GROWTH', `-sEXPORTED_FUNCTIONS=${exported.concat(['_free', '_malloc', '_memcpy']).join(',')}`, '-O3', '-o', output], heifBuild);
const bytes = await readFile(output);
const metadata = { emscripten: '6.0.12', cmake: '3.31.6', sources: manifest.downloaded.filter((entry) => ['libheif-1.23.6', 'libde265-1.0.16'].includes(entry.id)), mode: 'asm.js ES module, CSP-safe, static HEVC decoder only', artifact: { file: 'libheif-rebuilt.js', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, browserReplacementVerified: false };
await writeFile(join(build, 'build-manifest.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log('Rebuilt HEIC binding; browser replacement verification still required.');
