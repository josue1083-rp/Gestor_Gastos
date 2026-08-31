export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("Este navegador no soporta notificaciones web.");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  alert("Las notificaciones estan bloqueadas en la configuracion de tu navegador.");
  return false;
}

export async function sendLocalNotification(title, options = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }

  const defaultOptions = {
    body: "¡Es momento de registrar tus movimientos del dia en Gestor de Gastos!",
    tag: "gestor-gastos-notification",
    renotify: true,
    ...options,
  };

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
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

export function checkScheduledReminders(settings) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  if (!settings || !Array.isArray(settings.reminders)) {
    return;
  }

  const now = new Date();
  const currentHours = String(now.getHours()).padStart(2, "0");
  const currentMinutes = String(now.getMinutes()).padStart(2, "0");
  const currentTime = `${currentHours}:${currentMinutes}`;
  const todayDate = now.toISOString().slice(0, 10);

  settings.reminders.forEach((reminder) => {
    if (!reminder.enabled || reminder.time !== currentTime) {
      return;
    }

    const storageKey = `last_notified_${reminder.id}`;
    const lastNotified = localStorage.getItem(storageKey);

    if (lastNotified !== todayDate) {
      localStorage.setItem(storageKey, todayDate);
      sendLocalNotification(reminder.label || "Recordatorio de Gastos", {
        body: `Son las ${reminder.time}. No olvides anotar tus ingresos y gastos de hoy.`,
        tag: `reminder-${reminder.id}`,
      });
    }
  });
}

export function startNotificationScheduler(getSettingsFn) {
  checkScheduledReminders(getSettingsFn());
  // Verificacion cada 30 segundos para garantizar no perder el minuto exacto
  setInterval(() => {
    checkScheduledReminders(getSettingsFn());
  }, 30000);
}
