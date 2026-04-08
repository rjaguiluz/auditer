const fs = require('fs');
const { safeExecSync } = require('./utils');

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

module.exports = {
  getCurrentVersions,
  isDirectDependency,
  hasMultipleVersions
};
