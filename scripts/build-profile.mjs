export const BUILD_PROFILES = {
  full: { tools: ['snap', 'awake', 'paper', 'launch', 'file'], features: ['bundled-tools', 'file-tool'] },
  core: { tools: [], features: [] },
  standard: { tools: ['snap', 'awake', 'paper', 'launch'], features: ['bundled-tools'] },
};

export function resolveBuildProfile(name = 'full') {
  if (!Object.hasOwn(BUILD_PROFILES, name)) throw new Error(`Unknown Zero build profile: ${name}`);
  return { name, ...BUILD_PROFILES[name] };
}
