# Zero plugin SDK (local development)

This package owns the public TypeScript protocol, diagnostics inputs, capability comparison and session-bound Bridge. It builds from this directory with its declared dependencies; it imports no private host implementation or Tauri API. React integration is available at `@zero/sdk/react`.

Run `node scripts/build-plugin-sdk.mjs --output /tmp/zero-plugin-sdk` from the repository to produce a local package using only SDK source and declared installed dependencies. From an independent checkout of this directory, install the declared dependencies and run `npm run build`.

`compareCapabilities(required, providers)` compares the explicit catalog supplied by the host. It never invents, discovers or enables providers. `requiredCapabilities` and `background` declarations do not enable native methods, background execution or the public runtime. Native release gates and permission checks still apply.

Host-only registry snapshots remain in the host contracts. They are not available to installed plugins through the Bridge. The SDK has not been published; this package is a local build artifact, not a public compatibility or release claim.
