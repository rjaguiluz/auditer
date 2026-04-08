const fs = require('fs');
const path = require('path');

// ============================================================================
// WORKSPACE DISCOVERY
// ============================================================================

/**
 * Recursively find directories containing a package.json file,
 * ignoring common build and dependency folders.
 * 
 * @param {string} currentDir - The starting directory
 * @returns {string[]} Array of absolute paths to workspaces
 */
function findWorkspaces(currentDir) {
  const workspaces = [];
  const ignores = ['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage'];

  function traverse(dir) {
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch (err) {
      return; // Ignore permission errors or bad paths
    }

    if (files.includes('package.json')) {
      workspaces.push(dir);
    }

    for (const file of files) {
      if (ignores.includes(file)) continue;

      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          traverse(fullPath);
        }
      } catch (err) {
        // Ignore stats errors (e.g. broken symlinks)
      }
    }
  }

  traverse(currentDir);
  return workspaces;
}

module.exports = {
  findWorkspaces
};
