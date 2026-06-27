#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const SUPPORTED_PERMISSIONS = new Set([
  "clipboard.read",
  "clipboard.write",
  "network",
  "storage.plugin",
  "ui.message",
  "process.execute",
]);

const root = process.argv[2];
if (!root) {
  console.error("Usage: node scripts/validate-plugin-package.mjs <plugin-directory>");
  process.exit(2);
}

const manifestPath = path.join(root, "manifest.json");
const issues = [];

if (!fs.existsSync(manifestPath)) {
  issues.push("manifest.json is missing");
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  validateManifest(manifest, issues);

  if (typeof manifest.main === "string") {
    const mainPath = path.join(root, manifest.main);
    if (!fs.existsSync(mainPath)) {
      issues.push(`main entry does not exist: ${manifest.main}`);
    }
  }
}

if (issues.length > 0) {
  console.error("Plugin package validation failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Plugin package validation passed.");

function validateManifest(manifest, issues) {
  for (const field of ["name", "version", "author", "main"]) {
    if (typeof manifest[field] !== "string" || manifest[field].trim() === "") {
      issues.push(`${field} is required`);
    }
  }

  if (!Array.isArray(manifest.permissions)) {
    issues.push("permissions must be an array");
  } else {
    for (const permission of manifest.permissions) {
      if (!SUPPORTED_PERMISSIONS.has(permission)) {
        issues.push(`unsupported permission: ${permission}`);
      }
    }
  }

  if (typeof manifest.name === "string" && !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(manifest.name)) {
    issues.push("name must use lowercase letters, numbers, dots, underscores, or dashes");
  }

  if (typeof manifest.version === "string" && !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    issues.push("version must be a semantic version");
  }

  if (typeof manifest.main === "string" && !isSafePackagePath(manifest.main)) {
    issues.push("main must be a safe package-relative path");
  }
}

function isSafePackagePath(value) {
  if (value.length === 0 || value.trim() !== value || value.includes("\0")) {
    return false;
  }

  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
  ) {
    return false;
  }

  return value
    .split(/[\\/]+/)
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
