const { run } = require('./utils');
const { t } = require('./i18n');

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
  console.log(t('processor.running_audit_fix'));
  try {
    run('npm audit fix');
  } catch (e) {
    console.warn(t('processor.audit_fix_failed'));
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

module.exports = {
  uninstallPackages,
  runAuditFix,
  installPackages
};
