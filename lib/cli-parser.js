const { die } = require('./utils');

// ============================================================================
// COMMAND LINE ARGUMENT PARSING
// ============================================================================

function parseArguments() {
  const rawArgs = process.argv.slice(2);
  const useExact = rawArgs.includes('--exact');
  const onlyTrivy = rawArgs.includes('--trivy');
  const silent = rawArgs.includes('--silent');
  const replaceExact = rawArgs.includes('--replace-exact');
  const upMinor = rawArgs.includes('--up-minor');
  const upMajor = rawArgs.includes('--up-major');
  const assumeYes = rawArgs.includes('--yes') || rawArgs.includes('-y') || rawArgs.includes('--force');
  const clean = rawArgs.includes('--clean');
  const includeDev = rawArgs.includes('--include-dev');
  const dryRun = rawArgs.includes('--dry-run');
  const audit = rawArgs.includes('--audit');
  const husky = rawArgs.includes('--husky');
  const isRecursive = rawArgs.includes('--recursive') || rawArgs.includes('-r');
  const printVersion = rawArgs.includes('--version') || rawArgs.includes('-v');
  
  const filteredArgs = rawArgs.filter(a => 
    a !== '--exact' && 
    a !== '--trivy' && 
    a !== '--silent' &&
    a !== '--replace-exact' &&
    a !== '--up-minor' &&
    a !== '--up-major' &&
    a !== '--yes' &&
    a !== '-y' &&
    a !== '--force' &&
    a !== '--clean' &&
    a !== '--include-dev' &&
    a !== '--dry-run' &&
    a !== '--audit' &&
    a !== '--husky' &&
    a !== '--recursive' &&
    a !== '-r' &&
    a !== '--version' &&
    a !== '-v'
  );
  
  return { useExact, onlyTrivy, silent, replaceExact, upMinor, upMajor, assumeYes, clean, includeDev, dryRun, audit, husky, isRecursive, printVersion, filteredArgs };
}

function parsePackagePatterns(args) {
  const explicit = [];
  const regexes = [];
  
  for (const arg of args) {
    if (arg.length >= 2 && arg[0] === '/' && arg.lastIndexOf('/') > 0) {
      const last = arg.lastIndexOf('/');
      const pattern = arg.slice(1, last);
      const flags = arg.slice(last + 1);
      try {
        regexes.push(new RegExp(pattern, flags));
      } catch (e) {
        die(`Regex inválida: ${arg}`);
      }
    } else {
      explicit.push(arg);
    }
  }
  
  return { explicit, regexes };
}

function matchPackages(patterns, allPackages) {
  const matched = new Set();
  
  for (const regex of patterns.regexes) {
    for (const name of allPackages) {
      if (regex.test(name)) matched.add(name);
    }
  }
  
  for (const name of patterns.explicit) {
    matched.add(name);
  }
  
  return matched;
}

module.exports = {
  parseArguments,
  parsePackagePatterns,
  matchPackages
};
