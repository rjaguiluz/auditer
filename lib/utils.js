const { execSync } = require('child_process');
const readline = require('readline');
const { getSilentMode, getChangesTracker } = require('./state');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function run(cmd) {
  if (!getSilentMode()) {
    console.log('\n$ ' + cmd);
  }
  
  try {
    if (getSilentMode()) {
      execSync(cmd, { stdio: 'pipe' });
    } else {
      execSync(cmd, { stdio: 'inherit' });
    }
  } catch (e) {
    if (getSilentMode() && e.stderr) {
      console.error(e.stderr.toString());
    }
    throw e;
  }
}

function die(msg) {
  console.error('Error:', msg);
  process.exit(1);
}

function askUser(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function displayChangeSummary() {
  const CHANGES_TRACKER = getChangesTracker();
  const hasChanges = CHANGES_TRACKER.directUpdates.length > 0 || 
                     CHANGES_TRACKER.overrides.length > 0 ||
                     CHANGES_TRACKER.removed.length > 0 ||
                     CHANGES_TRACKER.versionChanges.length > 0;
  
  if (!hasChanges) {
    console.log('\n📊 Resumen: No se realizaron cambios.');
    return;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN DE CAMBIOS');
  console.log('='.repeat(60));
  
  if (CHANGES_TRACKER.versionChanges.length > 0) {
    console.log('\n📌 Versiones actualizadas:');
    CHANGES_TRACKER.versionChanges.forEach(({ name, from, to, type }) => {
      const typeLabel = type === 'dev' ? '[dev]' : '[prod]';
      console.log(`   ${name}: ${from} → ${to} ${typeLabel}`);
    });
  }
  
  if (CHANGES_TRACKER.directUpdates.length > 0) {
    console.log('\n✅ Dependencias actualizadas:');
    CHANGES_TRACKER.directUpdates.forEach(({ name, from, to, type }) => {
      const typeLabel = type === 'dev' ? '[dev]' : '[prod]';
      console.log(`   ${name}: ${from} → ${to} ${typeLabel}`);
    });
  }
  
  if (CHANGES_TRACKER.overrides.length > 0) {
    console.log('\n📝 Overrides aplicados (subdependencias):');
    CHANGES_TRACKER.overrides.forEach(({ name, from, to }) => {
      console.log(`   ${name}: ${from} → ${to}`);
    });
  }
  
  if (CHANGES_TRACKER.removed.length > 0) {
    console.log('\n🗑️  Overrides removidos:');
    CHANGES_TRACKER.removed.forEach(name => {
      console.log(`   ${name}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
}

function safeExecSync(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...options });
  } catch (e) {
    return null;
  }
}

function parsePackageVersion(packageString) {
  const lastAtIndex = packageString.lastIndexOf('@');
  
  if (lastAtIndex <= 0) {
    return { name: packageString, version: null };
  }
  
  const name = packageString.substring(0, lastAtIndex);
  const version = packageString.substring(lastAtIndex + 1);
  
  return { name, version };
}

module.exports = {
  run,
  die,
  askUser,
  displayChangeSummary,
  safeExecSync,
  parsePackageVersion
};
