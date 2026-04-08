# Auditer 🔍

CLI inteligente para auditar y corregir vulnerabilidades en proyectos Node.js usando Trivy y npm audit.

## Características ✨

- 🔍 **Análisis con Trivy**: Detecta CVEs (LOW, MEDIUM, HIGH, CRITICAL) en dependencias
- 🎯 **Selección inteligente de versiones**: Prioriza actualizaciones menores (patch > minor > major)
- 📦 **Actualización de dependencias directas**: Reinstala con versiones parcheadas
- 📝 **Overrides para subdependencias**: Aplica parches a dependencias transitivas
- ⚠️ **Confirmación interactiva**: Pregunta antes de aplicar overrides que puedan romper código
- 🎯 **Modo --exact**: Instala versiones exactas sin `^`
- 🔬 **Modo --trivy**: Solo análisis y corrección de CVEs (sin tocar otros paquetes)
- 🔇 **Modo --silent**: Suprime salida de npm para output limpio
- � **Gestión de versiones**: --replace-exact, --up-minor, --up-major
- 📊 **Resumen automático**: Muestra reporte conciso de todos los cambios realizados
- 🗂️ **Arquitectura modular**: Código organizado en módulos independientes y testeables

## Instalación 📥

```bash
# Desde el directorio del proyecto
npm install -g .

# O durante desarrollo
npm link
```

## Prerequisitos

Para el análisis completo de CVEs, instala Trivy:

```bash
# macOS
brew install trivy

# Linux (Debian/Ubuntu)
sudo apt-get install trivy

# O con script universal
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
```

## Uso 🚀

### Modo básico: Procesar librerías específicas

```bash
# Librerías explícitas
auditer react lodash

# Con regex (expresiones entre /)
auditer '/^@babel/' '/^eslint-/'

# Todas las dependencias
auditer

# Con versiones exactas (sin ^)
auditer --exact react webpack
```

### Modo Trivy: Solo análisis de vulnerabilidades

```bash
# Analiza con Trivy y corrige solo paquetes vulnerables
auditer --trivy

# Con versiones exactas
auditer --trivy --exact
```

### Gestión de versiones

```bash
# Reemplazar versiones con formato exacto (quitar ^, ~)
auditer --replace-exact
auditer --replace-exact express lodash  # Solo paquetes específicos
auditer --replace-exact '/^@babel/'     # Con regex

# Actualizar a últimas versiones minor compatibles (mantiene major)
auditer --up-minor
auditer --up-minor react webpack        # Solo paquetes específicos

# Actualizar a últimas versiones major (⚠️ breaking changes)
auditer --up-major
auditer --up-major lodash moment        # Solo paquetes específicos
```

## Flujos de trabajo 🔄

### Modo normal (`auditer <paquetes>`)

1. Desinstala los paquetes especificados
2. Ejecuta `npm audit fix`
3. Reinstala los paquetes
4. Escanea con Trivy
5. Actualiza dependencias directas vulnerables
6. Propone overrides para subdependencias (con confirmación)
7. Verifica resultado final

### Modo Trivy (`auditer --trivy`)

1. Escanea con Trivy primero
2. Identifica paquetes vulnerables (directos y transitivos)
3. Desinstala/reinstala solo dependencias directas vulnerables con versiones parcheadas
4. Ejecuta `npm audit fix`
5. Propone overrides solo para subdependencias (con confirmación)
6. Verifica resultado final

## Flags disponibles 🎛️

### Modos de ejecución
- `--trivy`: Modo análisis: solo procesa paquetes con CVEs detectados por Trivy
- `--silent`: Suprime la salida de npm, muestra solo mensajes del script

### Instalación
- `--exact`: Instala versiones exactas sin el prefijo `^`

### Gestión de versiones
- `--replace-exact`: Reemplaza versiones ^x.x.x por x.x.x (sin modificar package-lock)
- `--up-minor`: Actualiza a la última versión minor compatible (mantiene major)
- `--up-major`: Actualiza a la última versión disponible (⚠️ puede romper código)

## Ejemplos 💡

```bash
# Actualizar React y todas sus dependencias
auditer react

# Procesar todos los paquetes de Babel
auditer '/^@babel/'

# Análisis de seguridad completo
auditer --trivy

# Reinstalar todo con versiones exactas
auditer --exact

# Análisis de seguridad + versiones exactas
auditer --trivy --exact

# Modo silencioso (sin output de npm)
auditer --silent --trivy

# Combinando todos los flags
auditer --trivy --exact --silent
```

## Overrides 📝

Los overrides se usan **solo para subdependencias** (dependencias transitivas que no están en tu `package.json`).
Para verificar si un paquete es subdependencia:

```bash
npm list <nombre-paquete>
```

El CLI te pedirá confirmación antes de aplicar overrides ya que pueden causar incompatibilidades.

## Resumen de cambios 📊

Al finalizar, Auditer mostrará un resumen conciso de todos los cambios realizados:

```
============================================================
📊 RESUMEN DE CAMBIOS
============================================================

✅ Dependencias actualizadas:
   lodash: 4.17.21 → 4.18.0 [prod]
   webpack: 5.88.0 → 5.95.0 [dev]

📝 Overrides aplicados (subdependencias):
   micromatch: 4.0.5 → 4.0.8
   ws: 8.17.0 → 8.18.0

🗑️  Overrides removidos:
   old-package

============================================================
```

Este resumen te permite ver de un vistazo todos los cambios de versión realizados.

## Notas importantes ⚠️

- Ejecuta siempre desde la raíz del proyecto (donde está `package.json`)
- Las dependencias directas se actualizan en `package.json`
- Las subdependencias se parchean vía campo `overrides`
- Prueba tu aplicación después de aplicar overrides
- Sin Trivy instalado, solo usará `npm audit`

## Arquitectura 🏗️

El proyecto está organizado en módulos independientes para mejor mantenibilidad:

```
auditer/
├── bin/
│   └── auditer.js              # Entry point (~110 líneas)
└── lib/
    ├── constants.js            # Constantes del proyecto
    ├── state.js                # Estado global
    ├── utils.js                # Funciones utilitarias
    ├── package-manager.js      # Operaciones con package.json
    ├── version-utils.js        # Comparación de versiones
    ├── dependency-analyzer.js  # Análisis de dependencias
    ├── trivy.js                # Integración con Trivy
    ├── package-processor.js    # Instalación/desinstalación
    ├── cli-parser.js           # Parser de argumentos CLI
    ├── vulnerability-fixer.js  # Corrección de vulnerabilidades
    ├── version-manager.js      # Gestión de versiones
    └── modes.js                # Modos de ejecución
```

Ver [ARCHITECTURE.md](./ARCHITECTURE.md) para detalles completos de la arquitectura.

### Ventajas de la modularización

- ✅ **Código organizado**: Cada módulo tiene responsabilidades claras
- ✅ **Fácil de testear**: Módulos independientes y testeables
- ✅ **Reutilizable**: Funciones compartidas entre diferentes modos
- ✅ **Mantenible**: Archivos pequeños (~50-200 líneas cada uno)
- ✅ **Escalable**: Fácil agregar nuevas funcionalidades