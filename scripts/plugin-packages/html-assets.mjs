import fs from 'node:fs';
import ts from 'typescript';

// Vite bundles parse5 and its asset registry rather than exposing a public HTML AST API.
// Read that exact locked toolchain registry and fail closed on an unsupported layout/filter.
const viteEntry = import.meta.resolve('vite');
const { parse: parseHtml } = await import(new URL('./chunks/dist.js', viteEntry));
if (typeof parseHtml !== 'function') throw new Error('HTML source boundary: locked Vite HTML parser is unavailable');
const upstream = ts.createSourceFile('vite-html-assets.js', fs.readFileSync(new URL('./chunks/config.js', viteEntry), 'utf8'), ts.ScriptTarget.Latest, true);
function initializer(name) {
  for (const statement of upstream.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration.initializer;
    }
  }
  throw new Error(`HTML source boundary: unsupported Vite asset registry ${name}`);
}
function stringArray(node) {
  if (!node || !ts.isArrayLiteralExpression(node) || node.elements.some(entry => !ts.isStringLiteral(entry))) {
    throw new Error('HTML source boundary: unsupported Vite asset attribute declaration');
  }
  return node.elements.map(entry => entry.text);
}
const metaNames = new Set(stringArray(initializer('ALLOWED_META_NAME')));
const metaProperties = new Set(stringArray(initializer('ALLOWED_META_PROPERTY')));
const table = initializer('DEFAULT_HTML_ASSET_SOURCES');
if (!table || !ts.isObjectLiteralExpression(table)) throw new Error('HTML source boundary: unsupported Vite HTML asset table');
const policy = new Map();
const expectedMetaFilter = 'filter({attributes}){if(attributes.name&&ALLOWED_META_NAME.includes(attributes.name.trim().toLowerCase()))returntrue;if(attributes.property&&ALLOWED_META_PROPERTY.includes(attributes.property.trim().toLowerCase()))returntrue;returnfalse;}';
for (const tag of table.properties) {
  if (!ts.isPropertyAssignment(tag) || !ts.isIdentifier(tag.name) || !ts.isObjectLiteralExpression(tag.initializer)) {
    throw new Error('HTML source boundary: unsupported Vite asset tag declaration');
  }
  const attributes = new Set();
  let metaFilter = false;
  for (const field of tag.initializer.properties) {
    if (ts.isMethodDeclaration(field) && field.name.getText(upstream) === 'filter') {
      if (tag.name.text !== 'meta' || field.getText(upstream).replace(/\s/g, '') !== expectedMetaFilter) {
        throw new Error('HTML source boundary: unsupported Vite asset filter');
      }
      metaFilter = true;
    } else if (ts.isPropertyAssignment(field) && ['srcAttributes', 'srcsetAttributes'].includes(field.name.getText(upstream))) {
      for (const key of stringArray(field.initializer)) attributes.add(key);
    } else throw new Error('HTML source boundary: unsupported Vite asset registry field');
  }
  policy.set(tag.name.text, { attributes, metaFilter });
}
const supportedAttributes = new Set(['src', 'href', 'poster', 'data']);

/** Inspect parsed HTML using Vite's own asset registry without expanding supported syntax. */
export function inspectHtmlAssets(html, { assetPath, inlineStyle }) {
  const document = parseHtml(html, { scriptingEnabled: false, sourceCodeLocationInfo: true });
  function visit(node) {
    if (node.attrs) {
      const attrs = new Map(node.attrs.map(attr => [attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name, attr.value]));
      const rule = policy.get(node.nodeName);
      const activeRule = rule && (!rule.metaFilter || metaNames.has((attrs.get('name') ?? '').trim().toLowerCase())
        || metaProperties.has((attrs.get('property') ?? '').trim().toLowerCase()));
      for (const [key, value] of attrs) {
        if (activeRule && rule.attributes.has(key) && value && !supportedAttributes.has(key)) {
          throw new Error(`HTML asset source boundary: unsupported ${node.nodeName}[${key}]; use explicit module imports`);
        }
        if (supportedAttributes.has(key) || key === 'style') {
          const location = node.sourceCodeLocation?.attrs?.[key];
          const raw = location ? html.slice(location.startOffset, location.endOffset) : '';
          if (/[&%\\]/.test(raw)) throw new Error(`HTML asset source boundary: encoded/escaped ${key} is unsupported`);
          if (key === 'style') inlineStyle(value);
          else assetPath(value);
        }
      }
      if (node.nodeName === 'script' && node.childNodes?.some(child => child.nodeName === '#text' && child.value.trim())) {
        throw new Error('Source boundary: inline scripts are unsupported; use an explicit module entry');
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(document);
}
