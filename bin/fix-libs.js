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

let pkgJson;
try {
  pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
} catch (err) {
  die('No se pudo leer package.json en el directorio actual. Ejecuta el comando desde la raíz del proyecto.');
}

const deps = new Set(Object.keys(pkgJson.dependencies || {}));
const devDeps = new Set(Object.keys(pkgJson.devDependencies || {}));

// If no args, process all libraries
const processAll = !rawArgs.length;
if (processAll) {
  console.log('No se especificaron librerías. Procesando todas las dependencias...');
}

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

// If processing all, add all dependencies
if (processAll) {
  allNames.forEach(name => matched.add(name));
}

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

  // Check for remaining vulnerabilities and add overrides
  console.log('\nVerificando vulnerabilidades restantes...');
  let auditResult;
  try {
    auditResult = execSync('npm audit --json', { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    // npm audit returns non-zero if there are vulnerabilities
    auditResult = e.stdout || e.stderr || '{}';
  }

  try {
    const audit = JSON.parse(auditResult);
    const vulnerabilities = audit.vulnerabilities || {};
    const overridesToAdd = {};

    for (const [pkgName, vulnInfo] of Object.entries(vulnerabilities)) {
      if (vulnInfo.fixAvailable) {
        const fixInfo = vulnInfo.fixAvailable;
        // If it's a breaking change or requires manual intervention
        if (fixInfo.isSemVerMajor || typeof fixInfo === 'object') {
          // Extract target package and version
          const targetPkg = (typeof fixInfo === 'object' && fixInfo.name) ? fixInfo.name : pkgName;
          const targetVersion = (typeof fixInfo === 'object' && fixInfo.version) ? fixInfo.version : fixInfo;
          
          if (targetVersion && targetPkg) {
            overridesToAdd[targetPkg] = targetVersion;
            console.log(`  - Se añadirá override para ${targetPkg}@${targetVersion}`);
          }
        }
      }
    }

    if (Object.keys(overridesToAdd).length > 0) {
      console.log('\nAñadiendo overrides al package.json...');
      const currentPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      
      if (!currentPkg.overrides) {
        currentPkg.overrides = {};
      } else {
        // Check for existing overrides that will be replaced
        for (const pkg of Object.keys(overridesToAdd)) {
          if (currentPkg.overrides[pkg]) {
            console.log(`  ⚠️  Sobrescribiendo override existente: ${pkg}@${currentPkg.overrides[pkg]} → ${overridesToAdd[pkg]}`);
          }
        }
      }
      
      Object.assign(currentPkg.overrides, overridesToAdd);
      
      fs.writeFileSync('package.json', JSON.stringify(currentPkg, null, 2) + '\n');
      console.log('\n⚠️  ADVERTENCIA: Los overrides pueden causar incompatibilidades.');
      console.log('   Asegúrate de probar tu aplicación después de estos cambios.\n');
      console.log('Ejecutando npm install...');
      run('npm install');
      
      console.log('\nVerificando vulnerabilidades después de overrides...');
      try {
        run('npm audit');
      } catch (e) {
        console.warn('Aún pueden quedar algunas vulnerabilidades.');
      }
    } else {
      console.log('No se encontraron vulnerabilidades que requieran overrides.');
    }
  } catch (parseErr) {
    console.warn('No se pudo parsear el resultado de npm audit:', parseErr.message);
  }

  console.log('\nListo. Paquetes procesados.');
} catch (err) {
  die(err.message || String(err));
}
