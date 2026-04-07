#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');

function run(cmd) {
  console.log('\n$ ' + cmd);
  execSync(cmd, { stdio: 'inherit' });
}

function die(msg) {
  console.error('Error:', msg);
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
if (!rawArgs.length) {
  console.log('Uso: fix-libs <lib1> <lib2> ... | /pattern/flags ...');
  process.exit(0);
}

let pkgJson;
try {
  pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
} catch (err) {
  die('No se pudo leer package.json en el directorio actual. Ejecuta el comando desde la raíz del proyecto.');
}

const deps = new Set(Object.keys(pkgJson.dependencies || {}));
const devDeps = new Set(Object.keys(pkgJson.devDependencies || {}));

// Support mixing explicit package names and regex patterns (e.g. '/^@babel/')
const explicit = [];
const regexes = [];
for (const a of rawArgs) {
  if (a.length >= 2 && a[0] === '/' && a.lastIndexOf('/') > 0) {
    const last = a.lastIndexOf('/');
    const pattern = a.slice(1, last);
    const flags = a.slice(last + 1);
    try {
      regexes.push(new RegExp(pattern, flags));
    } catch (e) {
      die(`Regex inválida: ${a}`);
    }
  } else {
    explicit.push(a);
  }
}

const matched = new Set();
const allNames = Array.from(new Set([...(Object.keys(pkgJson.dependencies || {})), ...(Object.keys(pkgJson.devDependencies || {}))]));
for (const r of regexes) {
  for (const name of allNames) {
    if (r.test(name)) matched.add(name);
  }
}

for (const e of explicit) matched.add(e);

const toUninstallProd = [];
const toUninstallDev = [];
for (const p of matched) {
  if (devDeps.has(p)) toUninstallDev.push(p);
  else if (deps.has(p)) toUninstallProd.push(p);
  else toUninstallProd.push(p); // default to prod if not present
}

try {
  if (toUninstallProd.length) {
    run(`npm uninstall ${toUninstallProd.join(' ')}`);
  }
  if (toUninstallDev.length) {
    run(`npm uninstall --save-dev ${toUninstallDev.join(' ')}`);
  }

  console.log('\nRunning npm audit fix...');
  try {
    run('npm audit fix');
  } catch (e) {
    console.warn('`npm audit fix` falló o no encontró cambios (continuando)...');
  }

  // Reinstall
  if (toUninstallProd.length) {
    run(`npm install ${toUninstallProd.join(' ')}`);
  }
  if (toUninstallDev.length) {
    run(`npm install --save-dev ${toUninstallDev.join(' ')}`);
  }

  console.log('\nListo. Paquetes procesados.');
} catch (err) {
  die(err.message || String(err));
}
