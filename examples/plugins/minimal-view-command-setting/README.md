# Minimal Zero Plugin

This example contributes:

- one view: `minimal-view-command-setting.main`
- one command: `minimal-view-command-setting.hello`
- one setting: `enabled`

Validate it from the repository root:

```bash
node scripts/validate-plugin-package.mjs examples/plugins/minimal-view-command-setting
```

Package it from this directory:

```bash
zip -r minimal-view-command-setting.zplugin manifest.json dist README.md
```
