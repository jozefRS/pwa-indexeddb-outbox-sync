// app.js — Tema 5.2
// Logica de la interfaz: captura envios POST fallidos sin red, los
// encola en IndexedDB como "pendiente", permite verlos y purgarlos.
// 100% Vanilla JS. Sin librerias externas.
// Toda la asincronia usa new Promise(), .then(), .catch() y Promise.all().
(function () {
  var ENDPOINT = 'https://jsonplaceholder.typicode.com/posts';
  var SYNC_TAG = 'sync-outbox';

  var elEstado = document.getElementById('estado-conexion');
  var elMensaje = document.getElementById('mensaje-sync');
  var elForm = document.getElementById('form-nota');
  var elTitulo = document.getElementById('titulo');
  var elTexto = document.getElementById('texto');
  var elListaItems = document.getElementById('lista-items');
  var elListaItemsVacia = document.getElementById('lista-items-vacia');
  var elListaOutbox = document.getElementById('lista-outbox');
  var elListaOutboxVacia = document.getElementById('lista-outbox-vacia');
  var elBtnSincronizar = document.getElementById('btn-sincronizar');
  var elBtnPurgar = document.getElementById('btn-purgar');

  function mostrarMensaje(texto) {
    elMensaje.textContent = texto;
  }

  function actualizarEstadoConexion() {
    if (navigator.onLine) {
      elEstado.textContent = 'En linea';
      elEstado.className = 'en-linea';
    } else {
      elEstado.textContent = 'Sin conexion — modo offline';
      elEstado.className = 'sin-conexion';
    }
  }

  // POST de demostracion. Resuelve con la respuesta si el servidor
  // responde 2xx; rechaza si no hay red o el servidor responde con error.
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

  function pintarItems(items) {
    elListaItems.innerHTML = '';
    elListaItemsVacia.style.display = items.length ? 'none' : 'block';
    items.forEach(function (item) {
      var li = document.createElement('li');
      var titulo = document.createElement('strong');
      titulo.textContent = item.title;
      var texto = document.createElement('p');
      texto.textContent = item.text;
      var meta = document.createElement('small');
      meta.textContent = 'Creada: ' + (item.createdAt || '') + ' — ';
      var estado = document.createElement('span');
      estado.className = 'estado ' + (item.estado || 'pendiente');
      estado.textContent = item.estado || 'pendiente';
      meta.appendChild(estado);
      var btnBorrar = document.createElement('button');
      btnBorrar.type = 'button';
      btnBorrar.textContent = 'Eliminar';
      btnBorrar.addEventListener('click', function () {
        DBHelper.deleteItem(item.id).then(function () {
          return refrescar();
        }).catch(function (err) {
          mostrarMensaje('No se pudo eliminar la nota: ' + err.message);
        });
      });
      li.appendChild(titulo);
      li.appendChild(texto);
      li.appendChild(meta);
      li.appendChild(document.createElement('br'));
      li.appendChild(btnBorrar);
      elListaItems.appendChild(li);
    });
  }

  function pintarOutbox(entries) {
    elListaOutbox.innerHTML = '';
    elListaOutboxVacia.style.display = entries.length ? 'none' : 'block';
    entries.forEach(function (entry) {
      var li = document.createElement('li');
      var titulo = document.createElement('strong');
      titulo.textContent = entry.title;
      var texto = document.createElement('p');
      texto.textContent = entry.text;
      var meta = document.createElement('small');
      meta.textContent = 'Encolada: ' + (entry.createdAt || '') + ' — ';
      var estado = document.createElement('span');
      estado.className = 'estado ' + (entry.estado || 'pendiente');
      estado.textContent = entry.estado || 'pendiente';
      meta.appendChild(estado);
      li.appendChild(titulo);
      li.appendChild(texto);
      li.appendChild(meta);
      elListaOutbox.appendChild(li);
    });
  }

  function refrescar() {
    return Promise.all([
      DBHelper.getAllItems(),
      DBHelper.getOutbox()
    ]).then(function (resultados) {
      pintarItems(resultados[0]);
      pintarOutbox(resultados[1]);
    }).catch(function (err) {
      mostrarMensaje('No se pudieron leer los datos locales: ' + err.message);
    });
  }

  // Intenta enviar una entrada. Si falla, la deja en el Outbox
  // como "pendiente". Devuelve una promesa que siempre resuelve
  // con true (sincronizada) o false (quedo pendiente).
  function intentarEnviar(entry) {
    return enviarAlServidor(entry).then(function () {
      return true;
    }).catch(function () {
      return false;
    });
  }

  // Sincronizacion manual desde la interfaz (tambien la usa el
  // evento "online" como alternativa cuando no hay SyncManager).
  function sincronizarAhora() {
    return DBHelper.getOutbox().then(function (entries) {
      if (!entries.length) {
        mostrarMensaje('Outbox vacio: nada que sincronizar.');
        return 0;
      }
      mostrarMensaje('Sincronizando ' + entries.length + ' envio(s)...');
      var trabajos = entries.map(function (entry) {
        return intentarEnviar(entry).then(function (ok) {
          if (!ok) {
            // Sigue pendiente: se conserva en el Outbox.
            return DBHelper.updateOutbox({
              id: entry.id,
              itemId: entry.itemId,
              title: entry.title,
              text: entry.text,
              createdAt: entry.createdAt,
              estado: 'pendiente'
            }).then(function () {
              return false;
            });
          }
          // Exito: se marca sincronizado y se quita del Outbox.
          return DBHelper.deleteOutbox(entry.id).then(function () {
            return DBHelper.getAllItems().then(function (items) {
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
              return DBHelper.updateItem(item).then(function () {
                return true;
              });
            });
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
        mostrarMensaje('Sincronizados: ' + sincronizados + ' de ' + entries.length +
          '. Los que fallaron siguen pendientes en el Outbox.');
        return refrescar().then(function () {
          return sincronizados;
        });
      });
    }).catch(function (err) {
      mostrarMensaje('Error al sincronizar: ' + err.message);
      return 0;
    });
  }

  // Pide al Service Worker una sincronizacion en segundo plano.
  // Si el navegador no tiene SyncManager, sincroniza ahora mismo.
  function pedirSyncEnSegundoPlano() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      return navigator.serviceWorker.ready.then(function (registration) {
        return registration.sync.register(SYNC_TAG);
      }).then(function () {
        mostrarMensaje('Sincronizacion en segundo plano registrada.');
      }).catch(function (err) {
        mostrarMensaje('No se pudo registrar la sincronizacion: ' + err.message +
          '. Intentando sincronizar ahora.');
        return sincronizarAhora();
      });
    }
    // Alternativa para navegadores sin SyncManager (Safari/iOS):
    // sincronizar en cuanto vuelve la conexion.
    return sincronizarAhora();
  }

  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      mostrarMensaje('Este navegador no soporta Service Workers.');
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.register('./sw.js').then(function (registration) {
      mostrarMensaje('Service Worker registrado.');
      return registration;
    }).catch(function (err) {
      mostrarMensaje('No se pudo registrar el Service Worker: ' + err.message);
      return null;
    });
  }

  // Escucha el resultado que el Service Worker envia con postMessage.
  function escucharMensajesDelSW() {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    navigator.serviceWorker.addEventListener('message', function (event) {
      var data = event.data || {};
      if (data.type === 'sync-result') {
        mostrarMensaje('Sincronizacion en segundo plano: ' + data.sincronizados +
          ' de ' + data.total + ' enviado(s).');
        refrescar();
      }
      if (data.type === 'sync-error') {
        mostrarMensaje('La sincronizacion en segundo plano fallo: ' + (data.message || ''));
        refrescar();
      }
    });
  }

  function guardarNota(event) {
    event.preventDefault();
    var title = elTitulo.value.trim();
    var text = elTexto.value.trim();
    if (!title || !text) {
      mostrarMensaje('Escribe un titulo y un texto.');
      return;
    }
    var item = {
      title: title,
      text: text,
      createdAt: new Date().toISOString(),
      estado: 'pendiente'
    };
    // 1) Guardar la nota en IndexedDB (siempre, con o sin red).
    DBHelper.addItem(item).then(function (itemId) {
      item.id = itemId;
      elForm.reset();
      mostrarMensaje('Nota guardada en local. Enviando...');
      // 2) Intentar el POST. Si falla (sin red u otro error),
      //    encolarlo en el Outbox como "pendiente".
      return intentarEnviar(item).then(function (ok) {
        if (ok) {
          item.estado = 'sincronizado';
          return DBHelper.updateItem(item).then(function () {
            mostrarMensaje('Nota enviada y sincronizada.');
            return refrescar();
          });
        }
        return DBHelper.addToOutbox({
          itemId: item.id,
          title: item.title,
          text: item.text,
          createdAt: item.createdAt,
          estado: 'pendiente'
        }).then(function () {
          mostrarMensaje('Sin conexion: el envio quedo pendiente en el Outbox.');
          return pedirSyncEnSegundoPlano().then(function () {
            return refrescar();
          });
        });
      });
    }).catch(function (err) {
      mostrarMensaje('No se pudo guardar la nota: ' + err.message);
    });
  }

  elForm.addEventListener('submit', guardarNota);

  elBtnSincronizar.addEventListener('click', function () {
    sincronizarAhora();
  });

  elBtnPurgar.addEventListener('click', function () {
    DBHelper.clearOutbox().then(function () {
      mostrarMensaje('Outbox purgado: se eliminaron los envios pendientes.');
      return refrescar();
    }).catch(function (err) {
      mostrarMensaje('No se pudo purgar el Outbox: ' + err.message);
    });
  });

  // Alternativa para navegadores sin SyncManager (Safari/iOS):
  // al recuperar la conexion, sincronizar de inmediato.
  window.addEventListener('online', function () {
    actualizarEstadoConexion();
    mostrarMensaje('Conexion recuperada. Sincronizando...');
    sincronizarAhora();
  });
  window.addEventListener('offline', function () {
    actualizarEstadoConexion();
    mostrarMensaje('Sin conexion. Los nuevos envios quedaran pendientes.');
  });

  actualizarEstadoConexion();
  escucharMensajesDelSW();
  registrarServiceWorker().then(function () {
    return refrescar();
  });
})();
