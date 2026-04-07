#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const readline = require('readline');

// ============================================================================
// CONSTANTS
// ============================================================================

const TRIVY_SEVERITIES = 'HIGH,CRITICAL';
const TRIVY_SCAN_CMD = `trivy fs --scanners vuln --severity ${TRIVY_SEVERITIES} --format json --quiet .`;
const VERSION_SCORE_WEIGHTS = {
  MAJOR: 1000,
  MINOR: 100,
  PATCH: 1
};

// Global flag for silent mode
let SILENT_MODE = false;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function run(cmd) {
  if (!SILENT_MODE) {
    console.log('\n$ ' + cmd);
  }
  
  try {
    if (SILENT_MODE) {
      // In silent mode, suppress npm output
      execSync(cmd, { stdio: 'pipe' });
    } else {
      execSync(cmd, { stdio: 'inherit' });
    }
  } catch (e) {
    // If command fails, show error even in silent mode
    if (SILENT_MODE && e.stderr) {
      console.error(e.stderr.toString());
    }
    throw e;
  }
}

function die(msg) {
  console.error('Error:', msg);
  process.exit(1);
}

function askUser(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function safeExecSync(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...options });
  } catch (e) {
    return null;
  }
}

// ============================================================================
// PACKAGE.JSON OPERATIONS
// ============================================================================

function readPackageJson() {
  try {
    return JSON.parse(fs.readFileSync('package.json', 'utf8'));
  } catch (err) {
    die('No se pudo leer package.json en el directorio actual. Ejecuta el comando desde la raíz del proyecto.');
  }
}

function writePackageJson(pkg) {
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

function removeOverridesForPackages(packages) {
  if (packages.length === 0) return;
  
  const pkg = readPackageJson();
  if (!pkg.overrides) return;
  
  let overridesRemoved = false;
  for (const pkgName of packages) {
    if (pkg.overrides[pkgName]) {
      console.log(`🗑️  Removiendo override existente para ${pkgName} (será reinstalado)`);
      delete pkg.overrides[pkgName];
      overridesRemoved = true;
    }
  }
  
  if (overridesRemoved) {
    writePackageJson(pkg);
  }
}

function updateDirectDepsToMatchOverrides(overrides) {
  const pkg = readPackageJson();
  let directDepsUpdated = false;
  
  for (const [pkgName, version] of Object.entries(overrides)) {
    if (pkg.dependencies?.[pkgName]) {
      console.log(`  🔄 Actualizando dependencies[${pkgName}]: ${pkg.dependencies[pkgName]} → ${version}`);
      pkg.dependencies[pkgName] = version;
      directDepsUpdated = true;
    }
    if (pkg.devDependencies?.[pkgName]) {
      console.log(`  🔄 Actualizando devDependencies[${pkgName}]: ${pkg.devDependencies[pkgName]} → ${version}`);
      pkg.devDependencies[pkgName] = version;
      directDepsUpdated = true;
    }
  }
  
  return directDepsUpdated;
}

// ============================================================================
// VERSION COMPARISON UTILITIES
// ============================================================================

function parseVersion(version) {
  return version.replace(/[^0-9.]/g, '').split('.').map(Number);
}

function compareVersions(v1, v2) {
  const parts1 = parseVersion(v1 || '0.0.0');
  const parts2 = parseVersion(v2 || '0.0.0');
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

function calculateVersionDistance(currentVersion, targetVersion) {
  const currentParts = parseVersion(currentVersion);
  const targetParts = parseVersion(targetVersion);
  
  let score = 0;
  if (targetParts[0] !== currentParts[0]) score += VERSION_SCORE_WEIGHTS.MAJOR;
  if (targetParts[1] !== currentParts[1]) score += VERSION_SCORE_WEIGHTS.MINOR;
  if (targetParts[2] !== currentParts[2]) score += VERSION_SCORE_WEIGHTS.PATCH;
  
  return score;
}

function chooseClosestVersion(currentVersion, fixVersions) {
  if (!currentVersion || fixVersions.length === 0) {
    return fixVersions.sort(compareVersions)[0];
  }
  
  let bestVersion = fixVersions[0];
  let bestScore = Infinity;
  
  for (const version of fixVersions) {
    const score = calculateVersionDistance(currentVersion, version);
    
    if (compareVersions(version, currentVersion) >= 0 && score < bestScore) {
      bestScore = score;
      bestVersion = version;
    }
  }
  
  return bestVersion;
}

// ============================================================================
// DEPENDENCY ANALYSIS
// ============================================================================

function getCurrentVersions() {
  try {
    const lockData = fs.readFileSync('package-lock.json', 'utf8');
    const lock = JSON.parse(lockData);
    const versions = {};
    
    if (lock.packages) {
      for (const [path, info] of Object.entries(lock.packages)) {
        if (!path) continue;
        const pkgName = path.replace(/^node_modules\//, '').split('/node_modules/').pop();
        if (info.version && !versions[pkgName]) {
          versions[pkgName] = info.version;
        }
      }
    }
    
    return versions;
  } catch (e) {
    console.warn('No se pudo leer package-lock.json, usando versiones por defecto');
    return {};
  }
}

function isDirectDependency(packageName) {
  const result = safeExecSync(`npm list ${packageName} --depth=0 2>/dev/null`);
  return result ? result.includes(packageName) : false;
}

function hasMultipleVersions(packageName) {
  const result = safeExecSync(`npm list ${packageName} 2>/dev/null`);
  if (!result) return false;
  
  const lines = result.split('\n').filter(line => line.includes(packageName));
  return lines.length > 1;
}

// ============================================================================
// TRIVY INTEGRATION
// ============================================================================

function checkTrivyInstalled() {
  return safeExecSync('which trivy') !== null;
}

function runTrivyScan() {
  if (!checkTrivyInstalled()) {
    console.log('\n💡 Trivy no está instalado. Para análisis adicional de CVEs:');
    console.log('   macOS: brew install trivy');
    console.log('   Linux: apt-get install trivy / yum install trivy');
    return null;
  }

  console.log('\n🔍 Ejecutando análisis de CVEs con Trivy...');
  
  try {
    const result = execSync(TRIVY_SCAN_CMD, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return JSON.parse(result);
  } catch (e) {
    try {
      if (e.stdout) {
        return JSON.parse(e.stdout);
      }
    } catch (parseErr) {
      console.warn('No se pudo parsear el resultado de Trivy');
    }
    return null;
  }
}

function extractTrivyVulnerabilities(trivyData, currentVersions) {
  if (!trivyData || !trivyData.Results) return {};
  
  const vulnOptions = {};
  
  // Collect all possible fix versions for each package
  for (const result of trivyData.Results) {
    if (!result.Vulnerabilities) continue;
    
    for (const vuln of result.Vulnerabilities) {
      const pkgName = vuln.PkgName;
      const fixedVersion = vuln.FixedVersion;
      
      if (fixedVersion && fixedVersion !== '' && fixedVersion !== 'unknown') {
        if (!vulnOptions[pkgName]) {
          vulnOptions[pkgName] = [];
        }
        if (!vulnOptions[pkgName].includes(fixedVersion)) {
          vulnOptions[pkgName].push(fixedVersion);
        }
      }
    }
  }
  
  // Choose the closest version for each package
  const vulnMap = {};
  for (const [pkgName, versions] of Object.entries(vulnOptions)) {
    const currentVersion = currentVersions[pkgName];
    vulnMap[pkgName] = versions.length === 1 
      ? versions[0]
      : chooseClosestVersion(currentVersion, versions);
  }
  
  return vulnMap;
}

// ============================================================================
// PACKAGE PROCESSING
// ============================================================================

function uninstallPackages(prodPackages, devPackages) {
  if (prodPackages.length) {
    run(`npm uninstall ${prodPackages.join(' ')}`);
  }
  if (devPackages.length) {
    run(`npm uninstall --save-dev ${devPackages.join(' ')}`);
  }
}

function runAuditFix() {
  console.log('\nRunning npm audit fix...');
  try {
    run('npm audit fix');
  } catch (e) {
    console.warn('`npm audit fix` falló o no encontró cambios (continuando)...');
  }
}

function installPackages(prodPackages, devPackages, exactFlag) {
  if (prodPackages.length) {
    run(`npm install${exactFlag} ${prodPackages.join(' ')}`);
  }
  if (devPackages.length) {
    run(`npm install --save-dev${exactFlag} ${devPackages.join(' ')}`);
  }
}

// ============================================================================
// VULNERABILITY FIXING
// ============================================================================

async function applyOverridesAfterUserConfirmation(overrides, currentVersions) {
  console.log('\n📝 Overrides propuestos para dependencias transitivas:');
  
  const pkg = readPackageJson();
  if (!pkg.overrides) pkg.overrides = {};
  
  // Check for existing overrides that will be replaced
  for (const pkgName of Object.keys(overrides)) {
    if (pkg.overrides[pkgName]) {
      console.log(`  ⚠️  Sobrescribiendo: ${pkgName}@${pkg.overrides[pkgName]} → ${overrides[pkgName]}`);
    }
  }
  
  // Display proposed overrides
  for (const [pkgName, version] of Object.entries(overrides)) {
    const current = currentVersions[pkgName] || '?';
    console.log(`  - ${pkgName}: ${current} → ${version}`);
  }
  
  console.log('\n⚠️  ADVERTENCIA: Los overrides pueden causar incompatibilidades.');
  console.log('   Esto solucionará las vulnerabilidades pero puede romper tu aplicación.');
  
  const answer = await askUser('\n¿Deseas aplicar estos overrides? (Y/n): ');
  
  if (answer === 'y' || answer === 'yes' || answer === '') {
    Object.assign(pkg.overrides, overrides);
    
    // Update direct dependencies to match override versions
    const directDepsUpdated = updateDirectDepsToMatchOverrides(overrides);
    
    writePackageJson(pkg);
    
    console.log('\n✅ Overrides añadidos.');
    if (directDepsUpdated) {
      console.log('✅ Dependencias directas actualizadas a versiones exactas.');
    }
    console.log('Ejecutando npm install...');
    run('npm install');
    
    // Final verification
    console.log('\n🔍 Verificación final con Trivy...');
    try {
      execSync(`trivy fs --scanners vuln --severity ${TRIVY_SEVERITIES} .`, { stdio: 'inherit' });
    } catch (e) {
      console.log(`\n⚠️  Aún quedan algunas vulnerabilidades ${TRIVY_SEVERITIES}.`);
    }
    
    return true;
  } else {
    console.log('\n❌ Overrides cancelados por el usuario.');
    console.log('   Puedes aplicarlos manualmente en package.json cuando estés listo.');
    return false;
  }
}

async function processVulnerabilities(vulnerablePackages, currentVersions, deps, devDeps, useExact) {
  console.log('\n📋 Vulnerabilidades encontradas por Trivy:');
  console.log('\n🔍 Verificando árbol de dependencias con npm list...');
  
  const overridesToAdd = {};
  const directUpdates = { prod: [], dev: [] };
  
  // Classify each vulnerable package
  for (const [pkgName, fixedVersion] of Object.entries(vulnerablePackages)) {
    const currentVer = currentVersions[pkgName] || 'desconocida';
    const isDirect = isDirectDependency(pkgName);
    const hasMultipleVers = hasMultipleVersions(pkgName);
    
    if (isDirect) {
      if (deps.has(pkgName)) {
        directUpdates.prod.push(`${pkgName}@${fixedVersion}`);
        console.log(`  - ${pkgName}: ${currentVer} → ${fixedVersion} [directo - producción]`);
      } else if (devDeps.has(pkgName)) {
        directUpdates.dev.push(`${pkgName}@${fixedVersion}`);
        console.log(`  - ${pkgName}: ${currentVer} → ${fixedVersion} [directo - desarrollo]`);
      }
      
      if (hasMultipleVers) {
        console.log(`    ℹ️  Múltiples versiones detectadas - npm install resolverá subdependencias`);
      }
    } else {
      overridesToAdd[pkgName] = fixedVersion;
      console.log(`  - ${pkgName}: ${currentVer} → ${fixedVersion} [transitivo - override]`);
    }
  }
  
  // Update direct dependencies
  if (directUpdates.prod.length > 0) {
    console.log('\n🔄 Actualizando dependencias directas:');
    directUpdates.prod.forEach(pkg => console.log(`  - ${pkg}`));
    run(`npm install${useExact ? ' --save-exact' : ''} ${directUpdates.prod.join(' ')}`);
  }
  
  if (directUpdates.dev.length > 0) {
    console.log('\n🔄 Actualizando dependencias de desarrollo:');
    directUpdates.dev.forEach(pkg => console.log(`  - ${pkg}`));
    run(`npm install --save-dev${useExact ? ' --save-exact' : ''} ${directUpdates.dev.join(' ')}`);
  }
  
  // Apply overrides for transitive dependencies
  if (Object.keys(overridesToAdd).length > 0) {
    await applyOverridesAfterUserConfirmation(overridesToAdd, currentVersions);
  } else if (directUpdates.prod.length === 0 && directUpdates.dev.length === 0) {
    console.log('\nNo se requieren overrides ni actualizaciones.');
  }
}

// ============================================================================
// COMMAND LINE ARGUMENT PARSING
// ============================================================================

function parseArguments() {
  const rawArgs = process.argv.slice(2);
  const useExact = rawArgs.includes('--exact');
  const onlyTrivy = rawArgs.includes('--trivy');
  const silent = rawArgs.includes('--silent');
  const filteredArgs = rawArgs.filter(a => a !== '--exact' && a !== '--trivy' && a !== '--silent');
  
  return { useExact, onlyTrivy, silent, filteredArgs };
}

function parsePackagePatterns(args) {
  const explicit = [];
  const regexes = [];
  
  for (const arg of args) {
    if (arg.length >= 2 && arg[0] === '/' && arg.lastIndexOf('/') > 0) {
      const last = arg.lastIndexOf('/');
      const pattern = arg.slice(1, last);
      const flags = arg.slice(last + 1);
      try {
        regexes.push(new RegExp(pattern, flags));
      } catch (e) {
        die(`Regex inválida: ${arg}`);
      }
    } else {
      explicit.push(arg);
    }
  }
  
  return { explicit, regexes };
}

function matchPackages(patterns, allPackages) {
  const matched = new Set();
  
  for (const regex of patterns.regexes) {
    for (const name of allPackages) {
      if (regex.test(name)) matched.add(name);
    }
  }
  
  for (const name of patterns.explicit) {
    matched.add(name);
  }
  
  return matched;
}

// ============================================================================
// TRIVY MODE
// ============================================================================

async function runTrivyMode(useExact, deps, devDeps) {
  console.log('\n🔍 Escaneando con Trivy para identificar paquetes vulnerables...');
  const trivyData = runTrivyScan();
  
  if (!trivyData) {
    die('No se pudo ejecutar Trivy. Asegúrate de que esté instalado.');
  }
  
  const currentVersions = getCurrentVersions();
  const vulnerablePackages = extractTrivyVulnerabilities(trivyData, currentVersions);
  
  if (Object.keys(vulnerablePackages).length === 0) {
    console.log('\n✅ No se encontraron vulnerabilidades HIGH/CRITICAL.');
    console.log('\nListo. No hay paquetes que procesar.');
    return;
  }
  
  // Identify direct dependencies
  console.log('\n📦 Identificando dependencias directas vulnerables...');
  const toUninstallProd = [];
  const toUninstallDev = [];
  
  for (const pkgName of Object.keys(vulnerablePackages)) {
    const isDirect = isDirectDependency(pkgName);
    const hasMultipleVers = hasMultipleVersions(pkgName);
    
    if (isDirect) {
      if (deps.has(pkgName)) {
        toUninstallProd.push(pkgName);
        console.log(`  - ${pkgName} (producción)`);
      } else if (devDeps.has(pkgName)) {
        toUninstallDev.push(pkgName);
        console.log(`  - ${pkgName} (desarrollo)`);
      }
      
      if (hasMultipleVers) {
        console.log(`    ℹ️  Múltiples versiones - npm install las resolverá`);
      }
    }
  }
  
  if (toUninstallProd.length === 0 && toUninstallDev.length === 0) {
    console.log('  → Todas las vulnerabilidades son en subdependencias (se usarán overrides)');
  }
  
  // Process packages
  if (toUninstallProd.length || toUninstallDev.length) {
    removeOverridesForPackages([...toUninstallProd, ...toUninstallDev]);
    uninstallPackages(toUninstallProd, toUninstallDev);
    runAuditFix();
    
    // Reinstall with specific versions from Trivy
    const prodWithVersions = toUninstallProd.map(p => 
      vulnerablePackages[p] ? `${p}@${vulnerablePackages[p]}` : p
    );
    const devWithVersions = toUninstallDev.map(p => 
      vulnerablePackages[p] ? `${p}@${vulnerablePackages[p]}` : p
    );
    
    if (prodWithVersions.length) {
      console.log('\n📥 Reinstalando con versiones parcheadas:');
      prodWithVersions.forEach(p => console.log(`  - ${p}`));
      run(`npm install${useExact ? ' --save-exact' : ''} ${prodWithVersions.join(' ')}`);
    }
    if (devWithVersions.length) {
      console.log('\n📥 Reinstalando dependencias de desarrollo:');
      devWithVersions.forEach(p => console.log(`  - ${p}`));
      run(`npm install --save-dev${useExact ? ' --save-exact' : ''} ${devWithVersions.join(' ')}`);
    }
  } else {
    runAuditFix();
  }
  
  // Process any remaining vulnerabilities with overrides
  await processSecondTrivyScan(useExact, deps, devDeps);
}

async function processSecondTrivyScan(useExact, deps, devDeps) {
  const trivyData = runTrivyScan();
  
  if (trivyData) {
    const currentVersions = getCurrentVersions();
    const vulnerablePackages = extractTrivyVulnerabilities(trivyData, currentVersions);
    
    if (Object.keys(vulnerablePackages).length > 0) {
      await processVulnerabilities(vulnerablePackages, currentVersions, deps, devDeps, useExact);
    } else {
      console.log('\n✅ No se encontraron vulnerabilidades HIGH/CRITICAL.');
    }
  } else {
    console.log('\n⚠️  No se pudo ejecutar Trivy. Saltando análisis de CVEs.');
  }
}

// ============================================================================
// NORMAL MODE
// ============================================================================

async function runNormalMode(matched, deps, devDeps, useExact, processAll) {
  // Add all packages if processing all
  if (processAll) {
    const allNames = [...deps, ...devDeps];
    allNames.forEach(name => matched.add(name));
  }
  
  // Classify packages
  const toUninstallProd = [];
  const toUninstallDev = [];
  
  for (const pkg of matched) {
    if (devDeps.has(pkg)) {
      toUninstallDev.push(pkg);
    } else if (deps.has(pkg)) {
      toUninstallProd.push(pkg);
    } else {
      toUninstallProd.push(pkg);
    }
  }
  
  const exactFlag = useExact ? ' --save-exact' : '';
  
  // Remove conflicting overrides
  removeOverridesForPackages([...toUninstallProd, ...toUninstallDev]);
  
  // Uninstall, audit, reinstall
  uninstallPackages(toUninstallProd, toUninstallDev);
  runAuditFix();
  installPackages(toUninstallProd, toUninstallDev, exactFlag);
  
  // Process vulnerabilities with Trivy
  await processSecondTrivyScan(useExact, deps, devDeps);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { useExact, onlyTrivy, silent, filteredArgs } = parseArguments();
  
  // Set global silent mode
  SILENT_MODE = silent;
  
  const pkgJson = readPackageJson();
  
  const deps = new Set(Object.keys(pkgJson.dependencies || {}));
  const devDeps = new Set(Object.keys(pkgJson.devDependencies || {}));
  
  // Display mode information
  const processAll = !filteredArgs.length;
  if (processAll && !onlyTrivy) {
    console.log('No se especificaron librerías. Procesando todas las dependencias...');
  }
  if (useExact) {
    console.log('🎯 Modo --exact activado: se instalarán versiones exactas sin ^');
  }
  if (onlyTrivy) {
    console.log('🔍 Modo --trivy activado: solo análisis y corrección de CVEs con Trivy');
  }
  if (silent) {
    console.log('🔇 Modo --silent activado: salida de npm suprimida');
  }
  
  try {
    if (onlyTrivy) {
      await runTrivyMode(useExact, deps, devDeps);
    } else {
      const patterns = parsePackagePatterns(filteredArgs);
      const allNames = [...deps, ...devDeps];
      const matched = matchPackages(patterns, allNames);
      
      await runNormalMode(matched, deps, devDeps, useExact, processAll);
    }
    
    console.log('\nListo. Paquetes procesados.');
  } catch (err) {
    die(err.message || String(err));
  }
}

// Run main
main().catch(err => {
  die(err.message || String(err));
});
