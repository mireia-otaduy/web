# LCC Manufacturing · Sitio web corporativo

Sitio web estático, **multilingüe (español · inglés · chino simplificado)**, pensado para publicarse en
**Firebase Hosting**, con formulario de presupuesto conectado a **Firestore** y sin cookies ni rastreadores.

- Español en la raíz (`/`), inglés en `/en/`, chino en `/zh/`. Selector de idioma en la cabecera.
- Funciona sin JavaScript; con JavaScript añade animaciones (aparición de texto e imágenes, contadores,
  sección fija con desplazamiento lateral, visor de imágenes…). Respeta «reducir movimiento».
- Accesibilidad verificada con axe-core (0 violaciones), HTML validado, Lighthouse 100 en
  Accesibilidad, Buenas prácticas y SEO.

---

## 1. Estructura

```
src/                       ← LO QUE SE EDITA
  site.json                  datos de la empresa, idiomas, páginas y configuración de Firebase
  i18n/es|en|zh/*.json       todos los textos, un archivo por bloque (home.json, tech.json…)
  templates/                 HTML: layout.html, pages/*.html y partials/*.html
  css/                       00-09 comunes · 10-14 una hoja por página (todo comentado)
  js/                        módulos pequeños (reveal, scroll, carril, visor, formulario…)
  img/ · fonts/ · icons/     imágenes (+WebP), tipografías autoalojadas e iconos SVG
  static/                    favicon, iconos del manifiesto
tools/                     ← HERRAMIENTAS (Node, sin dependencias salvo esbuild opcional)
  build.mjs                  genera /public a partir de /src
  check.mjs                  verificador: enlaces, anclas, IDs, alts, CSP, hreflang, JSON-LD…
  serve.mjs                  servidor local con las mismas cabeceras que Firebase
  make-assets.mjs            regenera favicon, iconos e imágenes para redes (opcional)
  optimize-images.py         genera los .webp (opcional)
public/                    ← RESULTADO (lo que se publica; se genera con el build)
firebase.json              cabeceras de seguridad, caché y CSP
firestore.rules            reglas de la base de datos de solicitudes
functions/                 aviso por correo de nuevas solicitudes (opcional)
```

> **Nunca edites `public/` a mano**: se regenera con cada build. Edita `src/` y compila.
> `public/` se incluye en el repositorio para que se pueda publicar sin instalar nada.

## 2. Comandos

```bash
npm install        # solo la primera vez: instala esbuild (minifica CSS y JS; es opcional)
npm run build      # genera /public
npm run check      # verifica el resultado (debe terminar en ✔)
npm run test       # build + check
npm run dev        # build + vista previa en http://localhost:5000 que recompila al guardar
npm run serve      # solo la vista previa
```

Requisitos: Node 20 o superior. Sin `npm install` el sitio también se genera (solo que sin minificar).

## 3. Cómo cambiar cosas

| Quiero cambiar…                         | Dónde                                                               |
|-----------------------------------------|---------------------------------------------------------------------|
| Dirección, teléfono, email, CIF, dominio | `src/site.json`                                                     |
| Un texto de la web                      | `src/i18n/es/…json` **y** su equivalente en `en/` y `zh/`           |
| Una cifra (prensas, tornos…)            | `src/i18n/*/tech.json` y `home.json` (las tres lenguas)             |
| Colores, tipografías, medidas           | `src/css/01-tokens.css`                                             |
| Estructura de una página                | `src/templates/pages/<página>.html`                                 |
| Cabecera / pie                          | `src/templates/partials/header.html` / `footer.html`                |
| Logotipos de clientes                   | `src/img/cliente-NN.*` + `clients` en `src/site.json`               |

**Si falta una traducción en cualquier idioma, el build falla** y te dice qué clave falta.
Después de cambiar la marca o el eslogan se pueden regenerar los iconos y las imágenes para redes con
`node tools/make-assets.mjs` (necesita Playwright). Al añadir fotos, `python3 tools/optimize-images.py`
crea sus versiones WebP.

### Añadir un idioma

1. Copia `src/i18n/es/` a `src/i18n/<código>/` y traduce los archivos.
2. Añade el idioma en `languages` de `src/site.json` y su nombre de archivo en cada página de `pages`.
3. Añade su eslogan en `tools/make-assets.mjs` y ejecútalo (imagen para redes).
4. `npm run test`.

## 4. Publicar en Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase use lcc-manufacturing        # o el ID real del proyecto (ver .firebaserc)
npm run deploy                        # build + check + firebase deploy (hosting y reglas)
```

- El dominio provisional `lcc-manufacturing.web.app` ya está en `src/site.json` (`url`). **Cuando se conecte
  el dominio definitivo, cámbialo ahí** y vuelve a compilar: se actualizan canónicas, hreflang, sitemap y
  datos estructurados.
- Las cabeceras (CSP, HSTS-compatible, `nosniff`, `Referrer-Policy`…) y la caché están en `firebase.json`.
  El build mantiene sincronizado el hash de la CSP; `npm run check` avisa si no coincide.
- ⚠️ **China continental**: Firebase/Google puede ser lento o inaccesible desde allí. Si la web china es
  importante, considera un CDN con presencia en China. El formulario ya tiene el correo como alternativa.

## 5. Base de datos de solicitudes (Firestore)

El formulario de `contacto.html` guarda cada solicitud en la colección **`solicitudes`** mediante la API REST
de Firestore (sin SDK, sin cookies). Hasta que se configure, el formulario **abre el correo del usuario con
la solicitud preparada**, así que nunca falla en silencio.

**Puesta en marcha (una sola vez):**

1. [Consola de Firebase](https://console.firebase.google.com) → **Firestore Database → Crear base de datos →
   modo producción** y ubicación **`eur3` (Europa)**. *La política de privacidad afirma que los datos
   se guardan en la UE: si eliges otra región, corrige ese texto.*
2. **Configuración del proyecto → Tus apps → Web** (crea una app web si no existe) y copia la `apiKey`.
3. Pégala en `src/site.json` → `firebase.apiKey` (y revisa `projectId`). La clave web de Firebase **no es
   un secreto**, pero conviene restringirla: *Google Cloud Console → APIs y servicios → Credenciales →
   la clave → Restricciones de aplicación → Referentes HTTP* (`https://lcc-manufacturing.web.app/*` y el
   dominio definitivo) y *Restricciones de API → Cloud Firestore API*.
4. `npm run deploy` (publica también `firestore.rules`).
5. Las solicitudes aparecen en la consola: **Firestore → solicitudes**.

**Qué garantizan las reglas (`firestore.rules`)**: cualquiera puede *crear* una solicitud, pero solo con los
campos y formatos esperados (longitudes, tipos, fecha reciente); **nadie puede leer, modificar ni borrar**
desde un navegador. El honeypot y el tiempo mínimo del formulario frenan a los robots simples.

**Recomendado**: activar **Firebase App Check** (reCAPTCHA) o enviar el formulario a una Cloud Function
con límite de peticiones, porque con reglas no se puede limitar la frecuencia. Para atender los derechos del
RGPD, borra las solicitudes antiguas desde la consola (o con una política TTL).

> Las reglas no se han podido ejecutar contra el emulador de Firebase en el entorno de desarrollo (sin
> acceso a Google). Pruébalas con `firebase emulators:start` o con el *Rules Playground* de la consola.

### Avisos por correo (opcional)

Firestore no envía correos por sí solo. En `functions/` hay una función lista para avisar a la empresa de cada
nueva solicitud (requiere el **plan Blaze** y una cuenta SMTP):

```bash
cd functions && npm install && npm test          # el test del mensaje debe pasar
```

Añade a `firebase.json` el bloque `"functions": [{ "source": "functions", "codebase": "default" }]`, ajusta
`region` en `functions/index.js` a la ubicación de tu Firestore y despliega con
`firebase deploy --only functions` (te pedirá `SMTP_HOST`, `SMTP_USER`, `MAIL_TO` y el secreto `SMTP_PASS`).
*Esta función no se ha podido desplegar ni probar contra Firebase real; el generador del mensaje sí tiene test.*

## 6. Privacidad y legalidad

- La web **no usa cookies, analítica ni almacenamiento local**, por lo que no necesita banner de cookies. Si se
  añade analítica en el futuro, hay que pedir consentimiento y actualizar `src/i18n/*/privacy.json`.
- Incluye **Aviso legal** y **Política de privacidad y cookies** en los tres idiomas (LSSI-CE, RGPD, LOPDGDD).
  Son textos base: **deben revisarlos la empresa o su asesor legal**.
- Las tipografías son locales (no se llama a Google Fonts) y el mapa es un enlace, no un iframe.

## 7. Pendiente de confirmar por la empresa

| Tema | Detalle |
|------|---------|
| **CIF y datos registrales** | El CIF `B95517835` consta en el registro público LEI y su dígito de control es válido, pero confírmalo. Faltan los datos del Registro Mercantil (`legal.registry` en `src/site.json`): si se rellenan, aparecen en el Aviso legal. |
| **Sectores** | La web publicada de la empresa lista 6 sectores; esta incluye además *Agricultura* y *Sanitario*. Confirma que se atienden. |
| **Cifras de maquinaria** | 18 prensas, 14 tornos CNC, 8 de corte por hilo, etc. provienen de los textos entregados y no se han podido contrastar de forma independiente. |
| **«Corte por hilo»** | Se ha traducido como *wire EDM cutting* (inglés) y 线切割 (chino), que es lo habitual en la industria. Confirma que la máquina es de electroerosión por hilo y no de otro tipo de corte. |
| **«Dinascopio»** | Término de metrología del texto original que no se ha podido identificar; está en la versión española y se omite en inglés y chino. Confírmalo o corrígelo. |
| **Logotipos de clientes** | Confirma que hay permiso para mostrarlos. |
| **Fotografías** | Se han eliminado los metadatos EXIF. Las fotos de planta son de baja resolución (700 px). |
| **Traducciones** | Revisión por hablantes nativos (sobre todo el chino, y la terminología industrial). |
| **Ayudas públicas** | Si la web se financió con ayudas (p. ej. NextGenerationEU / Kit Digital), puede exigirse mostrar su logotipo. |
| **Dominio** | Cambiar `url` en `src/site.json` al dominio definitivo y, si procede, conectar un dominio propio en Firebase. |

## 8. Qué se ha verificado

`npm run check` + pruebas en Chromium sobre las 19 páginas (3 idiomas × 6 páginas + 404), en escritorio y
móvil: 0 errores de consola, 0 peticiones fallidas, sin desbordamiento horizontal desde 320 px hasta 1920 px,
axe-core sin violaciones (con y sin animaciones), HTML válido (html-validate), formulario completo (validación,
envío a Firestore simulado, fallo de red, antispam), selector de idioma, menú móvil, filtros, pasos, visor de
imágenes, modo sin JavaScript, JavaScript bloqueado y «reducir movimiento».

**Lo que NO se ha podido comprobar** (el entorno de desarrollo solo dispone de Chromium y no tiene acceso a Google):
Firefox y Safari (el código usa funciones estándar —`:has()`, `<dialog>`, `popover`, `Intl.Segmenter`— compatibles
con navegadores actuales, pero conviene probar la web en ellos antes de publicar), el despliegue real en Firebase
Hosting, las reglas de Firestore contra el emulador y la Cloud Function de avisos. Pasa por esas pruebas antes de
dar la web por cerrada.

## 9. Licencias de terceros

- Tipografías **Inter** y **Space Grotesk** — SIL Open Font License 1.1 (`src/fonts/LICENSE-*.txt`).
- Iconos **Lucide** — ISC (`src/icons/LICENSE-lucide.txt`).
- Fotografías y logotipos: propiedad de LCC Manufacturing S.L. y de sus respectivos titulares.
