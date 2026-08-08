// Minimal in-memory IndexedDB fake for testing db.js without new dependencies.
// Implements only what db.js (and updater.js via getObjectStore) actually uses:
// open with version upgrades, object stores with keyPath, indexes, and
// put/get/delete/count/getAll request objects.

function makeRequest(executor) {
  const request = { onsuccess: null, onerror: null, result: undefined };
  setTimeout(() => {
    try {
      request.result = executor();
      if (request.onsuccess) request.onsuccess({ target: request });
    } catch (error) {
      request.error = error;
      if (request.onerror) request.onerror({ target: request });
    }
  }, 0);
  return request;
}

function getByKeyPath(obj, keyPath) {
  return keyPath.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), obj);
}

function makeObjectStore(store) {
  return {
    get name() { return store.name; },
    put(value) {
      return makeRequest(() => {
        const key = getByKeyPath(value, store.keyPath);
        store.data.set(key, value);
        return key;
      });
    },
    get(key) {
      return makeRequest(() => store.data.get(key));
    },
    delete(key) {
      return makeRequest(() => {
        store.data.delete(key);
        return undefined;
      });
    },
    count() {
      return makeRequest(() => store.data.size);
    },
    index(indexName) {
      const keyPath = store.indexes[indexName];
      if (!keyPath) throw new Error(`Index ${indexName} not found`);
      return {
        getAll(value) {
          return makeRequest(() =>
            [...store.data.values()].filter(
              (item) => getByKeyPath(item, keyPath) === value
            )
          );
        }
      };
    }
  };
}

function makeConnection(db) {
  return {
    get objectStoreNames() {
      return {
        contains: (name) => db.stores.has(name)
      };
    },
    createObjectStore(name, options = {}) {
      const store = {
        name,
        keyPath: options.keyPath,
        data: new Map(),
        indexes: {}
      };
      db.stores.set(name, store);
      return {
        createIndex(indexName, keyPath) {
          store.indexes[indexName] = keyPath;
        }
      };
    },
    transaction(storeName) {
      return {
        objectStore(name) {
          const store = db.stores.get(name || storeName);
          if (!store) {
            const error = new Error(`Object store ${name || storeName} not found`);
            error.name = 'NotFoundError';
            throw error;
          }
          return makeObjectStore(store);
        },
        // transaction-level callbacks used by bulkInsertAssessments
        set oncomplete(fn) { this._oncomplete = fn; setTimeout(() => fn && fn({ target: this }), 5); },
        get oncomplete() { return this._oncomplete; },
        set onerror(fn) { this._onerror = fn; },
        get onerror() { return this._onerror; }
      };
    }
  };
}

function createFakeIndexedDB() {
  const databases = new Map();

  return {
    _databases: databases,
    open(name, version = 1) {
      const request = { onsuccess: null, onerror: null, onupgradeneeded: null, result: undefined };
      setTimeout(() => {
        try {
          let db = databases.get(name);
          const oldVersion = db ? db.version : 0;
          if (!db) {
            db = { name, version, stores: new Map() };
            databases.set(name, db);
          }
          const connection = makeConnection(db);
          request.result = connection;
          if (version > oldVersion) {
            db.version = version;
            if (request.onupgradeneeded) {
              request.onupgradeneeded({ target: request });
            }
          }
          if (request.onsuccess) request.onsuccess({ target: request });
        } catch (error) {
          request.error = error;
          if (request.onerror) request.onerror({ target: request });
        }
      }, 0);
      return request;
    },
    deleteDatabase(name) {
      databases.delete(name);
    }
  };
}

module.exports = { createFakeIndexedDB };
