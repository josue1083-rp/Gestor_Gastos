/**
 * Módulo de Web Push Notifications (Supabase + VAPID)
 *
 * Permite suscribir el dispositivo a notificaciones Push en segundo plano
 * mediante el estándar W3C Push API. Funciona con la app 100% cerrada
 * tanto en Android como en iOS (16.4+ agregada a pantalla de inicio).
 */

export const VAPID_PUBLIC_KEY =
  "BMwUSE4fje4NPjt8j2Dg-mEqI76sZIRLNK4aEFQfuOT163_jV4hV-Vc0nI3i1kE1vzr8xKZU6-2_WNWT83f8NAw";

const SUPABASE_CONFIG_KEY = "gestor-gastos-supabase-config";

/**
 * Convierte una clave VAPID en Base64 URL safe a un Uint8Array para el PushManager.
 */
function urlB64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Obtiene la configuración de Supabase guardada en local.
 */
export function getSupabaseConfig() {
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { url: "", anonKey: "", functionUrl: "" };
  } catch {
    return { url: "", anonKey: "", functionUrl: "" };
  }
}

/**
 * Guarda la configuración de Supabase.
 */
export function saveSupabaseConfig(config) {
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config));
}

/**
 * Comprueba si el navegador soporta Web Push con Service Worker.
 */
export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Obtiene la suscripción Push actual si existe.
 */
export async function getCurrentPushSubscription() {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Suscribe el navegador a notificaciones Push y guarda la suscripción en Supabase.
 *
 * @param {string} reminderTime - Hora en formato "HH:MM" (ej: "20:00")
 * @returns {Promise<PushSubscription>}
 */
export async function subscribeToPush(reminderTime = "20:00") {
  if (!isPushSupported()) {
    throw new Error("Tu navegador o dispositivo no soporta Web Push Notifications.");
  }

  // 1. Pedir permiso de notificaciones
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permiso de notificaciones denegado.");
  }

  // 2. Obtener el Service Worker activo
  const registration = await navigator.serviceWorker.ready;

  // 3. Suscribir a PushManager con la clave pública VAPID
  const applicationServerKey = urlB64ToUint8Array(VAPID_PUBLIC_KEY);
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (pushErr) {
      // Intentar limpiar suscripción previa huérfana y reintentar una vez
      try {
        const oldSub = await registration.pushManager.getSubscription();
        if (oldSub) await oldSub.unsubscribe();
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      } catch (retryErr) {
        // Mensajes diagnósticos claros según el navegador y entorno
        const isBrave = navigator.brave !== undefined || navigator.userAgent.includes("Brave");
        if (isBrave) {
          throw new Error(
            "Brave bloquea Google Push por defecto. Actívalo en brave://settings/privacy -> 'Usar los servicios de Google para mensajería push' y reinicia el navegador."
          );
        }
        if (retryErr.message?.includes("push service error")) {
          throw new Error(
            "El servicio Push de Google no pudo conectar. Verifica que no estés en modo Incógnito, que accedas por http://localhost:8000 o https://, o revisa chrome://gcm-internals."
          );
        }
        throw retryErr;
      }
    }
  }

  // 4. Formatear la suscripción para guardarla en Supabase
  const subJson = subscription.toJSON();
  const config = getSupabaseConfig();

  if (config.url && config.anonKey) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santo_Domingo";
    const payload = {
      endpoint: subscription.endpoint,
      p256dh: subJson.keys?.p256dh || "",
      auth: subJson.keys?.auth || "",
      reminder_time: reminderTime,
      timezone,
      user_label: navigator.userAgent.slice(0, 80),
      updated_at: new Date().toISOString(),
    };

    // Upsert directo a la tabla push_subscriptions de Supabase vía REST API
    const response = await fetch(`${config.url}/rest/v1/push_subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("Aviso al guardar suscripción en Supabase:", errText);
    }
  }

  return subscription;
}

/**
 * Cancela la suscripción a notificaciones Push.
 */
export async function unsubscribeFromPush() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return true;

  const endpoint = subscription.endpoint;
  const config = getSupabaseConfig();

  // 1. Eliminar de Supabase
  if (config.url && config.anonKey) {
    try {
      await fetch(`${config.url}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: "DELETE",
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
        },
      });
    } catch (err) {
      console.warn("No se pudo eliminar de Supabase:", err);
    }
  }

  // 2. Cancelar suscripción en el navegador
  return await subscription.unsubscribe();
}

/**
 * Envía una notificación de prueba en segundo plano a través de la Edge Function de Supabase.
 */
export async function sendTestPushFromSupabase() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) {
    throw new Error("No hay una suscripción Push activa. Primero activa las notificaciones Push.");
  }

  const config = getSupabaseConfig();
  if (!config.functionUrl || !config.anonKey) {
    throw new Error("Falta configurar la URL de la Edge Function en Configuración.");
  }

  const subJson = subscription.toJSON();
  const response = await fetch(`${config.functionUrl}?test=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.anonKey}`,
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en Edge Function: ${errorText}`);
  }

  return await response.json();
}
