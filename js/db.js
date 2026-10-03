/**
 * Módulo de IndexedDB — Gestor de Gastos PWA
 *
 * Usa la API nativa de IndexedDB (sin librería externa) para mantener
 * el bundle ligero. Almacena transacciones pendientes de sincronización
 * cuando el usuario opera sin conexión.
 *
 * Base de datos: "gestor-gastos-db"  versión: 1
 * Object stores:
 *   - "pending-transactions": cola de movimientos pendientes de confirmar
 */

const DB_NAME = "gestor-gastos-db";
const DB_VERSION = 1;
const STORE_PENDING = "pending-transactions";

/** Abre (o crea) la base de datos y devuelve la instancia. */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Object store para transacciones pendientes de sincronización
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        const store = db.createObjectStore(STORE_PENDING, {
          keyPath: "pendingId",
          autoIncrement: true,
        });
        // Índice por fecha para facilitar consultas
        store.createIndex("byDate", "date", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Guarda un movimiento en la cola de pendientes.
 * Llamar cuando falla el intento de persistencia online.
 *
 * @param {Object} transaction - Objeto de transacción con todos sus campos.
 * @returns {Promise<number>} pendingId asignado por IndexedDB.
 */
export async function savePendingTransaction(transaction) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, "readwrite");
    const store = tx.objectStore(STORE_PENDING);
    const request = store.add({
      ...transaction,
      _savedAt: new Date().toISOString(),
      _status: "pending",
    });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Recupera todos los movimientos pendientes de la cola.
 *
 * @returns {Promise<Array>} Lista de transacciones pendientes.
 */
export async function getAllPendingTransactions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, "readonly");
    const store = tx.objectStore(STORE_PENDING);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Elimina un movimiento pendiente por su pendingId.
 * Llamar después de sincronizar exitosamente.
 *
 * @param {number} pendingId - ID interno de IndexedDB.
 * @returns {Promise<void>}
 */
export async function deletePendingTransaction(pendingId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, "readwrite");
    const store = tx.objectStore(STORE_PENDING);
    const request = store.delete(pendingId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Cuenta cuántos movimientos están pendientes de sincronización.
 *
 * @returns {Promise<number>}
 */
export async function countPendingTransactions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, "readonly");
    const store = tx.objectStore(STORE_PENDING);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
