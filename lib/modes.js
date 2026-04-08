const { run, askUser, parsePackageVersion, die } = require('./utils');
const { removeOverridesForPackages } = require('./package-manager');
const { getCurrentVersions, isDirectDependency, hasMultipleVersions, findRelatedScopedPackages } = require('./dependency-analyzer');
const { runTrivyScan, extractTrivyVulnerabilities } = require('./trivy');
const { uninstallPackages, runAuditFix, installPackages } = require('./package-processor');
const { processVulnerabilities } = require('./vulnerability-fixer');
const { getChangesTracker } = require('./state');
const { t } = require('./i18n');

// ============================================================================
// TRIVY MODE
// ============================================================================

async function runTrivyMode(useExact, deps, devDeps) {
  console.log(t('trivy.scan_trivy_mode'));
  const trivyData = runTrivyScan();

  if (!trivyData) {
    die(t('trivy.trivy_die'));
  }

  const currentVersions = getCurrentVersions();
  const { all: vulnerablePackages, bySeverity } = extractTrivyVulnerabilities(trivyData, currentVersions);

  if (Object.keys(vulnerablePackages).length === 0) {
    console.log(t('trivy.no_vulnerabilities'));
    console.log(t('trivy.done_no_packages'));
    return;
  }

  const highCriticalCount = Object.keys(bySeverity.CRITICAL).length + Object.keys(bySeverity.HIGH).length;
  const mediumLowCount = Object.keys(bySeverity.MEDIUM).length + Object.keys(bySeverity.LOW).length;

  if (highCriticalCount === 0 && mediumLowCount > 0) {
    console.log(t('trivy.medium_low_found', { count: mediumLowCount }));
    console.log(t('trivy.vulns_header'));

    for (const [severity, packages] of Object.entries(bySeverity)) {
      if (Object.keys(packages).length > 0) {
        console.log(t('trivy.severity_label', { severity }));
        for (const [pkgName, version] of Object.entries(packages)) {
          const current = currentVersions[pkgName] || 'desconocida';
          console.log(t('trivy.vuln_line', { pkg: pkgName, current, version }));
        }
      }
    }

    const answer = await askUser(t('trivy.proceed_question'));
    if (answer !== 'y' && answer !== 'yes' && answer !== '') {
      console.log(t('trivy.fix_cancelled'));
      return;
    }
  } else if (mediumLowCount > 0) {
    console.log(t('trivy.high_crit_medium_low', { high: highCriticalCount, medium: mediumLowCount }));
  }

  console.log(t('packages.identifying_direct'));
  const toUninstallProd = [];
  const toUninstallDev = [];
  const CHANGES_TRACKER = getChangesTracker();

  const scopedDirectPackages = new Map();

  for (const pkgName of Object.keys(vulnerablePackages)) {
    const isDirect = isDirectDependency(pkgName);
    const hasMultipleVers = hasMultipleVersions(pkgName);

    if (isDirect) {
      if (pkgName.startsWith('@')) {
        const scope = pkgName.split('/')[0];
        if (!scopedDirectPackages.has(scope)) {
          scopedDirectPackages.set(scope, { prod: [], dev: [], vulnerable: [] });
        }
        scopedDirectPackages.get(scope).vulnerable.push(pkgName);
      }

      if (deps.has(pkgName)) {
        toUninstallProd.push(pkgName);
        console.log(t('packages.prod', { pkg: pkgName }));

        if (pkgName.startsWith('@')) {
          const scope = pkgName.split('/')[0];
          scopedDirectPackages.get(scope).prod.push(pkgName);
        }
      } else if (devDeps.has(pkgName)) {
        toUninstallDev.push(pkgName);
        console.log(t('packages.dev_pkg', { pkg: pkgName }));

        if (pkgName.startsWith('@')) {
          const scope = pkgName.split('/')[0];
          scopedDirectPackages.get(scope).dev.push(pkgName);
        }
      } else {
        console.log(t('packages.orphan', { pkg: pkgName }));
      }

      if (hasMultipleVers) {
        console.log(t('packages.multiple_npm_resolves'));
      }
    }
  }

  // Check for scoped package families that should be updated together
  const scopeFamiliesToUpdate = new Map();
  for (const [scope, data] of scopedDirectPackages) {
    if (data.vulnerable.length > 0) {
      const allScopedDeps = [...deps, ...devDeps].filter(p => p.startsWith(scope + '/'));
      if (allScopedDeps.length > data.vulnerable.length) {
        scopeFamiliesToUpdate.set(scope, {
          vulnerable: data.vulnerable,
          all: allScopedDeps,
          prodPackages: allScopedDeps.filter(p => deps.has(p)),
          devPackages: allScopedDeps.filter(p => devDeps.has(p))
        });
      }
    }
  }

  if (scopeFamiliesToUpdate.size > 0) {
    console.log(t('families.important_detected'));
    for (const [scope, data] of scopeFamiliesToUpdate) {
      console.log(t('families.scope_line', { scope, count: data.all.length }));
      console.log(t('families.vulnerable_label', { packages: data.vulnerable.join(', ') }));
      const allPkgs = data.all.slice(0, 5).join(', ') + (data.all.length > 5 ? '...' : '');
      console.log(t('families.all_packages', { packages: allPkgs }));
    }

    const answer = await askUser(t('families.update_all_question'));

    if (answer === 'y' || answer === 'yes' || answer === '') {
      console.log(t('families.updating_all'));

      for (const [scope, data] of scopeFamiliesToUpdate) {
        console.log(t('families.updating_scope', { scope, count: data.all.length }));
        console.log(t('families.uninstalling_scope', { count: data.all.length }));
        run(`npm uninstall ${data.all.join(' ')}`);

        const prodPackagesWithVersions = data.prodPackages.map(pkg => {
          if (data.vulnerable.includes(pkg)) {
            return `${pkg}@${vulnerablePackages[pkg]}`;
          }
          return `${pkg}@latest`;
        });

        const devPackagesWithVersions = data.devPackages.map(pkg => {
          if (data.vulnerable.includes(pkg)) {
            return `${pkg}@${vulnerablePackages[pkg]}`;
          }
          return `${pkg}@latest`;
        });

        if (prodPackagesWithVersions.length > 0) {
          console.log(t('families.reinstalling_prod', { packages: prodPackagesWithVersions.join(', ') }));
          run(`npm install${useExact ? ' --save-exact' : ''} ${prodPackagesWithVersions.join(' ')}`);

          for (const pkg of data.prodPackages) {
            const fixedVersion = data.vulnerable.includes(pkg) ? vulnerablePackages[pkg] : 'latest';
            const currentVer = currentVersions[pkg] || 'desconocida';
            CHANGES_TRACKER.directUpdates.push({ name: pkg, from: currentVer, to: fixedVersion, type: 'prod' });
          }
        }
        if (devPackagesWithVersions.length > 0) {
          console.log(t('families.reinstalling_dev', { packages: devPackagesWithVersions.join(', ') }));
          run(`npm install --save-dev${useExact ? ' --save-exact' : ''} ${devPackagesWithVersions.join(' ')}`);

          for (const pkg of data.devPackages) {
            const fixedVersion = data.vulnerable.includes(pkg) ? vulnerablePackages[pkg] : 'latest';
            const currentVer = currentVersions[pkg] || 'desconocida';
            CHANGES_TRACKER.directUpdates.push({ name: pkg, from: currentVer, to: fixedVersion, type: 'dev' });
          }
        }

        for (const pkg of data.vulnerable) {
          const prodIndex = toUninstallProd.indexOf(pkg);
          if (prodIndex > -1) toUninstallProd.splice(prodIndex, 1);

          const devIndex = toUninstallDev.indexOf(pkg);
          if (devIndex > -1) toUninstallDev.splice(devIndex, 1);
        }
      }

      console.log(t('families.families_done'));
    } else {
      console.log(t('families.individual_warning'));
    }
  }

  if (toUninstallProd.length === 0 && toUninstallDev.length === 0) {
    console.log(t('families.all_subdeps'));

    const scopedPackages = Object.keys(vulnerablePackages).filter(pkg => pkg.startsWith('@'));
    const scopeSuggestions = new Map();

    for (const pkg of scopedPackages) {
      const allPackages = [...deps, ...devDeps];
      const relatedPackages = findRelatedScopedPackages(pkg, allPackages);

      if (relatedPackages.length > 0) {
        const scope = pkg.split('/')[0];
        if (!scopeSuggestions.has(scope)) {
          scopeSuggestions.set(scope, { packages: [], related: [] });
        }
        scopeSuggestions.get(scope).packages.push(pkg);
        scopeSuggestions.get(scope).related = relatedPackages;
      }
    }

    if (scopeSuggestions.size > 0) {
      console.log(t('families.note'));
      for (const [scope, data] of scopeSuggestions) {
        const allScopedDeps = [...deps, ...devDeps].filter(p => p.startsWith(scope + '/'));
        console.log(t('families.scope_line', { scope, count: allScopedDeps.length }));
        console.log(t('families.vulnerable_label', { packages: data.packages.join(', ') }));
        const related = data.related.slice(0, 3).join(', ') + (data.related.length > 3 ? '...' : '');
        console.log(`   ${related}`);
      }
      console.log(t('families.will_ask'));
    }
  }

  if (toUninstallProd.length || toUninstallDev.length) {
    removeOverridesForPackages([...toUninstallProd, ...toUninstallDev]);
    uninstallPackages(toUninstallProd, toUninstallDev);
    runAuditFix();

    const prodWithVersions = toUninstallProd.map(p =>
      vulnerablePackages[p] ? `${p}@${vulnerablePackages[p]}` : p
    );
    const devWithVersions = toUninstallDev.map(p =>
      vulnerablePackages[p] ? `${p}@${vulnerablePackages[p]}` : p
    );

    if (prodWithVersions.length) {
      console.log(t('packages.reinstalling_patched'));
      prodWithVersions.forEach(p => {
        console.log(t('packages.reinstall_line', { pkg: p }));
        const parsed = parsePackageVersion(p);
        if (parsed.version) {
          CHANGES_TRACKER.directUpdates.push({
            name: parsed.name,
            from: currentVersions[parsed.name] || 'desconocida',
            to: parsed.version,
            type: 'prod'
          });
        }
      });
      run(`npm install${useExact ? ' --save-exact' : ''} ${prodWithVersions.join(' ')}`);
    }
    if (devWithVersions.length) {
      console.log(t('packages.reinstalling_dev'));
      devWithVersions.forEach(p => {
        console.log(t('packages.reinstall_line', { pkg: p }));
        const parsed = parsePackageVersion(p);
        if (parsed.version) {
          CHANGES_TRACKER.directUpdates.push({
            name: parsed.name,
            from: currentVersions[parsed.name] || 'desconocida',
            to: parsed.version,
            type: 'dev'
          });
        }
      });
      run(`npm install --save-dev${useExact ? ' --save-exact' : ''} ${devWithVersions.join(' ')}`);
    }
  } else {
    runAuditFix();
  }

  await processSecondTrivyScan(useExact, deps, devDeps);
}

async function processSecondTrivyScan(useExact, deps, devDeps) {
  const trivyData = runTrivyScan();

  if (trivyData) {
    const currentVersions = getCurrentVersions();
    const { all: vulnerablePackages, bySeverity } = extractTrivyVulnerabilities(trivyData, currentVersions);

    if (Object.keys(vulnerablePackages).length > 0) {
      const highCriticalCount = Object.keys(bySeverity.CRITICAL).length + Object.keys(bySeverity.HIGH).length;
      const mediumLowCount = Object.keys(bySeverity.MEDIUM).length + Object.keys(bySeverity.LOW).length;

      if (highCriticalCount === 0 && mediumLowCount > 0) {
        console.log(t('trivy.medium_low_additional', { count: mediumLowCount }));
        console.log(t('trivy.vulns_header'));

        for (const [severity, packages] of Object.entries(bySeverity)) {
          if (Object.keys(packages).length > 0) {
            console.log(t('trivy.severity_label', { severity }));
            for (const [pkgName, version] of Object.entries(packages)) {
              const current = currentVersions[pkgName] || 'desconocida';
              console.log(t('trivy.vuln_line', { pkg: pkgName, current, version }));
            }
          }
        }

        const answer = await askUser(t('trivy.proceed_question'));
        if (answer !== 'y' && answer !== 'yes' && answer !== '') {
          console.log(t('trivy.fix_cancelled'));
          return;
        }
      } else if (mediumLowCount > 0) {
        console.log(t('trivy.remaining', { high: highCriticalCount, medium: mediumLowCount }));
      }

      await processVulnerabilities(vulnerablePackages, currentVersions, deps, devDeps, useExact);
    } else {
      console.log(t('trivy.no_vulnerabilities'));
    }
  } else {
    console.log(t('trivy.skip_analysis'));
  }
}

// ============================================================================
// NORMAL MODE
// ============================================================================

async function runNormalMode(matched, deps, devDeps, useExact, processAll) {
  if (processAll) {
    const allNames = [...deps, ...devDeps];
    allNames.forEach(name => matched.add(name));
  }

  if (matched.size === 0) {
    console.log(t('packages.no_packages_found'));
    return;
  }

  const toUninstallProd = [];
  const toUninstallDev = [];

  for (const pkg of matched) {
    if (devDeps.has(pkg)) {
      toUninstallDev.push(pkg);
    } else if (deps.has(pkg)) {
      toUninstallProd.push(pkg);
    } else {
      console.log(t('packages.not_found', { pkg }));
    }
  }

  if (toUninstallProd.length === 0 && toUninstallDev.length === 0) {
    console.log(t('packages.no_valid_packages'));
    return;
  }

  const exactFlag = useExact ? ' --save-exact' : '';

  removeOverridesForPackages([...toUninstallProd, ...toUninstallDev]);

  uninstallPackages(toUninstallProd, toUninstallDev);
  runAuditFix();
  installPackages(toUninstallProd, toUninstallDev, exactFlag);

  await processSecondTrivyScan(useExact, deps, devDeps);
}

// ============================================================================
// CLEAN MODE - Find and remove unused dependencies
// ============================================================================

async function runCleanMode(pkgJson, includeDev = false) {
  const { scanUsedDependencies, findUnusedDependencies, uninstallUnusedPackages } = require('./dependency-scanner');
  const { askUser } = require('./utils');

  console.log(t('clean.header'));

  if (includeDev) {
    console.log(t('clean.include_dev_warning'));
    console.log(t('clean.include_dev_detail'));
  } else {
    console.log(t('clean.prod_only_info'));
    console.log(t('clean.prod_only_exclude'));
  }

  const usedPackages = scanUsedDependencies();
  const unused = findUnusedDependencies(pkgJson, usedPackages, includeDev);
  const totalUnused = unused.dependencies.length + unused.devDependencies.length;

  if (totalUnused === 0) {
    console.log(t('clean.no_unused'));
    return;
  }

  console.log(t('clean.unused_found', { count: totalUnused }));

  if (unused.dependencies.length > 0) {
    console.log(t('clean.prod_section'));
    unused.dependencies.forEach(dep => console.log(t('clean.dep_line', { dep })));
    console.log('');
  }

  if (unused.devDependencies.length > 0) {
    console.log(t('clean.dev_section'));
    unused.devDependencies.forEach(dep => console.log(t('clean.dep_line', { dep })));
    console.log('');
  }

  console.log(t('clean.types_excluded'));

  const answer = await askUser(t('clean.remove_question'));

  if (answer === 'y' || answer === 'yes' || answer === '') {
    const removed = uninstallUnusedPackages(unused.dependencies, unused.devDependencies);
    console.log(t('clean.removed', { count: removed }));
  } else {
    console.log(t('clean.cancelled'));
  }
}

// ============================================================================
// AUDIT MODE - List vulnerabilities without fixing
// ============================================================================

async function runAuditMode() {
  const { safeExecSync } = require('./utils');

  console.log(t('audit.title'));
  console.log(t('audit.scanning'));

  const trivyData = runTrivyScan();

  if (!trivyData) {
    console.log(t('audit.no_trivy'));
    return;
  }

  const currentVersions = getCurrentVersions();
  const { all: vulnerablePackages, bySeverity } = extractTrivyVulnerabilities(trivyData, currentVersions);

  if (Object.keys(vulnerablePackages).length === 0) {
    console.log(t('audit.no_vulnerabilities'));
    return;
  }

  const packagesBySeverity = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };

  console.log(t('audit.vulns_detected'));
  console.log('='.repeat(70));

  for (const [pkgName, fixedVersion] of Object.entries(vulnerablePackages)) {
    const currentVer = currentVersions[pkgName] || 'desconocida';
    const isDirect = isDirectDependency(pkgName);

    let severity = 'LOW';
    for (const [sev, packages] of Object.entries(bySeverity)) {
      if (packages[pkgName]) {
        severity = sev;
        break;
      }
    }

    packagesBySeverity[severity].push({ name: pkgName, current: currentVer, fixed: fixedVersion, isDirect });

    const severityIcon = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' }[severity];

    console.log(`\n${severityIcon} [${severity}] ${pkgName}`);
    console.log(t('audit.current_version', { version: currentVer }));
    console.log(t('audit.fixed_version', { version: fixedVersion }));
    console.log(isDirect ? t('audit.type_direct') : t('audit.type_transitive'));

    const tree = safeExecSync(`npm list ${pkgName} 2>/dev/null`);
    if (tree) {
      console.log(t('audit.dep_tree'));
      const lines = tree.split('\n').slice(0, 10);
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`   ${line}`);
        }
      });
      if (tree.split('\n').length > 10) {
        console.log(t('audit.more_lines', { count: tree.split('\n').length - 10 }));
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(t('audit.severity_summary'));

  const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  let totalVulns = 0;

  for (const severity of severities) {
    const count = packagesBySeverity[severity].length;
    if (count > 0) {
      totalVulns += count;
      const icon = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' }[severity];
      const label = count === 1 ? t('audit.package_singular') : t('audit.package_plural');

      console.log(`${icon} ${severity.padEnd(10)} : ${count} ${label}`);

      packagesBySeverity[severity].forEach(pkg => {
        const typeIcon = pkg.isDirect ? '📦' : '📂';
        console.log(`     ${typeIcon} ${pkg.name} (${pkg.current} → ${pkg.fixed})`);
      });
      console.log('');
    }
  }

  console.log('─'.repeat(70));
  const totalLabel = totalVulns === 1 ? t('audit.total_singular', { count: totalVulns }) : t('audit.total_plural', { count: totalVulns });
  console.log(totalLabel);
  console.log('');
  console.log(t('audit.fix_suggestion'));
  console.log(t('audit.fix_command'));
  console.log('');
}

// ============================================================================
// HUSKY MODE - Gatekeeper strictly failing the commit
// ============================================================================

async function runHuskyMode() {
  console.log(t('husky.title'));
  console.log(t('husky.scanning'));

  const trivyData = runTrivyScan();

  if (!trivyData) {
    console.log(t('husky.no_trivy'));
    return;
  }

  const currentVersions = getCurrentVersions();
  const { all: vulnerablePackages } = extractTrivyVulnerabilities(trivyData, currentVersions);
  const keys = Object.keys(vulnerablePackages);

  if (keys.length === 0) {
    console.log(t('husky.no_vulnerabilities'));
    return;
  }

  console.log(t('husky.vulns_detected'));
  keys.forEach(p => console.log(`   - ${p}`));
  
  console.log('');
  console.log(t('husky.fix_suggestion'));
  console.log('');
  process.exit(1);
}

module.exports = {
  runTrivyMode,
  processSecondTrivyScan,
  runNormalMode,
  runCleanMode,
  runAuditMode,
  runHuskyMode
};
