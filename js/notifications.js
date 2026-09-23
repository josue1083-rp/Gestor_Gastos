/**
 * Módulo de Notificaciones y Recordatorios PWA
 * Implementa sincronización multicanal: Notificaciones Web del Sistema,
 * Periodic Background Sync, Notificaciones In-App (Catch-up) y Badging API.
 */

// Comprobar soporte y estado de notificaciones
export function getNotificationDiagnostics() {
  const isSupported = "Notification" in window;
  const permission = isSupported ? Notification.permission : "unsupported";
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  const hasServiceWorker = "serviceWorker" in navigator;
  const hasPeriodicSync = "serviceWorker" in navigator && "PeriodicSyncManager" in window;
  const hasBadging = "setAppBadge" in navigator;

  return {
    isSupported,
    permission,
    isStandalone,
    hasServiceWorker,
    hasPeriodicSync,
    hasBadging,
  };
}

// Solicitar permisos al usuario con feedback claro
export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("Este navegador no soporta la API de notificaciones web.");
    return false;
  }

  if (Notification.permission === "granted") {
    await registerBackgroundSync();
    return true;
  }

  if (Notification.permission !== "denied") {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await registerBackgroundSync();
        return true;
      }
    } catch {
      return false;
    }
  }

  alert(
    "Las notificaciones están bloqueadas en tu navegador.\n\n" +
    "Para activarlas:\n" +
    "• En Android/Chrome: Toca el candado o icono de ajustes junto a la URL y permite 'Notificaciones'.\n" +
    "• En iPhone (iOS 16.4+): Añade la app a tu Pantalla de Inicio (Compartir > Añadir a pantalla de inicio) y luego activa las notificaciones desde allí."
  );
  return false;
}

// Registrar sincronización periódica en segundo plano si está disponible
async function registerBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    if ("periodicSync" in registration) {
      const status = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (status.state === "granted") {
        await registration.periodicSync.register("check-reminders", {
          minInterval: 60 * 60 * 1000, // 1 hora
        });
      }
    }
  } catch {
    // Silencioso: fallback a catch-up in-app
  }
}

// Enviar recordatorios actualizados al Service Worker
export async function syncRemindersWithServiceWorker(reminders) {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active) {
      registration.active.postMessage({
        type: "SYNC_REMINDERS",
        reminders: reminders || [],
      });
    }
  } catch {
    // Fallback silencioso
  }
}

// Enviar notificación del sistema (vía Service Worker o Notification API)
export async function sendLocalNotification(title, options = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }

  const defaultOptions = {
    body: "¡Es momento de registrar tus movimientos del día en Gestor de Gastos!",
    tag: "gestor-gastos-notification",
    renotify: true,
    data: { url: "./" },
    ...options,
  };

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && registration.showNotification) {
        await registration.showNotification(title, defaultOptions);
        return true;
      }
    }
    new Notification(title, defaultOptions);
    return true;
  } catch {
    return false;
  }
}

// Comprobación inteligente de recordatorios con "Catch-Up" para recordatorios atrasados
export function checkScheduledReminders(settings, onMissedReminder = null) {
  if (!settings || !Array.isArray(settings.reminders) || settings.reminders.length === 0) {
    return;
  }

  const now = new Date();
  const currentHours = String(now.getHours()).padStart(2, "0");
  const currentMinutes = String(now.getMinutes()).padStart(2, "0");
  const currentTime = `${currentHours}:${currentMinutes}`;
  const todayDate = now.toISOString().slice(0, 10);
  const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

  settings.reminders.forEach((reminder) => {
    if (!reminder.enabled || !reminder.time) return;

    const [rHours, rMins] = reminder.time.split(":").map(Number);
    const reminderTotalMinutes = rHours * 60 + rMins;

    const storageKey = `last_notified_${reminder.id}`;
    const lastNotified = localStorage.getItem(storageKey);

    // 1. Momento exacto de la alarma
    if (reminder.time === currentTime && lastNotified !== todayDate) {
      localStorage.setItem(storageKey, todayDate);
      sendLocalNotification(reminder.label || "Recordatorio de Gastos", {
        body: `Son las ${reminder.time}. No olvides anotar tus ingresos y gastos de hoy.`,
        tag: `reminder-${reminder.id}`,
      });
      setAppBadge(1);
      if (typeof onMissedReminder === "function") {
        onMissedReminder(reminder, false);
      }
      return;
    }

    // 2. Sistema Catch-Up: Si la hora ya pasó hoy pero la app estuvo cerrada y no se notificó
    if (
      lastNotified !== todayDate &&
      currentTotalMinutes > reminderTotalMinutes &&
      currentTotalMinutes - reminderTotalMinutes < 12 * 60 // Dentro de las últimas 12 horas del día
    ) {
      localStorage.setItem(storageKey, todayDate);
      // Notificar si hay permiso
      sendLocalNotification(`Aviso: ${reminder.label || "Recordatorio de Gastos"}`, {
        body: `Tenías un recordatorio a las ${reminder.time}. No olvides actualizar tus movimientos.`,
        tag: `reminder-${reminder.id}-catchup`,
      });
      setAppBadge(1);
      if (typeof onMissedReminder === "function") {
        onMissedReminder(reminder, true);
      }
    }
  });
}

// Iniciar programador reactivo (activo en pestaña + reactivo en visibilidad/foco)
export function startNotificationScheduler(getSettingsFn, onMissedReminder = null) {
  // Comprobación inicial al abrir
  const check = () => checkScheduledReminders(getSettingsFn(), onMissedReminder);
  check();

  // Intervalo regular de 25 segundos
  const intervalId = setInterval(check, 25000);

  // Reactivo: al desbloquear pantalla o volver a la pestaña, comprobar de inmediato
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      check();
    }
  });

  window.addEventListener("focus", check);

  return () => {
    clearInterval(intervalId);
    window.removeEventListener("focus", check);
  };
}

// Banner in-app (notificación dentro de la app para máxima visibilidad)
export function showInAppBanner(title, body, onAddClick = null) {
  const banner = document.getElementById("notificationBanner");
  const titleEl = document.getElementById("notificationBannerTitle");
  const bodyEl = document.getElementById("notificationBannerBody");
  const addBtn = document.getElementById("bannerAddExpenseButton");
  const closeBtn = document.getElementById("closeBannerButton");

  if (!banner) return;

  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.textContent = body;
  banner.hidden = false;

  const handleClose = () => {
    banner.hidden = true;
    clearAppBadge();
  };

  if (closeBtn) {
    closeBtn.onclick = handleClose;
  }

  if (addBtn) {
    addBtn.onclick = () => {
      handleClose();
      if (typeof onAddClick === "function") {
        onAddClick();
      }
    };
  }
}

// Badging API (ícono de notificación en pantalla de inicio de Android / iOS / Desktop)
export function setAppBadge(count = 1) {
  if ("setAppBadge" in navigator) {
    navigator.setAppBadge(count).catch(() => undefined);
  }
}

export function clearAppBadge() {
  if ("clearAppBadge" in navigator) {
    navigator.clearAppBadge().catch(() => undefined);
  }
}
