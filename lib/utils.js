const { execSync } = require('child_process');
const readline = require('readline');
const { getSilentMode, getAssumeYes, getDryRun, getChangesTracker } = require('./state');
const { t } = require('./i18n');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function run(cmd) {
  const isDryRun = getDryRun();

  if (isDryRun) {
    console.log(t('summary.dryrun_prefix') + cmd);
    return; // Don't execute in dry-run mode
  }

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
  // If --yes flag is set, always return 'y'
  if (getAssumeYes()) {
    console.log(question + 'y (auto)');
    return Promise.resolve('y');
  }

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
    console.log(t('summary.no_changes'));
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log(t('summary.header'));
  console.log('='.repeat(60));

  if (CHANGES_TRACKER.versionChanges.length > 0) {
    console.log(t('summary.version_changes'));
    CHANGES_TRACKER.versionChanges.forEach(({ name, from, to, type }) => {
      const typeLabel = type === 'dev' ? t('summary.type_dev') : t('summary.type_prod');
      console.log(t('summary.change_line', { name, from, to, type: typeLabel }));
    });
  }

  if (CHANGES_TRACKER.directUpdates.length > 0) {
    console.log(t('summary.direct_updates'));
    CHANGES_TRACKER.directUpdates.forEach(({ name, from, to, type }) => {
      const typeLabel = type === 'dev' ? t('summary.type_dev') : t('summary.type_prod');
      console.log(t('summary.change_line', { name, from, to, type: typeLabel }));
    });
  }

  if (CHANGES_TRACKER.overrides.length > 0) {
    console.log(t('summary.overrides_applied'));
    CHANGES_TRACKER.overrides.forEach(({ name, from, to }) => {
      console.log(t('summary.change_line', { name, from, to, type: '' }).trimEnd());
    });
  }

  if (CHANGES_TRACKER.removed.length > 0) {
    console.log(t('summary.overrides_removed'));
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
