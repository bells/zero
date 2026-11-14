/** Publisher identity proof; it grants no plugin permissions or native access. */
export interface OfficialPackageSignature {
  schemaVersion: 1;
  keyId: string;
  pluginId: string;
  pluginVersion: string;
  sha256: string;
  signature: string;
}
