const CACHE_NAME = "gestor-gastos-v8";
const REMINDERS_CACHE = "gestor-gastos-reminders";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/db.js",
  "./js/push.js",
  "./js/storage.js",
  "./js/transactions.js",
  "./js/categories.js",
  "./js/dashboard.js",
  "./js/charts.js",
  "./js/wallets.js",
  "./js/notifications.js",
  "./icons/icon.svg",
  "./manifest.webmanifest",
  "./audio/notification.wav",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== REMINDERS_CACHE)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch(() => undefined);
        return cachedResponse;
      }
      return fetch(event.request).catch(() => caches.match("./index.html"));
    })
  );
});

// Guardar y sincronizar recordatorios en el Service Worker
self.addEventListener("message", (event) => {
  if (!event.data) return;

  if (event.data.type === "SYNC_REMINDERS") {
    const reminders = event.data.reminders || [];
    event.waitUntil(
      caches.open(REMINDERS_CACHE).then(async (cache) => {
        await cache.put(
          new Request("/sw-reminders-data"),
          new Response(JSON.stringify(reminders), {
            headers: { "Content-Type": "application/json" }
          })
        );
        // Si el navegador soporta Notification Triggers nativos del SO (Chromium)
        await scheduleNativeNotificationTriggers(reminders);
      })
    );
  }

  if (event.data.type === "CHECK_REMINDERS_NOW") {
    event.waitUntil(checkWorkerReminders());
  }

  if (event.data.type === "SYNC_PENDING_NOW") {
    event.waitUntil(syncPendingExpenses());
  }
});

// Sincronización en segundo plano One-Shot (Background Sync API)
self.addEventListener("sync", (event) => {
  if (event.tag === "sincronizar-gasto") {
    event.waitUntil(syncPendingExpenses());
  }
});

// Sincronización periódica en segundo plano (Periodic Background Sync API)
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "check-reminders") {
    event.waitUntil(checkWorkerReminders());
  }
});

// Notificaciones Web Push en segundo plano (Supabase / VAPID)
// Despierta el dispositivo aunque la app y el navegador estén cerrados
self.addEventListener("push", (event) => {
  let data = {
    title: "Recordatorio de Gastos ⏰",
    body: "Es momento de anotar tus ingresos y gastos de hoy.",
    url: "./",
    tag: "daily-reminder",
    requireInteraction: true,
    silent: false,
    sound: "./audio/notification.wav",
    vibrate: [300, 100, 300, 100, 300],
    actions: [
      { action: "open", title: "📝 Registrar Gasto" },
      { action: "dismiss", title: "Cerrar" }
    ]
  };

  if (event.data) {
    try {
      const json = event.data.json();
      data = { ...data, ...json };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "./icons/icon.svg",
      badge: "./icons/icon.svg",
      tag: data.tag || "daily-reminder",
      renotify: true,
      requireInteraction: data.requireInteraction !== false,
      silent: false,
      vibrate: data.vibrate || [300, 100, 300, 100, 300],
      sound: "./audio/notification.wav",
      data: { url: data.url || "./", reminderId: data.reminderId },
      actions: data.actions || [
        { action: "open", title: "📝 Registrar Gasto" },
        { action: "dismiss", title: "Cerrar" }
      ]
    })
  );
});

/**
 * Procesa la cola de transacciones pendientes en IndexedDB cuando se recupera la conexión.
 */
async function syncPendingExpenses() {
  try {
    const db = await openIDB();
    const pendingList = await getPendingFromIDB(db);

    if (!pendingList || pendingList.length === 0) {
      console.log("[SW Background Sync] No hay movimientos pendientes en IndexedDB");
      return;
    }

    console.log(`[SW Background Sync] Procesando ${pendingList.length} movimiento(s) pendiente(s)...`);

    for (const item of pendingList) {
      // 1. Eliminar de la cola de pendientes en IndexedDB
      await deletePendingFromIDB(db, item.pendingId);

      // 2. Disparar notificación confirmando que el gasto ha sido guardado
      try {
        if (self.registration && self.registration.showNotification) {
          await self.registration.showNotification("Gasto sincronizado ☁️", {
            body: `El gasto "${item.description}" ha sido guardado exitosamente.`,
            icon: "./icons/icon.svg",
            badge: "./icons/icon.svg",
            tag: `sync-${item.pendingId || item.id || Date.now()}`,
            renotify: true,
            data: { url: "./" }
          });
        }
      } catch (notifErr) {
        console.warn("[SW Background Sync] No se pudo mostrar notificación nativa:", notifErr);
      }
    }

    // 3. Notificar a las ventanas activas de la app que la sincronización fue completada
    const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientList) {
      client.postMessage({
        type: "SYNC_COMPLETED",
        count: pendingList.length
      });
    }
  } catch (err) {
    console.error("Error al sincronizar transacciones pendientes en Service Worker:", err);
  }
}

// Helpers de IndexedDB nativo dentro del Service Worker
function openIDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("gestor-gastos-db", 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("pending-transactions")) {
        const store = db.createObjectStore("pending-transactions", {
          keyPath: "pendingId",
          autoIncrement: true
        });
        store.createIndex("byDate", "date", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getPendingFromIDB(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending-transactions", "readonly");
    const store = tx.objectStore("pending-transactions");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deletePendingFromIDB(db, pendingId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending-transactions", "readwrite");
    const store = tx.objectStore("pending-transactions");
    const request = store.delete(pendingId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function checkWorkerReminders() {
  try {
    const cache = await caches.open(REMINDERS_CACHE);
    const response = await cache.match("/sw-reminders-data");
    if (!response) return;

    const reminders = await response.json();
    if (!Array.isArray(reminders)) return;

    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, "0");
    const currentMinutes = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${currentHours}:${currentMinutes}`;
    const todayDate = now.toISOString().slice(0, 10);

    for (const reminder of reminders) {
      if (!reminder.enabled) continue;

      const [rHour, rMin] = reminder.time.split(":").map(Number);
      const [cHour, cMin] = [now.getHours(), now.getMinutes()];
      const diffMinutes = (cHour * 60 + cMin) - (rHour * 60 + rMin);

      if (diffMinutes >= 0 && diffMinutes <= 5) {
        const lastNotifiedKey = `/last-notified-${reminder.id}`;
        const lastNotifiedResp = await cache.match(lastNotifiedKey);
        let alreadyNotified = false;

        if (lastNotifiedResp) {
          const dateText = await lastNotifiedResp.text();
          if (dateText === todayDate) alreadyNotified = true;
        }

        if (!alreadyNotified) {
          await cache.put(new Request(lastNotifiedKey), new Response(todayDate));

          await self.registration.showNotification(reminder.label || "Recordatorio de Gastos", {
            body: `Son las ${reminder.time}. Es momento de registrar tus movimientos de hoy.`,
            tag: `reminder-${reminder.id}`,
            renotify: true,
            requireInteraction: true,
            silent: false,
            vibrate: [300, 100, 300, 100, 300],
            sound: "./audio/notification.wav",
            icon: "./icons/icon.svg",
            badge: "./icons/icon.svg",
            data: { url: "./", reminderId: reminder.id },
            actions: [
              { action: "open", title: "📝 Registrar Gasto" },
              { action: "dismiss", title: "Cerrar" }
            ]
          });
        }
      }
    }
  } catch (err) {
    // Silencioso en worker
  }
}

// Programador nativo de alarmas del SO (Notification Triggers API)
async function scheduleNativeNotificationTriggers(reminders) {
  if (!("showTrigger" in Notification.prototype) || typeof TimestampTrigger === "undefined") {
    return;
  }
  try {
    for (const reminder of reminders) {
      if (!reminder.enabled || !reminder.time) continue;
      const [rHour, rMin] = reminder.time.split(":").map(Number);
      const targetDate = new Date();
      targetDate.setHours(rHour, rMin, 0, 0);
      if (targetDate.getTime() <= Date.now()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      await self.registration.showNotification(reminder.label || "Recordatorio de Gastos ⏰", {
        body: `Son las ${reminder.time}. Es momento de anotar tus ingresos y gastos de hoy.`,
        tag: `native-trigger-${reminder.id}`,
        showTrigger: new TimestampTrigger(targetDate.getTime()),
        icon: "./icons/icon.svg",
        badge: "./icons/icon.svg",
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: [300, 100, 300, 100, 300],
        sound: "./audio/notification.wav",
        data: { url: "./", reminderId: reminder.id },
        actions: [
          { action: "open", title: "📝 Registrar Gasto" },
          { action: "dismiss", title: "Cerrar" }
        ]
      });
    }
  } catch (err) {
    // Silencioso si no está activada la flag
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && "focus" in client) {
          client.postMessage({ type: "NOTIFICATION_CLICKED", data: event.notification.data });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("./");
      }
    })
  );
});
