# Notas Offline — PWA con IndexedDB, Outbox y Background Sync

Demo PWA en 100% Vanilla JS, sin librerías externas. Toda la asincronía usa `new Promise()`, `.then()`, `.catch()` y `Promise.all()`. No hay `async`/`await` en ningún archivo JS: si apareciera, la entrega quedaría anulada.

## Qué hace la app

- Formulario para crear una nota (título + texto).
- Guarda cada nota en IndexedDB y la muestra en una lista con su estado: `pendiente`, `sincronizado` o `error`.
- Intenta enviar cada nota con POST a `https://jsonplaceholder.typicode.com/posts` (endpoint de demostración).
- Sin red (o si el POST falla), el envío queda en el Outbox en IndexedDB como `pendiente`. La lista del Outbox se puede ver, sincronizar y purgar.
- El Service Worker usa Background Sync (`sync-outbox`) para vaciar el Outbox en segundo plano y avisa a la interfaz con `postMessage`.
- En navegadores sin SyncManager (Safari/iOS), la interfaz usa el evento `online` como alternativa: al recuperar la conexión, sincroniza de inmediato.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Interfaz en español: estado en línea/sin conexión, formulario, lista de notas, lista del Outbox, botones “Sincronizar ahora” y “Purgar Outbox”. Rutas relativas (`./`) para que funcione en GitHub Pages. |
| `db-helper.js` | Tema 5.1. Mini-wrapper con promesas para IndexedDB. Base `pwa-offline-db`, stores `items` y `outbox` (ambos con `keyPath: "id"` y `autoIncrement`). Funciones para añadir, leer, actualizar, borrar y purgar. |
| `app.js` | Tema 5.2. Lógica de la interfaz: guarda la nota, intenta el POST, encola en el Outbox si falla, registra el Service Worker y la sincronización, escucha `postMessage` del Service Worker y el evento `online`. |
| `sw.js` | Tema 5.3. Service Worker: cachea el app shell, atiende el evento `sync` con etiqueta `sync-outbox`, vacía el Outbox con POSTs, marca `sincronizado` al tener éxito, conserva `pendiente` al fallar y comunica el resultado con `postMessage`. |
| `manifest.webmanifest` | Manifiesto PWA con `start_url` y `scope` relativos (`./`). Sin recursos externos. |
| `README.md` | Este archivo. |

## Cómo probarla en local

1. Sirve la carpeta con un servidor local, por ejemplo con Python: `python -m http.server 8000` dentro de la carpeta, y abre `http://127.0.0.1:8000/`.
   - No basta abrir `index.html` con doble clic: el Service Worker y el manifiesto necesitan HTTP.
2. Crea una nota con conexión: debe quedar `sincronizado`.
3. En Chrome DevTools > Network, marca “Offline” (o desactiva el Wi-Fi), crea otra nota: debe quedar `pendiente` y aparecer en el Outbox.
4. Ver los registros en DevTools > Application > IndexedDB > `pwa-offline-db` > `items` y `outbox`.
5. Vuelve a poner “Online”: la interfaz sincroniza sola (evento `online`) o pulsa “Sincronizar ahora”. La nota pendiente debe pasar a `sincronizado` y salir del Outbox.
6. Para probar Background Sync: en DevTools > Application > Service Workers, pulsa “Sync” con la etiqueta `sync-outbox` después de crear una nota sin conexión, o deja que el navegador lo dispare al recuperar la red.

## Publicar en GitHub Pages (lo hace Karol)

1. Crea un repositorio nuevo en GitHub (nombre sugerido: `pwa-indexeddb-outbox-sync`).
2. Sube estos archivos a la rama `main`, en la raíz del repositorio.
3. En GitHub: Settings > Pages > Build and deployment > Source: “Deploy from a branch”, Branch: `main`, carpeta `/ (root)`. Guarda.
4. Espera 1–2 minutos y abre el enlace público, por ejemplo `https://TU-USUARIO.github.io/pwa-indexeddb-outbox-sync/`.
5. Comprueba que la app abre, que se puede crear una nota y que no hay errores 404: todas las rutas son relativas (`./`).
6. Entrega en Classroom los dos enlaces: el de GitHub Pages y el del repositorio.

## Defensa oral de 5 minutos (puntos clave)

- **IndexedDB vs localStorage y Cache API:** IndexedDB guarda objetos estructurados y mucho más volumen, con transacciones; localStorage solo guarda texto y es síncrono; Cache API guarda respuestas HTTP, no datos de la app.
- **`onupgradeneeded`:** se ejecuta al crear la base o al subir de versión; ahí se crean los object stores `items` y `outbox`.
- **Transacciones `readonly` vs `readwrite`:** leer usa `readonly`; guardar, actualizar y borrar usan `readwrite`. Una transacción agrupa operaciones y se cancela completa si algo falla.
- **Patrón Outbox:** en vez de perder el POST sin red, se guarda la intención de envío en IndexedDB como `pendiente` y se reintenta después, sin duplicar ni perder datos.
- **Background Sync + alternativa `online`:** el Service Worker recibe el evento `sync` y vacía el Outbox en segundo plano; si el navegador no tiene SyncManager (Safari/iOS), la interfaz escucha el evento `online` y sincroniza al recuperar la conexión.
- **Comunicación con la interfaz:** el Service Worker avisa con `postMessage` y la página escucha `navigator.serviceWorker` para actualizar la lista y el mensaje de estado.
- **Regla estricta:** todo en Vanilla JS, sin librerías externas y sin `async`/`await`: solo `new Promise()`, `.then()`, `.catch()` y `Promise.all()`.
