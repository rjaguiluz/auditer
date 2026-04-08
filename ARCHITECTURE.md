# Estructura del Proyecto Auditer

## 📁 Organización Modular

El código está organizado en módulos independientes para mejor mantenibilidad:

```
auditer/
├── bin/
│   ├── auditer.js            # Entry point principal (CLI)
│   └── auditer-backup.js     # Backup de la versión monolítica original
│
└── lib/
    ├── constants.js          # Constantes del proyecto
    ├── state.js              # Estado global (silent mode, change tracker)
    ├── utils.js              # Funciones utilitarias generales
    ├── package-manager.js    # Operaciones con package.json
    ├── version-utils.js      # Comparación y manejo de versiones
    ├── dependency-analyzer.js # Análisis de dependencias (npm list)
    ├── trivy.js              # Integración con Trivy
    ├── package-processor.js  # Instalación/desinstalación de paquetes
    ├── cli-parser.js         # Parser de argumentos CLI
    ├── vulnerability-fixer.js # Corrección de vulnerabilidades
    ├── version-manager.js    # Gestión de versiones (--replace-exact, --up-minor, --up-major)
    └── modes.js              # Modos de ejecución (trivy, normal)
```

## 📦 Módulos

### 🔧 bin/auditer.js
**Entry Point Principal**
- Punto de entrada de la aplicación
- Orquesta la ejecución según los argumentos
- ~110 líneas (antes: ~1179 líneas)

### 📌 lib/constants.js
**Constantes del Proyecto**
- `TRIVY_SEVERITIES`: Niveles de severidad escaneados
- `TRIVY_SCAN_CMD`: Comando de escaneo Trivy
- `VERSION_SCORE_WEIGHTS`: Pesos para comparación de versiones

### 🗂️ lib/state.js
**Estado Global**
- `SILENT_MODE`: Flag de modo silencioso
- `CHANGES_TRACKER`: Rastreador de cambios
  - `directUpdates`: Actualizaciones de dependencias directas
  - `overrides`: Overrides aplicados
  - `removed`: Overrides removidos
  - `versionChanges`: Cambios de versión

### 🛠️ lib/utils.js
**Utilidades Generales**
- `run()`: Ejecuta comandos npm
- `die()`: Termina con error
- `askUser()`: Pregunta interactiva
- `displayChangeSummary()`: Resumen de cambios
- `safeExecSync()`: Ejecución segura de comandos
- `parsePackageVersion()`: Parser de paquetes con scope

### 📄 lib/package-manager.js
**Gestión de package.json**
- `readPackageJson()`: Lee package.json
- `writePackageJson()`: Escribe package.json
- `removeOverridesForPackages()`: Remueve overrides
- `updateDirectDepsToMatchOverrides()`: Sincroniza dependencias con overrides

### 🔢 lib/version-utils.js
**Manejo de Versiones**
- `parseVersion()`: Parser de versiones semánticas
- `compareVersions()`: Comparador de versiones
- `calculateVersionDistance()`: Calcula distancia entre versiones
- `chooseClosestVersion()`: Elige versión más cercana
- `stripVersionPrefix()`: Remueve ^, ~, etc.
- `getLatestVersionFromNpm()`: Obtiene última versión de npm
- `findLatestMinorVersion()`: Busca última versión minor compatible

### 🔍 lib/dependency-analyzer.js
**Análisis de Dependencias**
- `getCurrentVersions()`: Lee versiones de package-lock.json
- `isDirectDependency()`: Verifica si es dependencia directa
- `hasMultipleVersions()`: Detecta múltiples versiones

### 🛡️ lib/trivy.js
**Integración con Trivy**
- `checkTrivyInstalled()`: Verifica instalación de Trivy
- `runTrivyScan()`: Ejecuta escaneo de CVEs
- `extractTrivyVulnerabilities()`: Extrae vulnerabilidades y agrupa por severidad

### 📦 lib/package-processor.js
**Procesamiento de Paquetes**
- `uninstallPackages()`: Desinstala paquetes
- `runAuditFix()`: Ejecuta npm audit fix
- `installPackages()`: Instala paquetes

### ⌨️ lib/cli-parser.js
**Parser de CLI**
- `parseArguments()`: Parser de flags
- `parsePackagePatterns()`: Parser de patrones (regex)
- `matchPackages()`: Match de paquetes con patrones

### 🔒 lib/vulnerability-fixer.js
**Corrección de Vulnerabilidades**
- `applyOverridesAfterUserConfirmation()`: Aplica overrides con confirmación
- `processVulnerabilities()`: Procesa vulnerabilidades encontradas

### 📊 lib/version-manager.js
**Gestión de Versiones**
- `replaceWithExactVersions()`: Modo --replace-exact
- `updateToMinorVersions()`: Modo --up-minor
- `updateToMajorVersions()`: Modo --up-major

### ⚙️ lib/modes.js
**Modos de Ejecución**
- `runTrivyMode()`: Modo --trivy (escaneo de CVEs)
- `processSecondTrivyScan()`: Segundo escaneo post-instalación
- `runNormalMode()`: Modo normal (reinstalación)

## 🔄 Flujo de Ejecución

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

## ✅ Ventajas de la Modularización

1. **Mantenibilidad**: Código organizado en responsabilidades claras
2. **Testability**: Cada módulo puede probarse independientemente
3. **Reusabilidad**: Funciones reutilizables en diferentes contextos
4. **Legibilidad**: Archivos pequeños (~50-200 líneas cada uno)
5. **Escalabilidad**: Fácil agregar nuevas funcionalidades

## 🚀 Uso

El uso es idéntico a la versión anterior:

```bash
# Modo normal
auditer

# Modo Trivy
auditer --trivy

# Gestión de versiones
auditer --replace-exact
auditer --up-minor
auditer --up-major

# Paquetes específicos
auditer express lodash
auditer --replace-exact /^@babel/
```

## 📝 Notas

- El archivo `bin/auditer-backup.js` contiene la versión monolítica original
- Todos los módulos usan `module.exports` para exportar funciones
- El estado global se maneja a través de `lib/state.js`
- La sintaxis ha sido validada en todos los módulos
