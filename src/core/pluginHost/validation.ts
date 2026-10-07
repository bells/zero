import satisfies from "semver/functions/satisfies.js";
import { isProtocolVersion, isProtocolRange } from "./protocol/versions.js";
import { validateManifestStructure, validateMarketStructure } from "./validationStructure.js";
export { SUPPORTED_PLUGIN_PERMISSIONS } from "./validationStructure.js";

const versions = {
  validVersion: isProtocolVersion,
  compatibleHost(value: string) {
    const legacyMinimum = value.startsWith(">=") && isProtocolVersion(value.slice(2));
    return (value === "*" || legacyMinimum || isProtocolRange(value))
      && satisfies("0.1.0", value);
  },
};
export function validatePluginManifest(value: unknown) {
  return validateManifestStructure(value, versions);
}
export function validatePluginMarketIndex(value: unknown) {
  return validateMarketStructure(value, versions);
}
