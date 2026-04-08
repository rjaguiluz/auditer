#!/usr/bin/env node

// ============================================================================
// AUDITER - NPM Package Auditing and Fixing Tool
// ============================================================================

const { setSilentMode } = require('../lib/state');
const { displayChangeSummary, die } = require('../lib/utils');
const { readPackageJson } = require('../lib/package-manager');
const { parseArguments, parsePackagePatterns, matchPackages } = require('../lib/cli-parser');
const { runTrivyMode, runNormalMode } = require('../lib/modes');
const { replaceWithExactVersions, updateToMinorVersions, updateToMajorVersions } = require('../lib/version-manager');

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { useExact, onlyTrivy, silent, replaceExact, upMinor, upMajor, filteredArgs } = parseArguments();
  
  setSilentMode(silent);
  
  const pkgJson = readPackageJson();
  
  const deps = new Set(Object.keys(pkgJson.dependencies || {}));
  const devDeps = new Set(Object.keys(pkgJson.devDependencies || {}));
  
  const processAll = !filteredArgs.length;
  
  if (silent) {
    console.log('🔇 Modo --silent activado: salida de npm suprimida');
  }
  
  try {
    // Handle version management modes
    if (replaceExact || upMinor || upMajor) {
      const patterns = parsePackagePatterns(filteredArgs);
      const allNames = [...deps, ...devDeps];
      const matched = matchPackages(patterns, allNames);
      
      if (processAll && !replaceExact && !upMinor && !upMajor) {
        console.log('No se especificaron librerías ni modos de actualización.');
        return;
      }
      
      if (replaceExact) {
        console.log('📌 Modo --replace-exact activado');
        if (!processAll) {
          console.log(`   Procesando: ${[...matched].join(', ')}`);
        } else {
          console.log('   Procesando todas las dependencias');
        }
        await replaceWithExactVersions(matched, deps, devDeps);
      } else if (upMinor) {
        console.log('🔼 Modo --up-minor activado: actualizando a últimas versiones minor');
        if (!processAll) {
          console.log(`   Procesando: ${[...matched].join(', ')}`);
        } else {
          console.log('   Procesando todas las dependencias');
        }
        await updateToMinorVersions(matched, deps, devDeps);
      } else if (upMajor) {
        console.log('⚠️  Modo --up-major activado: actualizando a últimas versiones major');
        if (!processAll) {
          console.log(`   Procesando: ${[...matched].join(', ')}`);
        } else {
          console.log('   Procesando todas las dependencias');
        }
        await updateToMajorVersions(matched, deps, devDeps);
      }
    }
    // Handle Trivy mode
    else if (onlyTrivy) {
      if (processAll && !onlyTrivy) {
        console.log('No se especificaron librerías. Procesando todas las dependencias...');
      }
      if (useExact) {
        console.log('🎯 Modo --exact activado: se instalarán versiones exactas sin ^');
      }
      console.log('🔍 Modo --trivy activado: solo análisis y corrección de CVEs con Trivy');
      
      await runTrivyMode(useExact, deps, devDeps);
    }
    // Handle normal mode
    else {
      if (processAll) {
        console.log('No se especificaron librerías. Procesando todas las dependencias...');
      }
      if (useExact) {
        console.log('🎯 Modo --exact activado: se instalarán versiones exactas sin ^');
      }
      
      const patterns = parsePackagePatterns(filteredArgs);
      const allNames = [...deps, ...devDeps];
      const matched = matchPackages(patterns, allNames);
      
      await runNormalMode(matched, deps, devDeps, useExact, processAll);
    }
    
    displayChangeSummary();
    
    console.log('\nListo. Paquetes procesados.');
  } catch (err) {
    die(err.message || String(err));
  }
}

// Run main
main().catch(err => {
  die(err.message || String(err));
});
