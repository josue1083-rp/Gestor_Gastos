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
        body: "Tus notificaciones en segundo plano están 100% configuradas y activas.",
        tag: "test-push",
        url: "./",
      });

      await webpush.sendNotification(pushSubscription, payload);
      return new Response(JSON.stringify({ success: true, message: "Notificación de prueba enviada" }), {
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
      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: sub.timezone || "America/Santo_Domingo",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        userHourStr = formatter.format(now); // Ej: "20:00"
      } catch {
        userHourStr = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
      }

      // Si coincide la hora configurada (o ventana de 15 minutos en el ciclo de cron)
      const [targetH, targetM] = sub.reminder_time.split(":").map(Number);
      const [currentH, currentM] = userHourStr.split(":").map(Number);
      const diffMinutes = (currentH * 60 + currentM) - (targetH * 60 + targetM);

      // Si la hora coincide o pasaron menos de 15 minutos en este tick de cron
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
          title: "Recordatorio de Gastos ⏰",
          body: `Son las ${sub.reminder_time}. Es momento de registrar tus ingresos y gastos de hoy.`,
          tag: `daily-reminder-${sub.id}`,
          url: "./",
        });

        try {
          await webpush.sendNotification(pushSubscription, payload);
          results.push({ id: sub.id, status: "sent" });
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // El usuario desinstaló la app o revocó el permiso -> marcar para borrar
            expiredEndpoints.push(sub.endpoint);
            results.push({ id: sub.id, status: "expired" });
          } else {
            results.push({ id: sub.id, status: "error", error: err.message });
          }
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
