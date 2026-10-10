// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Manejo de preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:notificaciones@gestorgastos.local";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Faltan variables de entorno VAPID o Supabase" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Revisar si es una petición de prueba para un endpoint específico
    const url = new URL(req.url);
    const isTest = url.searchParams.get("test") === "true";
    let bodyData: any = {};
    if (req.method === "POST") {
      try {
        bodyData = await req.json();
      } catch {
        // Ignorar body vacío
      }
    }

    if (isTest && bodyData.endpoint) {
      // Envío de prueba individual
      const pushSubscription = {
        endpoint: bodyData.endpoint,
        keys: {
          p256dh: bodyData.p256dh,
          auth: bodyData.auth,
        },
      };

      const payload = JSON.stringify({
        title: "¡Prueba de Push Exitosa! 🎉",
        body: "Tus notificaciones en segundo plano están 100% configuradas y listas para despertar tu dispositivo.",
        tag: "test-push",
        url: "./",
        requireInteraction: true,
        silent: false,
        sound: "./audio/notification.wav",
        vibrate: [300, 100, 300, 100, 300],
        actions: [
          { action: "open", title: "📝 Registrar Gasto" },
          { action: "dismiss", title: "Cerrar" },
        ],
      });

      await webpush.sendNotification(pushSubscription, payload, {
        urgency: "high",
        TTL: 86400,
        headers: { "Urgency": "high" },
      });
      return new Response(JSON.stringify({ success: true, message: "Notificación de prueba enviada con prioridad alta" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Consulta de todas las suscripciones activas
    const { data: subscriptions, error: dbError } = await supabase
      .from("push_subscriptions")
      .select("*");

    if (dbError) {
      throw dbError;
    }

    const now = new Date();
    const results = [];
    const expiredEndpoints = [];

    for (const sub of subscriptions || []) {
      // Calcular hora local del usuario según su zona horaria
      let userHourStr = "";
      let userDateStr = "";
      try {
        const timeFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: sub.timezone || "America/Santo_Domingo",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        userHourStr = timeFormatter.format(now); // Ej: "20:00"

        const dateFormatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: sub.timezone || "America/Santo_Domingo",
        });
        userDateStr = dateFormatter.format(now); // Ej: "2026-10-10"
      } catch {
        userHourStr = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
        userDateStr = now.toISOString().slice(0, 10);
      }

      // Soportar array de horas simples ["20:00"] u objetos [{ time: "20:00", label: "Cena", enabled: true }]
      let targetReminders: { time: string; label: string; enabled: boolean }[] = [];
      try {
        let rawTimes = sub.reminder_times;
        if (typeof rawTimes === "string") rawTimes = JSON.parse(rawTimes);
        if (Array.isArray(rawTimes)) {
          targetReminders = rawTimes.map((item: any) => {
            if (typeof item === "string") return { time: item, label: "Recordatorio de Gastos", enabled: true };
            return {
              time: item.time || "20:00",
              label: item.label || "Recordatorio de Gastos",
              enabled: item.enabled !== false,
            };
          });
        }
      } catch {
        targetReminders = [];
      }

      const lastNotifiedDates: Record<string, string> = sub.last_notified_dates || {};
      let updatedDates = false;

      for (const reminder of targetReminders) {
        if (!reminder.enabled || !reminder.time) continue;
        const timeStr = reminder.time;

        // Evitar duplicados si ya fue notificado hoy en esta misma hora configurada
        if (lastNotifiedDates[timeStr] === userDateStr) {
          continue;
        }

        // Si coincide la hora configurada (o ventana de 15 minutos en el ciclo de cron)
        const [targetH, targetM] = timeStr.split(":").map(Number);
        const [currentH, currentM] = userHourStr.split(":").map(Number);
        const diffMinutes = (currentH * 60 + currentM) - (targetH * 60 + targetM);

        const isMatch = diffMinutes >= 0 && diffMinutes < 15;

        if (isMatch) {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          };

          const payload = JSON.stringify({
            title: reminder.label || "Recordatorio de Gastos ⏰",
            body: `Son las ${timeStr}. Es momento de registrar tus ingresos y gastos de hoy.`,
            tag: `daily-reminder-${sub.id}-${timeStr}`,
            url: "./",
            requireInteraction: true,
            silent: false,
            sound: "./audio/notification.wav",
            vibrate: [300, 100, 300, 100, 300],
            actions: [
              { action: "open", title: "📝 Registrar Gasto" },
              { action: "dismiss", title: "Cerrar" },
            ],
          });

          try {
            await webpush.sendNotification(pushSubscription, payload, {
              urgency: "high", // Despierta el dispositivo de suspensión/doze mode
              TTL: 86400,
              headers: { "Urgency": "high" },
            });
            results.push({ id: sub.id, time: timeStr, status: "sent" });
            lastNotifiedDates[timeStr] = userDateStr;
            updatedDates = true;
          } catch (err: any) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              if (!expiredEndpoints.includes(sub.endpoint)) {
                 expiredEndpoints.push(sub.endpoint);
              }
              results.push({ id: sub.id, status: "expired" });
            } else {
              results.push({ id: sub.id, status: "error", error: err.message });
            }
          }
        }
      }

      if (updatedDates) {
        try {
          await supabase
            .from("push_subscriptions")
            .update({ last_notified_dates: lastNotifiedDates })
            .eq("id", sub.id);
        } catch {
          // No fatal si la columna no existe aún
        }
      }
    }

    // Purgar suscripciones expiradas de la base de datos
    if (expiredEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: subscriptions?.length || 0,
        dispatched: results.filter((r) => r.status === "sent").length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
