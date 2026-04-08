# Auditer 🔍

Smart CLI to audit and fix vulnerabilities in Node.js projects using Trivy and npm audit.

## Features ✨

- 🔍 **Trivy Analysis**: Detects CVEs (LOW, MEDIUM, HIGH, CRITICAL) in dependencies
- 📋 **--audit mode**: Lists vulnerabilities without modifying anything (read-only with dependency tree)
- 🎯 **Smart version selection**: Prioritizes minor updates (patch > minor > major)
- 📦 **Direct dependency updates**: Reinstalls with patched versions
- 📝 **Overrides for sub-dependencies**: Applies patches to transitive dependencies
- ⚠️ **Interactive confirmation**: Asks before applying overrides that may break code
- 🎯 **--exact mode**: Installs exact versions without `^`
- 🔬 **--trivy mode**: Only CVE analysis and fixes (leaves other packages untouched)
- 🧹 **--clean mode**: Detects and removes unused dependencies
- 🔇 **--silent mode**: Suppresses npm output for cleaner logs
- ♻️ **Monorepo Support**: Use `--recursive` (`-r`) to automatically audit all nested workspaces
- 🐕 **Gatekeeper Mode**: Use `--husky` in your Git hooks to STRICTLY prevent vulnerable commits
- 🔧 **Version management**: --replace-exact, --up-minor, --up-major
- 📊 **Auto summary**: Shows a concise report of all changes made
- 🗂️ **Modular architecture**: Code organized in independent, testable modules
- 🌐 **i18n support**: Output in English or Spanish based on system locale

## Installation 📥

```bash
npm install -g @rjaguiluz/auditer
```

> **Note**: Even though the package is installed as `@rjaguiluz/auditer`, the executable command exposed to your terminal is just **`auditer`**.

## Prerequisites

For full CVE analysis, install Trivy:

```bash
# macOS
brew install trivy

# Linux (Debian/Ubuntu)
sudo apt-get install trivy

# Or with the universal script
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
```

## Usage 🚀

### Basic mode: Process specific libraries

```bash
# Explicit libraries
auditer react lodash

# With regex (expressions between /)
auditer '/^@babel/' '/^eslint-/'

# All dependencies
auditer

# With exact versions (no ^)
auditer --exact react webpack
```

### Trivy mode: Only vulnerability analysis

```bash
# Analyze with Trivy and fix only vulnerable packages
auditer --trivy

# With exact versions
auditer --trivy --exact
```

### Version management

```bash
# Replace versions with exact format (remove ^, ~)
auditer --replace-exact
auditer --replace-exact express lodash  # Specific packages only
auditer --replace-exact '/^@babel/'     # With regex

# Update to latest compatible minor versions (keeps major)
auditer --up-minor
auditer --up-minor react webpack        # Specific packages only

# Update to latest major versions (⚠️ breaking changes)
auditer --up-major
auditer --up-major lodash moment        # Specific packages only
```

### Cleaning unused dependencies

```bash
# Detect and remove unused dependencies (production only)
auditer --clean

# Also include devDependencies in analysis (⚠️ may have false positives)
auditer --clean --include-dev
```

The `--clean` mode:
- Recursively scans all project files (`.js`, `.jsx`, `.ts`, `.tsx`)
- Detects which packages are actually imported or required
- **By default only analyzes production `dependencies`**
- **Excludes `devDependencies`** (typescript, jest, eslint, etc. are not directly imported)
- **Automatically excludes `@types/*` packages** (they are type-only, not runtime code)
- Lists unused dependencies
- Asks before removing them

**Use `--include-dev` with caution**: devDependencies include CLI tools (typescript, jest, eslint) that are not imported in code but are used in package.json scripts and config files. Static analysis may produce false positives.

**Note**: This is static analysis and may have false positives if you use complex dynamic imports or dependencies only used in configuration.

## Workflows 🔄

### Normal mode (`auditer <packages>`)

1. Uninstalls the specified packages
2. Runs `npm audit fix`
3. Reinstalls the packages
4. Scans with Trivy
5. Updates vulnerable direct dependencies
6. Proposes overrides for sub-dependencies (with confirmation)
7. Verifies final result

### Trivy mode (`auditer --trivy`)

1. Scans with Trivy first
2. Identifies vulnerable packages (direct and transitive)
3. Uninstalls/reinstalls only vulnerable direct dependencies with patched versions
4. Runs `npm audit fix`
5. Proposes overrides for sub-dependencies only (with confirmation)
6. Verifies final result

### Audit mode (`auditer --audit`)

1. Scans with Trivy (read-only)
2. Lists each vulnerable package with its information
3. Shows dependency tree with `npm list`
4. Groups vulnerabilities by severity (CRITICAL, HIGH, MEDIUM, LOW)
5. Shows summary with counters
6. **Does not modify anything** — ideal for reports and inspection

### Clean mode (`auditer --clean`)

1. Recursively scans all project files
2. Detects imports/requires in source code
3. Compares with dependencies in package.json (devDependencies excluded by default)
4. Lists unused packages (excluding @types/*)
5. Asks if you want to remove them
6. Uninstalls confirmed packages

**Note**: By default only analyzes production `dependencies`. `devDependencies` (typescript, jest, eslint, prettier, etc.) are excluded because they are CLI tools that are not directly imported. Use `--include-dev` if you want to include them (may produce false positives).

## Available flags 🎛️

### Execution modes
- `--audit`: Audit mode: lists vulnerabilities without modifying (read-only with dependency tree)
- `--trivy`: Analysis mode: only processes packages with CVEs detected by Trivy
- `--clean`: Clean mode: detects and removes unused production dependencies
- `--include-dev`: Includes devDependencies in the --clean analysis (⚠️ may have false positives)
- `--recursive` / `-r`: Scans the entire project tree detecting nested `package.json` workspaces
- `--husky`: Strict gatekeeper mode for CI/CD or Git hooks. Aborts (Exit 1) if vulnerabilities are found
- `--dry-run`: Simulation mode: shows what changes would be made without executing them (safe preview)
- `--silent`: Suppresses npm output, shows only script messages
- `--yes` / `-y` / `--force`: No confirmations, assumes "yes" to all (useful for CI/CD)
- `--version` / `-v`: Prints the current installed version of Auditer

### Installation
- `--exact`: Installs exact versions without the `^` prefix

### Version management
- `--replace-exact`: Replaces ^x.x.x versions with x.x.x (without modifying package-lock)
- `--up-minor`: Updates to the latest compatible minor version (keeps major)
- `--up-major`: Updates to the latest available version (⚠️ may break code)

## Examples 💡

```bash
# Update React and all its dependencies
auditer react

# Process all Babel packages
auditer '/^@babel/'

# 📋 Vulnerability audit (read-only - does not modify anything)
auditer --audit

# Full security analysis
auditer --trivy

# 🎭 See what the security analysis would do WITHOUT executing it (safe preview)
auditer --trivy --dry-run

# Clean unused dependencies
auditer --clean

# 🎭 See what dependencies would be removed without deleting them
auditer --clean --dry-run

# Clean including devDependencies (⚠️ beware of false positives)
auditer --clean --include-dev

# Non-interactive mode
auditer --clean --yes

# Reinstall everything with exact versions
auditer --exact

# Security analysis + exact versions
auditer --trivy --exact

# Silent mode (no npm output)
auditer --silent --trivy

# Non-interactive mode (no confirmations) - useful for CI/CD
auditer --trivy --yes
auditer --trivy -y --silent
auditer --clean --yes  # Remove dependencies without confirmation

# 🎭 See what major updates would be made (breaking changes) without executing them
auditer --up-major --dry-run

# 🎭 Preview analysis in silent mode
auditer --trivy --silent --dry-run

# Update package family without confirmations
auditer '/^@nestjs/' --yes

# 🎭 CI/CD: Check vulnerabilities without fixing them (for reports)
auditer --trivy --dry-run || echo "⚠️ Vulnerabilities detected"

# 📦 Scan an entire monorepo automatically navigating to sub-packages
auditer -r --trivy --silent

# 🐕 Use in Git pre-commit hook or CI pipeline to reject problematic code
auditer --husky

# Combining all flags
auditer --trivy --exact --silent --yes
```

### --audit use cases

**1. Security report without changes:**
```bash
# Generate vulnerability report for a meeting
auditer --audit > security-report.txt
```

**2. Inspect before fixing:**
```bash
# See the extent of the problem before running fixes
auditer --audit
# Then: auditer --trivy
```

**3. CI/CD - Security reports:**
```bash
# In pipeline: check vulnerabilities and save report
auditer --audit || true  # Does not fail the build, only reports
```

**4. Dependency debugging:**
```bash
# See full dependency tree for vulnerable packages
auditer --audit | grep -A 10 "path-to-regexp"
```

### --dry-run use cases

**1. Explore a new project:**
```bash
cd new-project
auditer --trivy --dry-run
# See what vulnerabilities it has without touching anything
```

**2. Compare strategies:**
```bash
auditer --up-minor --dry-run > minor-changes.txt
auditer --up-major --dry-run > major-changes.txt
# Compare files and decide
```

**3. CI/CD validation:**
```bash
# Fail build if there are HIGH/CRITICAL vulnerabilities
auditer --trivy --dry-run
```

## Overrides 📝

Overrides are used **only for sub-dependencies** (transitive dependencies not in your `package.json`).
To check if a package is a sub-dependency:

```bash
npm list <package-name>
```

The CLI will ask for confirmation before applying overrides since they can cause incompatibilities.

## Change summary 📊

When finished, Auditer will show a concise summary of all changes made:

```
============================================================
📊 CHANGE SUMMARY
============================================================

✅ Updated dependencies:
   lodash: 4.17.21 → 4.18.0 [prod]
   webpack: 5.88.0 → 5.95.0 [dev]

📝 Applied overrides (subdependencies):
   micromatch: 4.0.5 → 4.0.8
   ws: 8.17.0 → 8.18.0

🗑️  Removed overrides:
   old-package

============================================================
```

This summary lets you see at a glance all version changes made.

## Important notes ⚠️

- Always run from the project root (where `package.json` is)
- Direct dependencies are updated in `package.json`
- Sub-dependencies are patched via the `overrides` field
- Test your application after applying overrides
- Without Trivy installed, only `npm audit` will be used

## Architecture 🏗️

The project is organized in independent modules for better maintainability:

```
auditer/
├── bin/
│   └── auditer.js              # Entry point (~110 lines)
└── lib/
    ├── constants.js            # Project constants
    ├── state.js                # Global state
    ├── utils.js                # Utility functions
    ├── i18n.js                 # Internationalization (EN/ES)
    ├── package-manager.js      # package.json operations
    ├── version-utils.js        # Version comparison
    ├── dependency-analyzer.js  # Dependency analysis
    ├── trivy.js                # Trivy integration
    ├── package-processor.js    # Install/uninstall
    ├── cli-parser.js           # CLI argument parser
    ├── vulnerability-fixer.js  # Vulnerability fixing
    ├── version-manager.js      # Version management
    └── modes.js                # Execution modes
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full architecture details.

### Advantages of modularization

- ✅ **Organized code**: Each module has clear responsibilities
- ✅ **Easy to test**: Independent, testable modules
- ✅ **Reusable**: Shared functions across different modes
- ✅ **Maintainable**: Small files (~50-200 lines each)
- ✅ **Scalable**: Easy to add new features

---

## ❤️ Contributors

Thank you to everyone who has contributed to Auditer!

[![Contributors](https://contrib.rocks/image?repo=rjaguiluz/auditer)](https://github.com/rjaguiluz/auditer/graphs/contributors)

## 💰 Sponsors

Support the development of Auditer!

[![GitHub Sponsors](https://img.shields.io/github/sponsors/rjaguiluz?style=for-the-badge&logo=github-sponsors)](https://github.com/sponsors/rjaguiluz)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/raguiluzm)