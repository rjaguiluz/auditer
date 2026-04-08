const { VERSION_SCORE_WEIGHTS } = require('./constants');
const { safeExecSync } = require('./utils');

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

function stripVersionPrefix(version) {
  return version.replace(/^[\^~>=<]+/, '');
}

function getLatestVersionFromNpm(packageName, versionType = 'latest') {
  try {
    const result = safeExecSync(`npm view ${packageName} version`);
    if (!result) return null;
    
    const latestVersion = result.trim();
    
    if (versionType === 'latest') {
      return latestVersion;
    }
    
    const allVersionsResult = safeExecSync(`npm view ${packageName} versions --json`);
    if (!allVersionsResult) return latestVersion;
    
    const allVersions = JSON.parse(allVersionsResult);
    if (!Array.isArray(allVersions) || allVersions.length === 0) {
      return latestVersion;
    }
    
    return latestVersion;
  } catch (e) {
    return null;
  }
}

function findLatestMinorVersion(packageName, currentVersion) {
  try {
    const cleanCurrent = stripVersionPrefix(currentVersion);
    const currentParts = parseVersion(cleanCurrent);
    const major = currentParts[0];
    
    const allVersionsResult = safeExecSync(`npm view ${packageName} versions --json`);
    if (!allVersionsResult) return null;
    
    const allVersions = JSON.parse(allVersionsResult);
    if (!Array.isArray(allVersions)) return null;
    
    const compatibleVersions = allVersions.filter(v => {
      const parts = parseVersion(v);
      return parts[0] === major;
    });
    
    if (compatibleVersions.length === 0) return null;
    
    return compatibleVersions.sort(compareVersions).pop();
  } catch (e) {
    return null;
  }
}

module.exports = {
  parseVersion,
  compareVersions,
  calculateVersionDistance,
  chooseClosestVersion,
  stripVersionPrefix,
  getLatestVersionFromNpm,
  findLatestMinorVersion
};
