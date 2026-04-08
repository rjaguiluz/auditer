const { run, askUser, parsePackageVersion, die } = require('./utils');
const { removeOverridesForPackages } = require('./package-manager');
const { getCurrentVersions, isDirectDependency, hasMultipleVersions } = require('./dependency-analyzer');
const { runTrivyScan, extractTrivyVulnerabilities } = require('./trivy');
const { uninstallPackages, runAuditFix, installPackages } = require('./package-processor');
const { processVulnerabilities } = require('./vulnerability-fixer');
const { getChangesTracker } = require('./state');

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
  const { all: vulnerablePackages, bySeverity } = extractTrivyVulnerabilities(trivyData, currentVersions);
  
  if (Object.keys(vulnerablePackages).length === 0) {
    console.log('\n✅ No se encontraron vulnerabilidades.');
    console.log('\nListo. No hay paquetes que procesar.');
    return;
  }
  
  const highCriticalCount = Object.keys(bySeverity.CRITICAL).length + Object.keys(bySeverity.HIGH).length;
  const mediumLowCount = Object.keys(bySeverity.MEDIUM).length + Object.keys(bySeverity.LOW).length;
  
  if (highCriticalCount === 0 && mediumLowCount > 0) {
    console.log(`\n⚠️  Se encontraron ${mediumLowCount} vulnerabilidades MEDIUM/LOW.`);
    console.log('\nVulnerabilidades encontradas:');
    
    for (const [severity, packages] of Object.entries(bySeverity)) {
      if (Object.keys(packages).length > 0) {
        console.log(`\n  [${severity}]:`);
        for (const [pkgName, version] of Object.entries(packages)) {
          const current = currentVersions[pkgName] || 'desconocida';
          console.log(`    - ${pkgName}: ${current} → ${version}`);
        }
      }
    }
    
    const answer = await askUser('\n¿Deseas proceder con la corrección de estas vulnerabilidades? (Y/n): ');
    if (answer !== 'y' && answer !== 'yes' && answer !== '') {
      console.log('\n❌ Corrección cancelada por el usuario.');
      return;
    }
  } else if (mediumLowCount > 0) {
    console.log(`\n📊 Vulnerabilidades: ${highCriticalCount} HIGH/CRITICAL, ${mediumLowCount} MEDIUM/LOW`);
  }
  
  console.log('\n📦 Identificando dependencias directas vulnerables...');
  const toUninstallProd = [];
  const toUninstallDev = [];
  const CHANGES_TRACKER = getChangesTracker();
  
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
  
  if (toUninstallProd.length || toUninstallDev.length) {
    removeOverridesForPackages([...toUninstallProd, ...toUninstallDev]);
    uninstallPackages(toUninstallProd, toUninstallDev);
    runAuditFix();
    
    const prodWithVersions = toUninstallProd.map(p => 
      vulnerablePackages[p] ? `${p}@${vulnerablePackages[p]}` : p
    );
    const devWithVersions = toUninstallDev.map(p => 
      vulnerablePackages[p] ? `${p}@${vulnerablePackages[p]}` : p
    );
    
    if (prodWithVersions.length) {
      console.log('\n📥 Reinstalando con versiones parcheadas:');
      prodWithVersions.forEach(p => {
        console.log(`  - ${p}`);
        const parsed = parsePackageVersion(p);
        if (parsed.version) {
          CHANGES_TRACKER.directUpdates.push({
            name: parsed.name,
            from: currentVersions[parsed.name] || 'desconocida',
            to: parsed.version,
            type: 'prod'
          });
        }
      });
      run(`npm install${useExact ? ' --save-exact' : ''} ${prodWithVersions.join(' ')}`);
    }
    if (devWithVersions.length) {
      console.log('\n📥 Reinstalando dependencias de desarrollo:');
      devWithVersions.forEach(p => {
        console.log(`  - ${p}`);
        const parsed = parsePackageVersion(p);
        if (parsed.version) {
          CHANGES_TRACKER.directUpdates.push({
            name: parsed.name,
            from: currentVersions[parsed.name] || 'desconocida',
            to: parsed.version,
            type: 'dev'
          });
        }
      });
      run(`npm install --save-dev${useExact ? ' --save-exact' : ''} ${devWithVersions.join(' ')}`);
    }
  } else {
    runAuditFix();
  }
  
  await processSecondTrivyScan(useExact, deps, devDeps);
}

async function processSecondTrivyScan(useExact, deps, devDeps) {
  const trivyData = runTrivyScan();
  
  if (trivyData) {
    const currentVersions = getCurrentVersions();
    const { all: vulnerablePackages, bySeverity } = extractTrivyVulnerabilities(trivyData, currentVersions);
    
    if (Object.keys(vulnerablePackages).length > 0) {
      const highCriticalCount = Object.keys(bySeverity.CRITICAL).length + Object.keys(bySeverity.HIGH).length;
      const mediumLowCount = Object.keys(bySeverity.MEDIUM).length + Object.keys(bySeverity.LOW).length;
      
      if (highCriticalCount === 0 && mediumLowCount > 0) {
        console.log(`\n⚠️  Se encontraron ${mediumLowCount} vulnerabilidades MEDIUM/LOW adicionales.`);
        console.log('\nVulnerabilidades encontradas:');
        
        for (const [severity, packages] of Object.entries(bySeverity)) {
          if (Object.keys(packages).length > 0) {
            console.log(`\n  [${severity}]:`);
            for (const [pkgName, version] of Object.entries(packages)) {
              const current = currentVersions[pkgName] || 'desconocida';
              console.log(`    - ${pkgName}: ${current} → ${version}`);
            }
          }
        }
        
        const answer = await askUser('\n¿Deseas proceder con la corrección de estas vulnerabilidades? (Y/n): ');
        if (answer !== 'y' && answer !== 'yes' && answer !== '') {
          console.log('\n❌ Corrección cancelada por el usuario.');
          return;
        }
      } else if (mediumLowCount > 0) {
        console.log(`\n📊 Vulnerabilidades restantes: ${highCriticalCount} HIGH/CRITICAL, ${mediumLowCount} MEDIUM/LOW`);
      }
      
      await processVulnerabilities(vulnerablePackages, currentVersions, deps, devDeps, useExact);
    } else {
      console.log('\n✅ No se encontraron vulnerabilidades.');
    }
  } else {
    console.log('\n⚠️  No se pudo ejecutar Trivy. Saltando análisis de CVEs.');
  }
}

// ============================================================================
// NORMAL MODE
// ============================================================================

async function runNormalMode(matched, deps, devDeps, useExact, processAll) {
  if (processAll) {
    const allNames = [...deps, ...devDeps];
    allNames.forEach(name => matched.add(name));
  }
  
  // Validate that matched packages exist
  if (matched.size === 0) {
    console.log('\n⚠️  No se encontraron paquetes para procesar.');
    return;
  }
  
  const toUninstallProd = [];
  const toUninstallDev = [];
  
  for (const pkg of matched) {
    if (devDeps.has(pkg)) {
      toUninstallDev.push(pkg);
    } else if (deps.has(pkg)) {
      toUninstallProd.push(pkg);
    } else {
      // Warn about packages not found in package.json
      console.log(`⚠️  Paquete "${pkg}" no encontrado en package.json (será ignorado)`);
    }
  }
  
  // If no valid packages, exit early
  if (toUninstallProd.length === 0 && toUninstallDev.length === 0) {
    console.log('\n⚠️  No hay paquetes válidos para procesar.');
    return;
  }
  
  const exactFlag = useExact ? ' --save-exact' : '';
  
  removeOverridesForPackages([...toUninstallProd, ...toUninstallDev]);
  
  uninstallPackages(toUninstallProd, toUninstallDev);
  runAuditFix();
  installPackages(toUninstallProd, toUninstallDev, exactFlag);
  
  await processSecondTrivyScan(useExact, deps, devDeps);
}

module.exports = {
  runTrivyMode,
  processSecondTrivyScan,
  runNormalMode
};
