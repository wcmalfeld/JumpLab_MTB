// Bundles the ES modules in src/ into single-file HTML builds.
//   dist/jump-lab.html  — full standalone page (drop into any site / iframe)
//   dist/artifact.html  — body-only variant for hosts that supply <html>/<head>
// No dependencies: each module becomes an IIFE namespace.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const order = ['units', 'physics', 'challenges', 'app'];
const ns = (name) => `__${name}`;

function bundleModule(name) {
  let src = readFileSync(`src/${name}.js`, 'utf8');
  const lines = [];
  // imports → bindings to earlier namespaces
  src = src.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+'\.\/(\w+)\.js';\s*$/gm, (_, id, mod) => { lines.push(`const ${id} = ${ns(mod)};`); return ''; });
  src = src.replace(/^import\s+\{([^}]+)\}\s+from\s+'\.\/(\w+)\.js';\s*$/gm, (_, ids, mod) => { lines.push(`const {${ids}} = ${ns(mod)};`); return ''; });
  const exported = [];
  src = src.replace(/^export\s+(const|function|let)\s+(\w+)/gm, (_, kw, id) => { exported.push(id); return `${kw} ${id}`; });
  return `const ${ns(name)} = (() => {\n${lines.join('\n')}\n${src}\nreturn { ${exported.join(', ')} };\n})();`;
}

const js = `'use strict';\n` + order.map(bundleModule).join('\n\n');
const tpl = readFileSync('src/template.html', 'utf8');
const body = tpl.replace('<!--APP-->', `<script>\n${js}\n</script>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/artifact.html', body);

const titleMatch = body.match(/<title>.*?<\/title>/)[0];
const headParts = body.slice(0, body.indexOf('</style>') + 8).replace(titleMatch, '');
const rest = body.slice(body.indexOf('</style>') + 8);
writeFileSync('dist/jump-lab.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${titleMatch}
${headParts}
</head>
<body>
${rest}
</body>
</html>
`);
console.log('Built dist/jump-lab.html and dist/artifact.html', (js.length / 1024).toFixed(1) + ' KB JS');
