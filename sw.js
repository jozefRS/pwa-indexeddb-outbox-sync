// sw.js — Tema 5.3
// Service Worker: cache del app shell y motor de sincronizacion
// con la API Background Sync (sync). Comunica el resultado a la
// interfaz con postMessage. La interfaz usa ademas el evento
// "online" como alternativa para navegadores sin SyncManager.
// 100% Vanilla JS. Sin librerias externas.
// Toda la asincronia usa new Promise(), .then(), .catch() y Promise.all().
importScripts('./db-helper.js');

var CACHE_NAME = 'pwa-offline-v1';
var APP_SHELL = [
  './',
  './index.html',
  './db-helper.js',
  './app.js',
  './manifest.webmanifest'
];
var ENDPOINT = 'https://jsonplaceholder.typicode.com/posts';
var SYNC_TAG = 'sync-outbox';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      var trabajos = keys.map(function (key) {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
        return Promise.resolve(true);
      });
      return Promise.all(trabajos);
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy);
        }).catch(function () {
          // Si el cache falla, la respuesta sigue sirviendo.
        });
        return response;
      }).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});

function enviarAlServidor(entry) {
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: entry.title,
      body: entry.text,
      userId: 1
    })
  }).then(function (response) {
    if (!response.ok) {
      throw new Error('El servidor respondio con estado ' + response.status);
    }
    return response.json();
  });
}

function avisarClientes(mensaje) {
  return self.clients.matchAll().then(function (clients) {
    clients.forEach(function (client) {
      client.postMessage(mensaje);
    });
  });
}

// Vacía el Outbox: por cada entrada pendiente intenta el POST.
// Exito: se marca sincronizado y se quita del Outbox.
// Fallo: se queda pendiente en el Outbox para el proximo intento.
function sincronizarOutbox() {
  return self.DBHelper.getOutbox().then(function (entries) {
    if (!entries.length) {
      return avisarClientes({ type: 'sync-result', sincronizados: 0, total: 0 });
    }
    var trabajos = entries.map(function (entry) {
      return enviarAlServidor(entry).then(function () {
        return self.DBHelper.deleteOutbox(entry.id).then(function () {
          return self.DBHelper.getAllItems().then(function (items) {
            var item = null;
            items.forEach(function (it) {
              if (it.id === entry.itemId) {
                item = it;
              }
            });
            if (!item) {
              return true;
            }
            item.estado = 'sincronizado';
            return self.DBHelper.updateItem(item).then(function () {
              return true;
            });
          });
        });
      }).catch(function () {
        // Falla: se conserva como pendiente, sin borrarla.
        return self.DBHelper.updateOutbox({
          id: entry.id,
          itemId: entry.itemId,
          title: entry.title,
          text: entry.text,
          createdAt: entry.createdAt,
          estado: 'pendiente'
        }).then(function () {
          return false;
        });
      });
    });
    return Promise.all(trabajos).then(function (resultados) {
      var sincronizados = 0;
      resultados.forEach(function (ok) {
        if (ok) {
          sincronizados = sincronizados + 1;
        }
      });
      return avisarClientes({
        type: 'sync-result',
        sincronizados: sincronizados,
        total: entries.length
      });
    });
  }).catch(function (err) {
    return avisarClientes({ type: 'sync-error', message: err.message || 'Error desconocido.' });
  });
}

self.addEventListener('sync', function (event) {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(sincronizarOutbox());
  }
});
