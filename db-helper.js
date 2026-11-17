// db-helper.js — Tema 5.1
// Mini-wrapper con promesas para IndexedDB, 100% Vanilla JS.
// Sin librerias externas. Toda la asincronia usa new Promise(),
// .then(), .catch() y Promise.all().
// Stores:
//   - items:  notas/pedidos guardados, keyPath "id" (autoIncrement)
//   - outbox: envios pendientes, keyPath "id" (autoIncrement)
// Ver los registros en Chrome DevTools > Application > IndexedDB.
(function () {
  var root = typeof self !== 'undefined' ? self : this;
  var DB_NAME = 'pwa-offline-db';
  var DB_VERSION = 1;
  var dbPromise = null;

  function openDB() {
    if (dbPromise) {
      return dbPromise;
    }
    dbPromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);

      // Se ejecuta al crear la base o al subir de version.
      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains('items')) {
          db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = function (event) {
        resolve(event.target.result);
      };

      request.onerror = function (event) {
        dbPromise = null;
        reject(event.target.error);
      };

      request.onblocked = function () {
        reject(new Error('La base de datos esta bloqueada por otra pestana.'));
      };
    });
    return dbPromise;
  }

  // Convierte una peticion IndexedDB en una promesa.
  function requestToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function (event) {
        resolve(event.target.result);
      };
      request.onerror = function (event) {
        reject(event.target.error);
      };
    });
  }

  // Abre una transaccion y devuelve una promesa con su resultado.
  // mode: 'readonly' (solo lectura) o 'readwrite' (lectura y escritura).
  function runTx(storeName, mode, operation) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, mode);
        var store = tx.objectStore(storeName);
        var result = null;
        try {
          result = operation(store);
        } catch (err) {
          reject(err);
          return;
        }
        // Si la operacion devuelve una peticion, esperamos su resultado.
        if (result && typeof result.onsuccess !== 'undefined') {
          requestToPromise(result).then(function (value) {
            resolve(value);
          }).catch(function (err) {
            reject(err);
          });
        } else {
          // Operaciones que no devuelven peticion: resolver al completar.
          tx.oncomplete = function () {
            resolve(result);
          };
        }
        tx.onerror = function (event) {
          reject(event.target.error);
        };
        tx.onabort = function (event) {
          reject(event.target.error || new Error('Transaccion cancelada.'));
        };
      });
    });
  }

  function getAll(storeName) {
    return runTx(storeName, 'readonly', function (store) {
      return store.getAll();
    });
  }

  function addItem(item) {
    return runTx('items', 'readwrite', function (store) {
      return store.add(item);
    });
  }

  function updateItem(item) {
    return runTx('items', 'readwrite', function (store) {
      return store.put(item);
    });
  }

  function deleteItem(id) {
    return runTx('items', 'readwrite', function (store) {
      return store.delete(id);
    });
  }

  function getAllItems() {
    return getAll('items');
  }

  function addToOutbox(entry) {
    return runTx('outbox', 'readwrite', function (store) {
      return store.add(entry);
    });
  }

  function getOutbox() {
    return getAll('outbox');
  }

  function updateOutbox(entry) {
    return runTx('outbox', 'readwrite', function (store) {
      return store.put(entry);
    });
  }

  function deleteOutbox(id) {
    return runTx('outbox', 'readwrite', function (store) {
      return store.delete(id);
    });
  }

  function clearOutbox() {
    return runTx('outbox', 'readwrite', function (store) {
      return store.clear();
    });
  }

  root.DBHelper = {
    openDB: openDB,
    addItem: addItem,
    updateItem: updateItem,
    deleteItem: deleteItem,
    getAllItems: getAllItems,
    addToOutbox: addToOutbox,
    getOutbox: getOutbox,
    updateOutbox: updateOutbox,
    deleteOutbox: deleteOutbox,
    clearOutbox: clearOutbox
  };
})();
