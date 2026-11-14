import type { CapabilityReport, CompatibilityIssue, HostCapability, RequiredCapability } from "./contracts.js";
import { isProtocolRange, isProtocolVersion, protocolVersionMatches } from "./versions.js";

/** Stable bounded identifiers shared by capability requirements and background events. */
export function validCapabilityId(id: string): boolean {
  return id.length <= 128 && /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(id);
}

/** Compare an explicit provider catalog; this helper does not discover or enable providers. */
export function compareCapabilities(required: readonly RequiredCapability[], providers: readonly HostCapability[]): CapabilityReport {
  const issues: CompatibilityIssue[] = [];
  const add = (code: CompatibilityIssue["code"], path: string, message: string,
    requirement: string | null = null, actual: string | null = null) => {
    issues.push({ code, path, message, required: requirement, actual });
  };
  const catalog = new Map<string, string>();
  if (providers.length > 64) add("capability.invalid", "capabilities", "Too many host capabilities");
  for (const provider of providers) {
    if (!validCapabilityId(provider.id) || provider.version.length > 256
      || !isProtocolVersion(provider.version) || catalog.has(provider.id)) {
      add("capability.invalid", "capabilities", "Invalid or duplicate host capability");
    }
    catalog.set(provider.id, provider.version);
  }
  // An invalid catalog cannot assert that a provider is available.
  if (issues.length) return { compatible: false, capabilities: [], issues };
  const ids = new Set<string>();
  if (required.length > 64) add("manifest.invalid", "requiredCapabilities", "Too many required capabilities");
  for (const [index, requirement] of required.entries()) {
    const path = `requiredCapabilities.${index}`;
    if (!validCapabilityId(requirement.id) || ids.has(requirement.id) || requirement.version.length > 256
      || !isProtocolRange(requirement.version)) {
      add("manifest.invalid", path, "Invalid, duplicate or unbounded capability requirement");
      continue;
    }
    ids.add(requirement.id);
    const actual = catalog.get(requirement.id);
    if (actual === undefined) {
      add("capability.missing", path, `Host upgrade required: missing capability ${requirement.id}`, requirement.version);
    } else if (!protocolVersionMatches(actual, requirement.version)) {
      add("capability.incompatible", path, `Host upgrade required: incompatible capability ${requirement.id}`, requirement.version, actual);
    }
  }
  return { compatible: issues.length === 0, capabilities: providers.map(provider => ({ ...provider })), issues };
}
