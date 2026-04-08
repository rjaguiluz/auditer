const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { t } = require('./i18n');

// ============================================================================
// DEPENDENCY USAGE SCANNER
// ============================================================================

/**
 * Recursively find all source files in a directory
 */
function findSourceFiles(dir, excludeDirs = ['node_modules', 'dist', 'build', '.git', 'coverage']) {
  const files = [];

  try {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);

      try {
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (!excludeDirs.includes(item)) {
            files.push(...findSourceFiles(fullPath, excludeDirs));
          }
        } else if (stat.isFile()) {
          if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(item)) {
            files.push(fullPath);
          }
        }
      } catch (err) {
        console.warn(t('scanner.cannot_access', { path: fullPath, error: err.message }));
      }
    }
  } catch (err) {
    console.warn(t('scanner.cannot_read_dir', { path: dir, error: err.message }));
  }

  return files;
}

/**
 * Extract imported/required packages from source code
 */
function extractImportsFromFile(filePath) {
  const imports = new Set();

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }

    const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    while ((match = importRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }

    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }

  } catch (err) {
    console.warn(t('scanner.cannot_read_file', { path: filePath, error: err.message }));
  }

  return imports;
}

/**
 * Normalize package name (remove subpaths)
 * Example: 'lodash/get' -> 'lodash', '@babel/core/lib' -> '@babel/core'
 */
function normalizePackageName(importPath) {
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    return null;
  }

  const builtins = [
    'fs', 'path', 'os', 'util', 'crypto', 'http', 'https', 'stream',
    'events', 'child_process', 'url', 'querystring', 'zlib', 'buffer',
    'assert', 'async_hooks', 'cluster', 'console', 'constants', 'dgram',
    'dns', 'domain', 'module', 'net', 'perf_hooks', 'process', 'punycode',
    'readline', 'repl', 'string_decoder', 'timers', 'tls', 'tty', 'v8',
    'vm', 'wasi', 'worker_threads'
  ];

  if (builtins.includes(importPath)) {
    return null;
  }

  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return importPath;
  }

  const parts = importPath.split('/');
  return parts[0];
}

/**
 * Scan all source files and find which packages are actually used
 */
function scanUsedDependencies(projectRoot = process.cwd()) {
  console.log(t('scanner.scanning_files'));

  const sourceFiles = findSourceFiles(projectRoot);
  console.log(t('scanner.files_found', { count: sourceFiles.length }));

  const usedPackages = new Set();

  for (const file of sourceFiles) {
    const imports = extractImportsFromFile(file);
    for (const imp of imports) {
      const pkgName = normalizePackageName(imp);
      if (pkgName) {
        usedPackages.add(pkgName);
      }
    }
  }

  console.log(t('scanner.packages_found', { count: usedPackages.size }));

  return usedPackages;
}

/**
 * Find unused dependencies in package.json
 */
function findUnusedDependencies(pkgJson, usedPackages, checkDevDeps = false) {
  const unused = {
    dependencies: [],
    devDependencies: []
  };

  if (pkgJson.dependencies) {
    for (const dep of Object.keys(pkgJson.dependencies)) {
      if (dep.startsWith('@types/')) {
        continue;
      }
      if (!usedPackages.has(dep)) {
        unused.dependencies.push(dep);
      }
    }
  }

  if (checkDevDeps && pkgJson.devDependencies) {
    for (const dep of Object.keys(pkgJson.devDependencies)) {
      if (dep.startsWith('@types/')) {
        continue;
      }
      if (!usedPackages.has(dep)) {
        unused.devDependencies.push(dep);
      }
    }
  }

  return unused;
}

/**
 * Uninstall packages
 */
function uninstallUnusedPackages(prodPackages, devPackages) {
  let totalRemoved = 0;

  if (prodPackages.length > 0) {
    console.log(t('scanner.uninstalling_prod', { count: prodPackages.length }));
    try {
      execSync(`npm uninstall ${prodPackages.join(' ')}`, { stdio: 'inherit' });
      totalRemoved += prodPackages.length;
    } catch (err) {
      console.error(t('scanner.uninstall_prod_error'));
    }
  }

  if (devPackages.length > 0) {
    console.log(t('scanner.uninstalling_dev', { count: devPackages.length }));
    try {
      execSync(`npm uninstall ${devPackages.join(' ')}`, { stdio: 'inherit' });
      totalRemoved += devPackages.length;
    } catch (err) {
      console.error(t('scanner.uninstall_dev_error'));
    }
  }

  return totalRemoved;
}

module.exports = {
  scanUsedDependencies,
  findUnusedDependencies,
  uninstallUnusedPackages
};
