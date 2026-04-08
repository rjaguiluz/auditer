const { run } = require('./utils');

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
  console.log('\nRunning npm audit fix...');
  try {
    run('npm audit fix');
  } catch (e) {
    console.warn('`npm audit fix` falló o no encontró cambios (continuando)...');
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
