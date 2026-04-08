const { run, askUser, parsePackageVersion, die } = require('./utils');
const { removeOverridesForPackages } = require('./package-manager');
const { getCurrentVersions, isDirectDependency, hasMultipleVersions, findRelatedScopedPackages } = require('./dependency-analyzer');
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
  
  // Track scoped packages for family detection
  const scopedDirectPackages = new Map(); // scope -> { prod: [], dev: [], vulnerable: [] }
  
  for (const pkgName of Object.keys(vulnerablePackages)) {
    const isDirect = isDirectDependency(pkgName);
    const hasMultipleVers = hasMultipleVersions(pkgName);
    
    if (isDirect) {
      // Track scoped packages
      if (pkgName.startsWith('@')) {
        const scope = pkgName.split('/')[0];
        if (!scopedDirectPackages.has(scope)) {
          scopedDirectPackages.set(scope, { prod: [], dev: [], vulnerable: [] });
        }
        scopedDirectPackages.get(scope).vulnerable.push(pkgName);
      }
      
      if (deps.has(pkgName)) {
        toUninstallProd.push(pkgName);
        console.log(`  - ${pkgName} (producción)`);
        
        // Track for scope family
        if (pkgName.startsWith('@')) {
          const scope = pkgName.split('/')[0];
          scopedDirectPackages.get(scope).prod.push(pkgName);
        }
      } else if (devDeps.has(pkgName)) {
        toUninstallDev.push(pkgName);
        console.log(`  - ${pkgName} (desarrollo)`);
        
        // Track for scope family
        if (pkgName.startsWith('@')) {
          const scope = pkgName.split('/')[0];
          scopedDirectPackages.get(scope).dev.push(pkgName);
        }
      } else {
        // Direct dependency detected but not in package.json (orphan)
        console.log(`  ⚠️  ${pkgName} detectado como directo pero no está en package.json (será tratado como transitivo)`);
      }
      
      if (hasMultipleVers) {
        console.log(`    ℹ️  Múltiples versiones - npm install las resolverá`);
      }
    }
  }
  
  // Check for scoped package families that should be updated together
  const scopeFamiliesToUpdate = new Map();
  for (const [scope, data] of scopedDirectPackages) {
    if (data.vulnerable.length > 0) {
      const allScopedDeps = [...deps, ...devDeps].filter(p => p.startsWith(scope + '/'));
      if (allScopedDeps.length > data.vulnerable.length) {
        // There are more packages in this scope that should be updated together
        scopeFamiliesToUpdate.set(scope, { 
          vulnerable: data.vulnerable, 
          all: allScopedDeps,
          prodPackages: allScopedDeps.filter(p => deps.has(p)),
          devPackages: allScopedDeps.filter(p => devDeps.has(p))
        });
      }
    }
  }
  
  // If we detected scope families, suggest updating them together
  if (scopeFamiliesToUpdate.size > 0) {
    console.log('\n⚠️  IMPORTANTE: Se detectaron paquetes vulnerables que pertenecen a familias:');
    for (const [scope, data] of scopeFamiliesToUpdate) {
      console.log(`\n   ${scope}/* (${data.all.length} paquetes en package.json)`);
      console.log(`   Vulnerable(s): ${data.vulnerable.join(', ')}`);
      console.log(`   Todos los paquetes: ${data.all.slice(0, 5).join(', ')}${data.all.length > 5 ? '...' : ''}`);
    }
    
    const answer = await askUser('\n¿Actualizar TODAS las familias juntas para evitar conflictos de peer dependencies? (Y/n): ');
    
    if (answer === 'y' || answer === 'yes' || answer === '') {
      console.log('\n🔄 Actualizando familias completas...');
      
      // Update all families together
      for (const [scope, data] of scopeFamiliesToUpdate) {
        console.log(`\n📦 Actualizando ${scope}/* (${data.all.length} paquetes)...`);
        
        // STEP 1: Uninstall all packages in the family first to avoid peer dependency conflicts
        console.log(`   Desinstalando ${data.all.length} paquetes para evitar conflictos...`);
        run(`npm uninstall ${data.all.join(' ')}`);
        
        // STEP 2: Build package list with versions
        // For vulnerable packages, use the fixed version from Trivy
        // For related packages, use @latest to ensure compatible versions
        const prodPackagesWithVersions = data.prodPackages.map(pkg => {
          if (data.vulnerable.includes(pkg)) {
            // Use the fixed version from vulnerablePackages
            const fixedVersion = vulnerablePackages[pkg];
            return `${pkg}@${fixedVersion}`;
          } else {
            // Use @latest for related packages to get compatible version
            return `${pkg}@latest`;
          }
        });
        
        const devPackagesWithVersions = data.devPackages.map(pkg => {
          if (data.vulnerable.includes(pkg)) {
            const fixedVersion = vulnerablePackages[pkg];
            return `${pkg}@${fixedVersion}`;
          } else {
            return `${pkg}@latest`;
          }
        });
        
        // STEP 3: Reinstall with correct versions
        if (prodPackagesWithVersions.length > 0) {
          console.log(`   Reinstalando producción: ${prodPackagesWithVersions.join(', ')}`);
          run(`npm install${useExact ? ' --save-exact' : ''} ${prodPackagesWithVersions.join(' ')}`);
          
          // Track changes
          for (const pkg of data.prodPackages) {
            const fixedVersion = data.vulnerable.includes(pkg) 
              ? vulnerablePackages[pkg] 
              : 'latest';
            const currentVer = currentVersions[pkg] || 'desconocida';
            CHANGES_TRACKER.directUpdates.push({
              name: pkg,
              from: currentVer,
              to: fixedVersion,
              type: 'prod'
            });
          }
        }
        if (devPackagesWithVersions.length > 0) {
          console.log(`   Reinstalando desarrollo: ${devPackagesWithVersions.join(', ')}`);
          run(`npm install --save-dev${useExact ? ' --save-exact' : ''} ${devPackagesWithVersions.join(' ')}`);
          
          // Track changes
          for (const pkg of data.devPackages) {
            const fixedVersion = data.vulnerable.includes(pkg) 
              ? vulnerablePackages[pkg] 
              : 'latest';
            const currentVer = currentVersions[pkg] || 'desconocida';
            CHANGES_TRACKER.directUpdates.push({
              name: pkg,
              from: currentVer,
              to: fixedVersion,
              type: 'dev'
            });
          }
        }
        
        // Remove from toUninstall lists since we already updated them
        for (const pkg of data.vulnerable) {
          const prodIndex = toUninstallProd.indexOf(pkg);
          if (prodIndex > -1) toUninstallProd.splice(prodIndex, 1);
          
          const devIndex = toUninstallDev.indexOf(pkg);
          if (devIndex > -1) toUninstallDev.splice(devIndex, 1);
        }
      }
      
      console.log('\n✅ Familias actualizadas. Continuando con paquetes restantes...');
    } else {
      console.log('\n⚠️  Continuando con actualización individual (pueden ocurrir conflictos de peer dependencies)...');
    }
  }
  
  if (toUninstallProd.length === 0 && toUninstallDev.length === 0) {
    console.log('  → Todas las vulnerabilidades son en subdependencias (se usarán overrides)');
    
    // Detect scoped packages and suggest alternative approach
    const scopedPackages = Object.keys(vulnerablePackages).filter(pkg => pkg.startsWith('@'));
    const scopeSuggestions = new Map();
    
    for (const pkg of scopedPackages) {
      const allPackages = [...deps, ...devDeps];
      const relatedPackages = findRelatedScopedPackages(pkg, allPackages);
      
      if (relatedPackages.length > 0) {
        const scope = pkg.split('/')[0];
        if (!scopeSuggestions.has(scope)) {
          scopeSuggestions.set(scope, { packages: [], related: [] });
        }
        scopeSuggestions.get(scope).packages.push(pkg);
        scopeSuggestions.get(scope).related = relatedPackages;
      }
    }
    
    if (scopeSuggestions.size > 0) {
      console.log('\n💡 Nota: Algunos paquetes vulnerables pertenecen a familias más grandes:');
      for (const [scope, data] of scopeSuggestions) {
        const allScopedDeps = [...deps, ...devDeps].filter(p => p.startsWith(scope + '/'));
        console.log(`   ${scope}/* (${allScopedDeps.length} paquetes en package.json)`);
        console.log(`   Vulnerable(s): ${data.packages.join(', ')}`);
        console.log(`   Relacionados: ${data.related.slice(0, 3).join(', ')}${data.related.length > 3 ? '...' : ''}`);
      }
      console.log('   → Se te preguntará si quieres actualizarlos antes de los overrides.');
    }
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

// ============================================================================
// CLEAN MODE - Find and remove unused dependencies
// ============================================================================

async function runCleanMode(pkgJson, includeDev = false) {
  const { scanUsedDependencies, findUnusedDependencies, uninstallUnusedPackages } = require('./dependency-scanner');
  const { askUser } = require('./utils');
  
  console.log('\n🧹 Modo --clean: Detectando dependencias no utilizadas');
  
  if (includeDev) {
    console.log('⚠️  Modo --include-dev activado: se incluirán devDependencies');
    console.log('   (Puede generar falsos positivos con herramientas CLI y plugins)\n');
  } else {
    console.log('ℹ️  Solo se analizarán dependencies de producción');
    console.log('   (Las devDependencies están excluidas - usa --include-dev para incluirlas)\n');
  }
  
  // Scan all source files
  const usedPackages = scanUsedDependencies();
  
  // Find unused dependencies
  const unused = findUnusedDependencies(pkgJson, usedPackages, includeDev);
  
  const totalUnused = unused.dependencies.length + unused.devDependencies.length;
  
  if (totalUnused === 0) {
    console.log('\n✅ ¡Excelente! No se encontraron dependencias no utilizadas.');
    return;
  }
  
  console.log(`\n📋 Se encontraron ${totalUnused} dependencias no utilizadas:\n`);
  
  if (unused.dependencies.length > 0) {
    console.log('  📦 Dependencias de producción:');
    unused.dependencies.forEach(dep => console.log(`     - ${dep}`));
    console.log('');
  }
  
  if (unused.devDependencies.length > 0) {
    console.log('  🔧 Dependencias de desarrollo:');
    unused.devDependencies.forEach(dep => console.log(`     - ${dep}`));
    console.log('');
  }
  
  console.log('ℹ️  Nota: Los paquetes @types/* están excluidos del análisis\n');
  
  const answer = await askUser('¿Deseas eliminar estas dependencias? (Y/n): ');
  
  if (answer === 'y' || answer === 'yes' || answer === '') {
    const removed = uninstallUnusedPackages(unused.dependencies, unused.devDependencies);
    console.log(`\n✅ Se eliminaron ${removed} dependencias no utilizadas`);
  } else {
    console.log('\n❌ Operación cancelada. No se eliminó ninguna dependencia.');
  }
}

// ============================================================================
// AUDIT MODE - List vulnerabilities without fixing
// ============================================================================

async function runAuditMode() {
  const { safeExecSync } = require('./utils');
  
  console.log('\n🔍 Modo --audit: Análisis de vulnerabilidades (solo lectura)\n');
  console.log('📊 Escaneando con Trivy...\n');
  
  const trivyData = runTrivyScan();
  
  if (!trivyData) {
    console.log('⚠️  No se pudo ejecutar Trivy. Asegúrate de que esté instalado.');
    return;
  }
  
  const currentVersions = getCurrentVersions();
  const { all: vulnerablePackages, bySeverity } = extractTrivyVulnerabilities(trivyData, currentVersions);
  
  if (Object.keys(vulnerablePackages).length === 0) {
    console.log('✅ No se encontraron vulnerabilidades.\n');
    return;
  }
  
  // Group packages by severity
  const packagesBySeverity = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: []
  };
  
  // Analyze each vulnerable package
  console.log('📋 VULNERABILIDADES DETECTADAS\n');
  console.log('='.repeat(70));
  
  for (const [pkgName, fixedVersion] of Object.entries(vulnerablePackages)) {
    const currentVer = currentVersions[pkgName] || 'desconocida';
    const isDirect = isDirectDependency(pkgName);
    
    // Determine severity for this package
    let severity = 'LOW';
    for (const [sev, packages] of Object.entries(bySeverity)) {
      if (packages[pkgName]) {
        severity = sev;
        break;
      }
    }
    
    packagesBySeverity[severity].push({
      name: pkgName,
      current: currentVer,
      fixed: fixedVersion,
      isDirect
    });
    
    // Display package info
    const severityIcon = {
      CRITICAL: '🔴',
      HIGH: '🟠',
      MEDIUM: '🟡',
      LOW: '🟢'
    }[severity];
    
    console.log(`\n${severityIcon} [${severity}] ${pkgName}`);
    console.log(`   Versión actual: ${currentVer}`);
    console.log(`   Versión corregida: ${fixedVersion}`);
    console.log(`   Tipo: ${isDirect ? 'Dependencia directa' : 'Dependencia transitiva'}`);
    
    // Show dependency tree
    const tree = safeExecSync(`npm list ${pkgName} 2>/dev/null`);
    if (tree) {
      console.log(`   Árbol de dependencias:`);
      const lines = tree.split('\n').slice(0, 10); // Limit to 10 lines
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`   ${line}`);
        }
      });
      if (tree.split('\n').length > 10) {
        console.log(`   ... (${tree.split('\n').length - 10} líneas más)`);
      }
    }
  }
  
  // Summary by severity
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 RESUMEN POR SEVERIDAD\n');
  
  const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  let totalVulns = 0;
  
  for (const severity of severities) {
    const count = packagesBySeverity[severity].length;
    if (count > 0) {
      totalVulns += count;
      const icon = {
        CRITICAL: '🔴',
        HIGH: '🟠',
        MEDIUM: '🟡',
        LOW: '🟢'
      }[severity];
      
      console.log(`${icon} ${severity.padEnd(10)} : ${count} ${count === 1 ? 'paquete' : 'paquetes'}`);
      
      // List package names
      packagesBySeverity[severity].forEach(pkg => {
        const type = pkg.isDirect ? '📦' : '📂';
        console.log(`     ${type} ${pkg.name} (${pkg.current} → ${pkg.fixed})`);
      });
      console.log('');
    }
  }
  
  console.log('─'.repeat(70));
  console.log(`Total: ${totalVulns} ${totalVulns === 1 ? 'vulnerabilidad' : 'vulnerabilidades'} encontradas`);
  console.log('');
  console.log('💡 Para corregir estas vulnerabilidades, ejecuta:');
  console.log('   auditer --trivy');
  console.log('');
}

module.exports = {
  runTrivyMode,
  processSecondTrivyScan,
  runNormalMode,
  runCleanMode,
  runAuditMode
};
