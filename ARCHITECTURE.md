# Auditer Project Structure

## 📁 Modular Organization

The code is organized in independent modules for better maintainability:

```
auditer/
├── bin/
│   ├── auditer.js            # Main entry point (CLI)
│   └── auditer-backup.js     # Backup of the original monolithic version
│
└── lib/
    ├── constants.js          # Project constants
    ├── state.js              # Global state (silent mode, change tracker)
    ├── utils.js              # General utility functions
    ├── i18n.js               # Internationalization (EN/ES auto-detect)
    ├── package-manager.js    # package.json operations
    ├── version-utils.js      # Version comparison and handling
    ├── dependency-analyzer.js # Dependency analysis (npm list)
    ├── trivy.js              # Trivy integration
    ├── package-processor.js  # Package install/uninstall
    ├── cli-parser.js         # CLI argument parser
    ├── vulnerability-fixer.js # Vulnerability fixing
    ├── version-manager.js    # Version management (--replace-exact, --up-minor, --up-major)
    └── modes.js              # Execution modes (trivy, normal, clean, audit)
```

## 📦 Modules

### 🔧 bin/auditer.js
**Main Entry Point**
- Application entry point
- Orchestrates execution based on arguments
- ~110 lines (previously: ~1179 lines)

### 📌 lib/constants.js
**Project Constants**
- `TRIVY_SEVERITIES`: Scanned severity levels
- `TRIVY_SCAN_CMD`: Trivy scan command
- `VERSION_SCORE_WEIGHTS`: Weights for version comparison

### 🗂️ lib/state.js
**Global State**
- `SILENT_MODE`: Silent mode flag
- `ASSUME_YES`: Auto-confirm flag
- `DRY_RUN`: Dry-run flag
- `CHANGES_TRACKER`: Change tracker
  - `directUpdates`: Direct dependency updates
  - `overrides`: Applied overrides
  - `removed`: Removed overrides
  - `versionChanges`: Version changes

### 🌐 lib/i18n.js
**Internationalization**
- Auto-detects system locale via `LANG` / `LANGUAGE` / `LC_ALL`
- Supports English (`en`) and Spanish (`es`), defaults to English
- `t(key, params)`: Returns translated string with `{{variable}}` interpolation
- Translation files: `locales/en.json`, `locales/es.json`

### 🛠️ lib/utils.js
**General Utilities**
- `run()`: Executes npm commands (dry-run aware)
- `die()`: Terminates with error
- `askUser()`: Interactive prompt (--yes aware)
- `displayChangeSummary()`: Change summary
- `safeExecSync()`: Safe command execution
- `parsePackageVersion()`: Parser for scoped packages

### 📄 lib/package-manager.js
**package.json Management**
- `readPackageJson()`: Reads package.json
- `writePackageJson()`: Writes package.json (dry-run aware)
- `removeOverridesForPackages()`: Removes overrides
- `updateDirectDepsToMatchOverrides()`: Syncs dependencies with overrides

### 🔢 lib/version-utils.js
**Version Handling**
- `parseVersion()`: Semantic version parser
- `compareVersions()`: Version comparator
- `calculateVersionDistance()`: Calculates distance between versions
- `chooseClosestVersion()`: Chooses closest version (patch > minor > major)
- `stripVersionPrefix()`: Removes ^, ~, etc.
- `getLatestVersionFromNpm()`: Gets latest version from npm
- `findLatestMinorVersion()`: Finds latest compatible minor version

### 🔍 lib/dependency-analyzer.js
**Dependency Analysis**
- `getCurrentVersions()`: Reads versions from package-lock.json
- `isDirectDependency()`: Checks if package is a direct dependency
- `hasMultipleVersions()`: Detects multiple installed versions

### 🛡️ lib/trivy.js
**Trivy Integration**
- `checkTrivyInstalled()`: Checks Trivy installation
- `runTrivyScan()`: Runs CVE scan
- `extractTrivyVulnerabilities()`: Extracts vulnerabilities and groups by severity

### 📦 lib/package-processor.js
**Package Processing**
- `uninstallPackages()`: Uninstalls packages
- `runAuditFix()`: Runs npm audit fix
- `installPackages()`: Installs packages

### ⌨️ lib/cli-parser.js
**CLI Parser**
- `parseArguments()`: Flag parser
- `parsePackagePatterns()`: Pattern parser (regex support)
- `matchPackages()`: Matches packages against patterns

### 🔒 lib/vulnerability-fixer.js
**Vulnerability Fixing**
- `applyOverridesAfterUserConfirmation()`: Applies overrides with confirmation
- `processVulnerabilities()`: Processes found vulnerabilities

### 📊 lib/version-manager.js
**Version Management**
- `replaceWithExactVersions()`: --replace-exact mode
- `updateToMinorVersions()`: --up-minor mode
- `updateToMajorVersions()`: --up-major mode

### ⚙️ lib/modes.js
**Execution Modes**
- `runTrivyMode()`: --trivy mode (CVE scan and fix)
- `runNormalMode()`: Normal mode (reinstall)
- `runCleanMode()`: --clean mode (remove unused deps)
- `runAuditMode()`: --audit mode (read-only report)
- `processSecondTrivyScan()`: Post-install second scan

## 🔄 Execution Flow

```
auditer.js (CLI)
    ↓
parseArguments() [cli-parser]
    ↓
readPackageJson() [package-manager]
    ↓
┌─────────────────┬─────────────────┬─────────────────┐
│  Version Mgmt   │   Trivy Mode    │   Normal Mode   │
│  [version-mgr]  │   [modes]       │   [modes]       │
└─────────────────┴─────────────────┴─────────────────┘
    ↓                   ↓                   ↓
displayChangeSummary() [utils]
```

## ✅ Advantages of Modularization

1. **Maintainability**: Code organized into clear responsibilities
2. **Testability**: Each module can be tested independently
3. **Reusability**: Functions reusable across different contexts
4. **Readability**: Small files (~50-200 lines each)
5. **Scalability**: Easy to add new features

## 🚀 Usage

Usage is identical to the previous version:

```bash
# Normal mode
auditer

# Trivy mode
auditer --trivy

# Version management
auditer --replace-exact
auditer --up-minor
auditer --up-major

# Specific packages
auditer express lodash
auditer --replace-exact /^@babel/
```

## 📝 Notes

- The `bin/auditer-backup.js` file contains the original monolithic version
- All modules use `module.exports` to export functions
- Global state is managed through `lib/state.js`
- i18n is auto-initialized on module load via `lib/i18n.js`
- Syntax has been validated across all modules
