#!/usr/bin/env node
import { signPluginPackage, verifyPluginPackage } from './publisher.mjs';

const usage = 'Usage: node scripts/plugin-packages/sign.mjs sign <archive.zplugin> --key-id <id> --private-key-file <pem> [--trust-config <public-json>]\n       node scripts/plugin-packages/sign.mjs verify <archive.zplugin> [--trust-config <public-json>]';
try {
  const [command, archivePath, ...args] = process.argv.slice(2);
  if (!['sign', 'verify'].includes(command) || !archivePath || archivePath.startsWith('--')) throw new Error(usage);
  const allowed = command === 'sign' ? ['--key-id', '--private-key-file', '--trust-config'] : ['--trust-config'];
  const options = { archivePath };
  const names = { '--key-id': 'keyId', '--private-key-file': 'privateKeyFile', '--trust-config': 'trustConfigFile' };
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]; const value = args[index + 1]; const field = names[flag];
    if (!allowed.includes(flag) || !value || value.startsWith('--') || Object.hasOwn(options, field)) throw new Error(usage);
    options[field] = value;
  }
  if (command === 'sign' && (!options.keyId || !options.privateKeyFile)) throw new Error(usage);
  const result = await (command === 'sign' ? signPluginPackage(options) : verifyPluginPackage(options));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // Do not print crypto exception stacks or private key inputs.
  console.error(error instanceof Error ? error.message : 'Publisher operation failed');
  process.exitCode = 1;
}
