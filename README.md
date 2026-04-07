# fix-libs

Utilitario CLI: desinstala librerías, ejecuta `npm audit fix` y las reinstala (preservando dev/prod según package.json).

## Instalación (global)

Desde la raíz del proyecto local:

```bash
npm install -g .
# o (durante desarrollo)
npm link
```

## Uso


Ejecuta pasando las librerías separadas por espacios o expresiones regulares (delimitadas por `/`):

```bash
# nombres explícitos
fix-libs lodash jest

# regex (cotizar en el shell si contienen caracteres especiales)
fix-libs '/^@babel/' '/^eslint-/'
```

El script revisa `package.json` en el directorio actual para determinar si cada librería estaba en `dependencies` o `devDependencies`. Las desinstala, ejecuta `npm audit fix`, y las vuelve a instalar usando `--save-dev` cuando corresponde.

## Notas

Ejecuta el comando desde la raíz de tu proyecto (donde está `package.json`).
Si una librería no aparece en `package.json`, será tratada como dependencia de producción.