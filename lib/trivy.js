const { execSync } = require('child_process');
const { TRIVY_SCAN_CMD } = require('./constants');
const { safeExecSync } = require('./utils');
const { chooseClosestVersion } = require('./version-utils');
const { t } = require('./i18n');

// ============================================================================
// TRIVY INTEGRATION
// ============================================================================

function checkTrivyInstalled() {
  return safeExecSync('which trivy') !== null;
}

function runTrivyScan() {
  if (!checkTrivyInstalled()) {
    console.log(t('trivy.not_installed'));
    console.log(t('trivy.install_macos'));
    console.log(t('trivy.install_linux'));
    return null;
  }

  console.log(t('trivy.scanning'));

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
      console.warn(t('trivy.parse_error'));
    }
    return null;
  }
}

function extractTrivyVulnerabilities(trivyData, currentVersions) {
  if (!trivyData || !trivyData.Results) return { all: {}, bySeverity: {} };

  const vulnOptions = {};
  const severityMap = {};

  for (const result of trivyData.Results) {
    if (!result.Vulnerabilities) continue;

    for (const vuln of result.Vulnerabilities) {
      const pkgName = vuln.PkgName;
      const fixedVersion = vuln.FixedVersion;
      const severity = vuln.Severity || 'UNKNOWN';

      if (fixedVersion && fixedVersion !== '' && fixedVersion !== 'unknown') {
        if (!vulnOptions[pkgName]) {
          vulnOptions[pkgName] = [];
        }

        // Parse multiple versions if they come separated by commas
        const versions = fixedVersion.includes(',')
          ? fixedVersion.split(',').map(v => v.trim()).filter(v => v)
          : [fixedVersion];

        for (const version of versions) {
          if (!vulnOptions[pkgName].includes(version)) {
            vulnOptions[pkgName].push(version);
          }
        }

        const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
        const currentRank = severityRank[severityMap[pkgName]] || 0;
        const newRank = severityRank[severity] || 0;
        if (newRank > currentRank) {
          severityMap[pkgName] = severity;
        }
      }
    }
  }

  const vulnMap = {};
  const bySeverity = { CRITICAL: {}, HIGH: {}, MEDIUM: {}, LOW: {} };

  for (const [pkgName, versions] of Object.entries(vulnOptions)) {
    const currentVersion = currentVersions[pkgName];
    const fixedVersion = versions.length === 1
      ? versions[0]
      : chooseClosestVersion(currentVersion, versions);

    // Only add if we found a valid fixed version
    if (fixedVersion) {
      vulnMap[pkgName] = fixedVersion;

      const severity = severityMap[pkgName] || 'UNKNOWN';
      if (bySeverity[severity]) {
        bySeverity[severity][pkgName] = fixedVersion;
      }
    }
  }

  return { all: vulnMap, bySeverity };
}

module.exports = {
  checkTrivyInstalled,
  runTrivyScan,
  extractTrivyVulnerabilities
};
