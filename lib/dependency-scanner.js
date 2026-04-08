const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
          // Include common source file extensions
          if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(item)) {
            files.push(fullPath);
          }
        }
      } catch (err) {
        // Skip files we can't access
        console.warn(`  ⚠️  No se puede acceder a ${fullPath}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`  ⚠️  No se puede leer directorio ${dir}: ${err.message}`);
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
    
    // Match require('package-name') or require("package-name")
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }
    
    // Match import ... from 'package-name' or import('package-name')
    const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    while ((match = importRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }
    
    // Match dynamic import()
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }
    
  } catch (err) {
    console.warn(`  ⚠️  No se puede leer ${filePath}: ${err.message}`);
  }
  
  return imports;
}

/**
 * Normalize package name (remove subpaths)
 * Example: 'lodash/get' -> 'lodash', '@babel/core/lib' -> '@babel/core'
 */
function normalizePackageName(importPath) {
  // Relative imports
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    return null;
  }
  
  // Built-in modules
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
  
  // Scoped packages (@scope/package)
  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return importPath;
  }
  
  // Regular packages
  const parts = importPath.split('/');
  return parts[0];
}

/**
 * Scan all source files and find which packages are actually used
 */
function scanUsedDependencies(projectRoot = process.cwd()) {
  console.log('🔍 Escaneando archivos del proyecto...');
  
  const sourceFiles = findSourceFiles(projectRoot);
  console.log(`   Encontrados ${sourceFiles.length} archivos de código`);
  
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
  
  console.log(`   Detectados ${usedPackages.size} paquetes únicos en uso`);
  
  return usedPackages;
}

/**
 * Find unused dependencies in package.json
 * @param {Object} pkgJson - package.json object
 * @param {Set} usedPackages - Set of packages found in source code
 * @param {boolean} checkDevDeps - Whether to check devDependencies (default: false)
 */
function findUnusedDependencies(pkgJson, usedPackages, checkDevDeps = false) {
  const unused = {
    dependencies: [],
    devDependencies: []
  };
  
  // Check production dependencies
  if (pkgJson.dependencies) {
    for (const dep of Object.keys(pkgJson.dependencies)) {
      // Skip @types/* packages (they're compile-time only)
      if (dep.startsWith('@types/')) {
        continue;
      }
      
      if (!usedPackages.has(dep)) {
        unused.dependencies.push(dep);
      }
    }
  }
  
  // Check dev dependencies only if explicitly requested
  if (checkDevDeps && pkgJson.devDependencies) {
    for (const dep of Object.keys(pkgJson.devDependencies)) {
      // Skip @types/* packages
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
    console.log(`\n📦 Desinstalando ${prodPackages.length} dependencias de producción...`);
    try {
      execSync(`npm uninstall ${prodPackages.join(' ')}`, { stdio: 'inherit' });
      totalRemoved += prodPackages.length;
    } catch (err) {
      console.error('❌ Error al desinstalar dependencias de producción');
    }
  }
  
  if (devPackages.length > 0) {
    console.log(`\n📦 Desinstalando ${devPackages.length} dependencias de desarrollo...`);
    try {
      execSync(`npm uninstall ${devPackages.join(' ')}`, { stdio: 'inherit' });
      totalRemoved += devPackages.length;
    } catch (err) {
      console.error('❌ Error al desinstalar dependencias de desarrollo');
    }
  }
  
  return totalRemoved;
}

module.exports = {
  scanUsedDependencies,
  findUnusedDependencies,
  uninstallUnusedPackages
};
