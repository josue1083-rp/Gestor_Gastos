const CACHE_NAME = "gestor-gastos-v5";
const REMINDERS_CACHE = "gestor-gastos-reminders";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/storage.js",
  "./js/transactions.js",
  "./js/categories.js",
  "./js/dashboard.js",
  "./js/charts.js",
  "./js/wallets.js",
  "./js/notifications.js",
  "./manifest.webmanifest",
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
      caches.open(REMINDERS_CACHE).then((cache) => {
        return cache.put(
          new Request("/sw-reminders-data"),
          new Response(JSON.stringify(reminders), {
            headers: { "Content-Type": "application/json" }
          })
        );
      })
    );
  }

  if (event.data.type === "CHECK_REMINDERS_NOW") {
    event.waitUntil(checkWorkerReminders());
  }
});

// Sincronización en segundo plano (Periodic Background Sync API)
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "check-reminders") {
    event.waitUntil(checkWorkerReminders());
  }
});

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

      // Verificar si coincide con el minuto actual o ventana de 5 minutos
      const [rHour, rMin] = reminder.time.split(":").map(Number);
      const [cHour, cMin] = [now.getHours(), now.getMinutes()];
      const diffMinutes = (cHour * 60 + cMin) - (rHour * 60 + rMin);

      // Si es la hora exacta o pasaron hasta 5 minutos en el ciclo de sincronización
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
            icon: "./manifest.webmanifest",
            badge: "./manifest.webmanifest",
            data: { url: "./", reminderId: reminder.id }
          });
        }
      }
    }
  } catch (err) {
    // Silencioso en worker
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
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
