#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const readline = require('readline');

function run(cmd) {
  console.log('\n$ ' + cmd);
  execSync(cmd, { stdio: 'inherit' });
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

function checkTrivyInstalled() {
  try {
    execSync('which trivy', { stdio: 'pipe' });
    return true;
  } catch (e) {
    return false;
  }
}

function runTrivyScan() {
  const hastrivy = checkTrivyInstalled();
  if (!hastrivy) {
    console.log('\n💡 Trivy no está instalado. Para análisis adicional de CVEs:');
    console.log('   macOS: brew install trivy');
    console.log('   Linux: apt-get install trivy / yum install trivy');
    return null;
  }

  console.log('\n🔍 Ejecutando análisis de CVEs con Trivy...');
  try {
    // Get JSON output for parsing
    const result = execSync('trivy fs --scanners vuln --severity HIGH,CRITICAL --format json --quiet .', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return JSON.parse(result);
  } catch (e) {
    // Trivy exits with non-zero if vulnerabilities are found
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
  
  const vulnMap = {};
  const vulnOptions = {}; // Track all possible fixes for each package
  
  for (const result of trivyData.Results) {
    if (!result.Vulnerabilities) continue;
    
    for (const vuln of result.Vulnerabilities) {
      const pkgName = vuln.PkgName;
      const fixedVersion = vuln.FixedVersion;
      
      // Only add if there's a fixed version available
      if (fixedVersion && fixedVersion !== '' && fixedVersion !== 'unknown') {
        if (!vulnOptions[pkgName]) {
          vulnOptions[pkgName] = [];
        }
        // Avoid duplicates
        if (!vulnOptions[pkgName].includes(fixedVersion)) {
          vulnOptions[pkgName].push(fixedVersion);
        }
      }
    }
  }
  
  // For each package, choose the closest version to current (prefer minor updates)
  for (const [pkgName, versions] of Object.entries(vulnOptions)) {
    const currentVersion = currentVersions[pkgName];
    
    if (versions.length === 1) {
      vulnMap[pkgName] = versions[0];
    } else {
      // Choose the version that's closest to current (smallest bump)
      vulnMap[pkgName] = chooseClosestVersion(currentVersion, versions);
    }
  }
  
  return vulnMap;
}

function chooseClosestVersion(currentVersion, fixVersions) {
  if (!currentVersion || fixVersions.length === 0) {
    // If no current version, pick the lowest fix version
    return fixVersions.sort(compareVersions)[0];
  }
  
  // Find the smallest version that's >= current and fixes the issue
  // Prefer patch updates, then minor, then major
  const currentParts = parseVersion(currentVersion);
  let bestVersion = fixVersions[0];
  let bestScore = Infinity;
  
  for (const version of fixVersions) {
    const parts = parseVersion(version);
    
    // Calculate "distance" - prefer smaller bumps
    let score = 0;
    if (parts[0] !== currentParts[0]) {
      score += 1000; // Major change
    }
    if (parts[1] !== currentParts[1]) {
      score += 100; // Minor change
    }
    if (parts[2] !== currentParts[2]) {
      score += 1; // Patch change
    }
    
    // Only consider if version is >= current
    if (compareVersions(version, currentVersion) >= 0 && score < bestScore) {
      bestScore = score;
      bestVersion = version;
    }
  }
  
  return bestVersion;
}

function parseVersion(version) {
  return version.replace(/[^0-9.]/g, '').split('.').map(Number);
}

function compareVersions(v1, v2) {
  // Simple semver comparison (good enough for most cases)
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

function getCurrentVersions() {
  try {
    const lockData = fs.readFileSync('package-lock.json', 'utf8');
    const lock = JSON.parse(lockData);
    const versions = {};
    
    // Extract versions from package-lock.json
    if (lock.packages) {
      for (const [path, info] of Object.entries(lock.packages)) {
        if (!path) continue; // Skip root
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
  try {
    // Run npm list to check dependency tree
    const result = execSync(`npm list ${packageName} --depth=0 2>/dev/null`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    // If found at depth 0, it's a direct dependency
    return result.includes(packageName);
  } catch (e) {
    // npm list returns non-zero if package not found at that depth
    // This means it's a transitive dependency
    return false;
  }
}

function hasMultipleVersions(packageName) {
  try {
    // Run npm list without depth limit to see all versions
    const result = execSync(`npm list ${packageName} 2>/dev/null`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    // Count how many times the package name appears (each line = one instance)
    const lines = result.split('\n').filter(line => line.includes(packageName));
    
    // If appears more than once, we have multiple versions or multiple locations
    return lines.length > 1;
  } catch (e) {
    return false;
  }
}

const rawArgs = process.argv.slice(2);
const useExact = rawArgs.includes('--exact');
const onlyTrivy = rawArgs.includes('--trivy');
const filteredArgs = rawArgs.filter(a => a !== '--exact' && a !== '--trivy');

let pkgJson;
try {
  pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
} catch (err) {
  die('No se pudo leer package.json en el directorio actual. Ejecuta el comando desde la raíz del proyecto.');
}

const deps = new Set(Object.keys(pkgJson.dependencies || {}));
const devDeps = new Set(Object.keys(pkgJson.devDependencies || {}));

// If no args, process all libraries
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

// Support mixing explicit package names and regex patterns (e.g. '/^@babel/')
const explicit = [];
const regexes = [];
for (const a of filteredArgs) {
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

// In trivy mode, we'll populate these arrays after scanning
if (!onlyTrivy) {
  for (const p of matched) {
    if (devDeps.has(p)) toUninstallDev.push(p);
    else if (deps.has(p)) toUninstallProd.push(p);
    else toUninstallProd.push(p); // default to prod if not present
  }
}

try {
  const exactFlag = useExact ? ' --save-exact' : '';
  
  // In trivy-only mode, scan first to identify vulnerable packages
  if (onlyTrivy) {
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
      process.exit(0);
    }
    
    // Identify which vulnerable packages are direct dependencies
    console.log('\n📦 Identificando dependencias directas vulnerables...');
    
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
        
        // If multiple versions exist, note it (npm install will resolve after update)
        if (hasMultipleVers) {
          console.log(`    ℹ️  Múltiples versiones - npm install las resolverá`);
        }
      }
    }
    
    if (toUninstallProd.length === 0 && toUninstallDev.length === 0) {
      console.log('  → Todas las vulnerabilidades son en subdependencias (se usarán overrides)');
    }
  }
  
  // Run uninstall/reinstall for identified packages
  if (toUninstallProd.length || toUninstallDev.length) {
    // Remove overrides for packages we're about to uninstall to avoid conflicts
    const packagesToUninstall = [...toUninstallProd, ...toUninstallDev];
    if (packagesToUninstall.length > 0) {
      const currentPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      if (currentPkg.overrides) {
        let overridesRemoved = false;
        for (const pkg of packagesToUninstall) {
          if (currentPkg.overrides[pkg]) {
            console.log(`🗑️  Removiendo override existente para ${pkg} (será reinstalado)`);
            delete currentPkg.overrides[pkg];
            overridesRemoved = true;
          }
        }
        if (overridesRemoved) {
          fs.writeFileSync('package.json', JSON.stringify(currentPkg, null, 2) + '\n');
        }
      }
    }
    
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

    // Reinstall with fixed versions from Trivy (if in trivy mode) or latest (if normal mode)
    if (onlyTrivy) {
      // In trivy mode, reinstall with specific versions from scan
      const currentVersions = getCurrentVersions();
      const trivyDataForReinstall = runTrivyScan();
      const vulnerablePackages = extractTrivyVulnerabilities(trivyDataForReinstall, currentVersions);
      
      const prodWithVersions = toUninstallProd.map(p => 
        vulnerablePackages[p] ? `${p}@${vulnerablePackages[p]}` : p
      );
      const devWithVersions = toUninstallDev.map(p => 
        vulnerablePackages[p] ? `${p}@${vulnerablePackages[p]}` : p
      );
      
      if (prodWithVersions.length) {
        console.log('\n📥 Reinstalando con versiones parcheadas:');
        prodWithVersions.forEach(p => console.log(`  - ${p}`));
        run(`npm install${exactFlag} ${prodWithVersions.join(' ')}`);
      }
      if (devWithVersions.length) {
        console.log('\n📥 Reinstalando dependencias de desarrollo:');
        devWithVersions.forEach(p => console.log(`  - ${p}`));
        run(`npm install --save-dev${exactFlag} ${devWithVersions.join(' ')}`);
      }
    } else {
      // Normal mode: reinstall to latest
      if (toUninstallProd.length) {
        run(`npm install${exactFlag} ${toUninstallProd.join(' ')}`);
      }
      if (toUninstallDev.length) {
        run(`npm install --save-dev${exactFlag} ${toUninstallDev.join(' ')}`);
      }
    }
  } else if (onlyTrivy) {
    // In trivy mode but no direct dependencies to reinstall
    console.log('\nRunning npm audit fix...');
    try {
      run('npm audit fix');
    } catch (e) {
      console.warn('`npm audit fix` falló o no encontró cambios (continuando)...');
    }
  }

  (async () => {

  // Run Trivy scan and use it to determine overrides and updates
  const trivyData = runTrivyScan();
  
  if (trivyData) {
    const currentVersions = getCurrentVersions();
    const vulnerablePackages = extractTrivyVulnerabilities(trivyData, currentVersions);
    
    if (Object.keys(vulnerablePackages).length > 0) {
      console.log('\n📋 Vulnerabilidades encontradas por Trivy:');
      
      const currentPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const overridesToAdd = {};
      const directUpdates = { prod: [], dev: [] };
      
      console.log('\n🔍 Verificando árbol de dependencias con npm list...');
      
      for (const [pkgName, fixedVersion] of Object.entries(vulnerablePackages)) {
        const currentVer = currentVersions[pkgName] || 'desconocida';
        
        // Use npm list to determine if it's a direct dependency
        const isDirect = isDirectDependency(pkgName);
        const hasMultipleVers = hasMultipleVersions(pkgName);
        
        if (isDirect) {
          // It's a direct dependency, check if prod or dev
          if (deps.has(pkgName)) {
            directUpdates.prod.push(`${pkgName}@${fixedVersion}`);
            console.log(`  - ${pkgName}: ${currentVer} → ${fixedVersion} [directo - producción]`);
          } else if (devDeps.has(pkgName)) {
            directUpdates.dev.push(`${pkgName}@${fixedVersion}`);
            console.log(`  - ${pkgName}: ${currentVer} → ${fixedVersion} [directo - desarrollo]`);
          }
          
          // If there are multiple versions, note it but don't add override yet
          // (npm install should resolve subdependencies after updating the direct one)
          if (hasMultipleVers) {
            console.log(`    ℹ️  Múltiples versiones detectadas - npm install resolverá subdependencias`);
          }
        } else {
          // It's a transitive dependency, use override
          overridesToAdd[pkgName] = fixedVersion;
          console.log(`  - ${pkgName}: ${currentVer} → ${fixedVersion} [transitivo - override]`);
        }
      }
      
      // Update direct dependencies first
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
      
      // Add overrides for transitive dependencies
      if (Object.keys(overridesToAdd).length > 0) {
        console.log('\n📝 Overrides propuestos para dependencias transitivas:');
        
        if (!currentPkg.overrides) {
          currentPkg.overrides = {};
        } else {
          // Check for existing overrides
          for (const pkg of Object.keys(overridesToAdd)) {
            if (currentPkg.overrides[pkg]) {
              console.log(`  ⚠️  Sobrescribiendo: ${pkg}@${currentPkg.overrides[pkg]} → ${overridesToAdd[pkg]}`);
            }
          }
        }
        
        Object.keys(overridesToAdd).forEach(pkg => {
          const current = currentVersions[pkg] || '?';
          console.log(`  - ${pkg}: ${current} → ${overridesToAdd[pkg]}`);
        });
        
        console.log('\n⚠️  ADVERTENCIA: Los overrides pueden causar incompatibilidades.');
        console.log('   Esto solucionará las vulnerabilidades pero puede romper tu aplicación.');
        
        const answer = await askUser('\n¿Deseas aplicar estos overrides? (Y/n): ');
        
        if (answer === 'y' || answer === 'yes' || answer === '') {
          Object.assign(currentPkg.overrides, overridesToAdd);
          
          // Also update direct dependencies to match override versions (without ^)
          let directDepsUpdated = false;
          for (const [pkg, version] of Object.entries(overridesToAdd)) {
            if (currentPkg.dependencies && currentPkg.dependencies[pkg]) {
              console.log(`  🔄 Actualizando dependencies[${pkg}]: ${currentPkg.dependencies[pkg]} → ${version}`);
              currentPkg.dependencies[pkg] = version;
              directDepsUpdated = true;
            }
            if (currentPkg.devDependencies && currentPkg.devDependencies[pkg]) {
              console.log(`  🔄 Actualizando devDependencies[${pkg}]: ${currentPkg.devDependencies[pkg]} → ${version}`);
              currentPkg.devDependencies[pkg] = version;
              directDepsUpdated = true;
            }
          }
          
          fs.writeFileSync('package.json', JSON.stringify(currentPkg, null, 2) + '\n');
          console.log('\n✅ Overrides añadidos.');
          if (directDepsUpdated) {
            console.log('✅ Dependencias directas actualizadas a versiones exactas.');
          }
          console.log('Ejecutando npm install...');
          run('npm install');
          
          // Final verification
          console.log('\n🔍 Verificación final con Trivy...');
          try {
            execSync('trivy fs --scanners vuln --severity HIGH,CRITICAL .', { stdio: 'inherit' });
          } catch (e) {
            console.log('\n⚠️  Aún quedan algunas vulnerabilidades HIGH/CRITICAL.');
          }
        } else {
          console.log('\n❌ Overrides cancelados por el usuario.');
          console.log('   Puedes aplicarlos manualmente en package.json cuando estés listo.');
        }
      } else if (directUpdates.prod.length === 0 && directUpdates.dev.length === 0) {
        console.log('\nNo se requieren overrides ni actualizaciones.');
      }
    } else {
      console.log('\n✅ No se encontraron vulnerabilidades HIGH/CRITICAL.');
    }
  } else {
    console.log('\n⚠️  No se pudo ejecutar Trivy. Saltando análisis de CVEs.');
  }

  console.log('\nListo. Paquetes procesados.');
  })().catch(err => {
    die(err.message || String(err));
  });
} catch (err) {
  die(err.message || String(err));
}
