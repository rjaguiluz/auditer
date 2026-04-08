// ============================================================================
// CONSTANTS
// ============================================================================

const TRIVY_SEVERITIES = 'LOW,MEDIUM,HIGH,CRITICAL';
const TRIVY_SCAN_CMD = `trivy fs --scanners vuln --severity ${TRIVY_SEVERITIES} --format json --quiet .`;
const VERSION_SCORE_WEIGHTS = {
  MAJOR: 1000,
  MINOR: 100,
  PATCH: 1
};

module.exports = {
  TRIVY_SEVERITIES,
  TRIVY_SCAN_CMD,
  VERSION_SCORE_WEIGHTS
};
