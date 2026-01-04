import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.43.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NotificationPayload {
  userIds?: string[];
  title: string;
  message: string;
  type: "order" | "promo" | "system" | "custom";
  sendToAll?: boolean;
}

interface ExpoTicket {
  id: string;
  status: string;
  message?: string;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

async function sendPushNotifications(payload: NotificationPayload) {
  try {
    let userIds = payload.userIds || [];

    if (payload.sendToAll || userIds.length === 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "customer");
      userIds = profiles?.map((p: any) => p.id) || [];
    }

    if (userIds.length === 0) {
      return {
        success: false,
        message: "No users found to send notifications to",
      };
    }

    const { data: pushTokens } = await supabase
      .from("push_tokens")
      .select("token")
      .in("user_id", userIds);

    if (!pushTokens || pushTokens.length === 0) {
      return {
        success: false,
        message: "No push tokens found for selected users",
      };
    }

    const expoApiUrl = "https://exp.host/--/api/v2/push/send";
    const tickets: ExpoTicket[] = [];
    const failedTokens: { token: string; error: string }[] = [];

    for (const { token } of pushTokens) {
      try {
        const response = await fetch(expoApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            to: token,
            sound: "default",
            title: payload.title,
            body: payload.message,
            data: {
              type: payload.type,
              title: payload.title,
              message: payload.message,
            },
            badge: 1,
            priority: "high",
          }),
        });

        const data = (await response.json()) as ExpoTicket;

        if (response.ok) {
          tickets.push(data);
        } else {
          failedTokens.push({
            token: token.substring(0, 10) + "...",
            error: data.message || "Unknown error",
          });
        }
      } catch (error) {
        failedTokens.push({
          token: token.substring(0, 10) + "...",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      success: true,
      sent: tickets.length,
      failed: failedTokens.length,
      totalTokens: pushTokens.length,
      failedTokens: failedTokens.length > 0 ? failedTokens : undefined,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: errorMessage,
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const payload: NotificationPayload = await req.json();

    if (!payload.title || !payload.message || !payload.type) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: title, message, type",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const result = await sendPushNotifications(payload);

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
