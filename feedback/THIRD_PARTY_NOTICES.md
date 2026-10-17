# Waline server reuse

The feedback service uses the released `@waline/vercel@1.43.4` package and its
bundled `@waline/core@0.1.0`, without modifying upstream files. Only the core
library is imported; the default ThinkJS HTTP server is never started.

Upstream: https://github.com/walinejs/waline
Fixed release: https://github.com/walinejs/waline/tree/%40waline/vercel%401.43.4
Commit: c4b0f1ebb9a7970d36493d4c3580f3f43e098fa5

Waline's release README and shipped LICENSE specify GNU GPL version 2.
The packages' MIT metadata conflicts with those files. This service conservatively
uses the GPL v2 grant, preserves upstream notices and license files, and does not
claim MIT-only or dual-license permission. The original license text is retained
in LICENSE. No upstream license file is removed or rewritten.

The new adapter/service source in this directory is licensed GPL-2.0-only.
This is a separate program, not part of the desktop or static website bundles.
If distributing it, include its complete corresponding source, build instructions,
lockfile, changes and upstream notices. Do not apply this license to unrelated
repository directories. Dependencies retain their own licenses; this note is not
a substitute for their notices or a full transitive-license audit.
