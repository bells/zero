import { resolveBuildProfile } from './build-profile.mjs';
import { prepareFileEngine } from './prepare-file-engine.mjs';
const profile = resolveBuildProfile(process.env.ZERO_BUILD_PROFILE);
if (profile.tools.includes('file')) prepareFileEngine();
