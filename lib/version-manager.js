const { run, askUser } = require('./utils');
const { readPackageJson, writePackageJson } = require('./package-manager');
const { stripVersionPrefix, findLatestMinorVersion, getLatestVersionFromNpm } = require('./version-utils');
const { getChangesTracker, getDryRun } = require('./state');

// ============================================================================
// VERSION MANAGEMENT MODES
// ============================================================================

async function replaceWithExactVersions(matched, deps, devDeps) {
  console.log('\n📌 Reemplazando versiones con formato exacto (sin ^/~)...\n');
  
  const pkg = readPackageJson();
  const CHANGES_TRACKER = getChangesTracker();
  let hasChanges = false;
  
  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      if (matched.size === 0 || matched.has(name)) {
        const cleanVersion = stripVersionPrefix(version);
        if (cleanVersion !== version) {
          console.log(`  ${name}: ${version} → ${cleanVersion} [prod]`);
          pkg.dependencies[name] = cleanVersion;
          CHANGES_TRACKER.versionChanges.push({
            name,
            from: version,
            to: cleanVersion,
            type: 'prod'
          });
          hasChanges = true;
        }
      }
    }
  }
  
  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      if (matched.size === 0 || matched.has(name)) {
        const cleanVersion = stripVersionPrefix(version);
        if (cleanVersion !== version) {
          console.log(`  ${name}: ${version} → ${cleanVersion} [dev]`);
          pkg.devDependencies[name] = cleanVersion;
          CHANGES_TRACKER.versionChanges.push({
            name,
            from: version,
            to: cleanVersion,
            type: 'dev'
          });
          hasChanges = true;
        }
      }
    }
  }
  
  if (hasChanges) {
    if (!getDryRun()) {
      writePackageJson(pkg);
    }
    console.log('\n✅ package.json actualizado. Ejecutando npm install...');
    run('npm install');
  } else {
    console.log('\n✅ No se encontraron versiones con prefijos ^/~');
  }
}

async function updateToMinorVersions(matched, deps, devDeps) {
  console.log('\n🔼 Actualizando a las últimas versiones minor compatibles...\n');
  
  const pkg = readPackageJson();
  const CHANGES_TRACKER = getChangesTracker();
  let hasChanges = false;
  const packagesToUpdate = [];
  
  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      if (matched.size === 0 || matched.has(name)) {
        packagesToUpdate.push({ name, version, type: 'prod' });
      }
    }
  }
  
  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      if (matched.size === 0 || matched.has(name)) {
        packagesToUpdate.push({ name, version, type: 'dev' });
      }
    }
  }
  
  console.log(`Consultando npm para ${packagesToUpdate.length} paquetes...`);
  
  for (const { name, version, type } of packagesToUpdate) {
    const cleanVersion = stripVersionPrefix(version);
    const latestMinor = findLatestMinorVersion(name, cleanVersion);
    
    if (latestMinor && latestMinor !== cleanVersion) {
      console.log(`  ${name}: ${version} → ${latestMinor} [${type}]`);
      
      if (type === 'prod') {
        pkg.dependencies[name] = latestMinor;
      } else {
        pkg.devDependencies[name] = latestMinor;
      }
      
      CHANGES_TRACKER.versionChanges.push({
        name,
        from: version,
        to: latestMinor,
        type
      });
      hasChanges = true;
    } else if (latestMinor === cleanVersion) {
      console.log(`  ${name}: ya está en la última versión minor (${cleanVersion})`);
    }
  }
  
  if (hasChanges) {
    if (!getDryRun()) {
      writePackageJson(pkg);
    }
    console.log('\n✅ package.json actualizado. Ejecutando npm install...');
    run('npm install');
  } else {
    console.log('\n✅ Todas las dependencias están en su última versión minor');
  }
}

async function updateToMajorVersions(matched, deps, devDeps) {
  console.log('\n⚠️  ACTUALIZACIÓN DE VERSIONES MAJOR');
  console.log('    Esto puede introducir cambios incompatibles (breaking changes).\n');
  
  const answer = await askUser('¿Deseas continuar con la actualización major? (Y/n): ');
  if (answer !== 'y' && answer !== 'yes' && answer !== '') {
    console.log('\n❌ Actualización cancelada por el usuario.');
    return;
  }
  
  console.log('\n🔼 Actualizando a las últimas versiones major...\n');
  
  const pkg = readPackageJson();
  const CHANGES_TRACKER = getChangesTracker();
  let hasChanges = false;
  const packagesToUpdate = [];
  
  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      if (matched.size === 0 || matched.has(name)) {
        packagesToUpdate.push({ name, version, type: 'prod' });
      }
    }
  }
  
  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      if (matched.size === 0 || matched.has(name)) {
        packagesToUpdate.push({ name, version, type: 'dev' });
      }
    }
  }
  
  console.log(`Consultando npm para ${packagesToUpdate.length} paquetes...`);
  
  for (const { name, version, type } of packagesToUpdate) {
    const cleanVersion = stripVersionPrefix(version);
    const latestVersion = getLatestVersionFromNpm(name, 'latest');
    
    if (latestVersion && latestVersion !== cleanVersion) {
      console.log(`  ${name}: ${version} → ${latestVersion} [${type}]`);
      
      if (type === 'prod') {
        pkg.dependencies[name] = latestVersion;
      } else {
        pkg.devDependencies[name] = latestVersion;
      }
      
      CHANGES_TRACKER.versionChanges.push({
        name,
        from: version,
        to: latestVersion,
        type
      });
      hasChanges = true;
    } else if (latestVersion === cleanVersion) {
      console.log(`  ${name}: ya está en la última versión (${cleanVersion})`);
    }
  }
  
  if (hasChanges) {
    if (!getDryRun()) {
      writePackageJson(pkg);
    }
    console.log('\n✅ package.json actualizado. Ejecutando npm install...');
    run('npm install');
    if (!getDryRun()) {
      console.log('\n⚠️  IMPORTANTE: Verifica que tu aplicación funcione correctamente.');
      console.log('   Ejecuta tus tests y revisa los CHANGELOG de los paquetes actualizados.');
    }
  } else {
    console.log('\n✅ Todas las dependencias están en su última versión');
  }
}

module.exports = {
  replaceWithExactVersions,
  updateToMinorVersions,
  updateToMajorVersions
};
