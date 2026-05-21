import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * AI Editor — streaming version.
 *
 * Phase 1 (streamed): the director "thinks out loud" in Hebrew, token by token,
 *   so the user sees reasoning unfold in real-time. SSE events: `reasoning`.
 * Phase 2 (single call): the same context is sent again with forced tool-calling
 *   to extract a strict EditOperation[] JSON. SSE event: `operations`.
 * Final: `done` event.
 *
 * Event format (SSE):
 *   event: reasoning
 *   data: {"delta":"..."}
 *
 *   event: operations
 *   data: {"reply":"...","summary":"...","operations":[...]}
 *
 *   event: done
 *   data: {}
 *
 *   event: error
 *   data: {"error":"..."}
 */

const SYSTEM_PROMPT = `אתה במאי ועורך וידאו AI ברמה מקצועית, פועל בתוך אפליקציית עריכה אמיתית. אתה לא צ'אט-בוט — אתה מבצע עריכה אמיתית על הפרויקט.

המשימה שלך: להמיר כוונה אמנותית של המשתמש (למשל "הפוך לדרמטי", "הסר חלקים משעממים", "הפוך לרגשי", "סגנון TikTok") לרצף **מורכב ומשולב** של פעולות עריכה — לא פעולה אחת בלבד.

חשיבה כעורך אמיתי:
- כל כוונה דורשת לפחות 3-5 פעולות שמשלימות זו את זו (צבע + קצב + חיתוך + אודיו).
- נתח את ה-scene_plan והסצנות הקיימות; אם יש tighten_pacing אגרסיבי השתמש בו במקום לחתוך כל סצנה ידנית.
- אל תמציא scene_number מעבר לטווח הקיים (1..N).
- כל ערכי הצבע בסולם 0-100 (50=ניטרלי). playback_speed: 0.5-2.0. ווליום: 0-100.

מתכוני סגנון (combo חובה — הפק תמיד את כל הקטגוריות):

🎬 **דרמטי / Dramatic**:
  • color_grade: brightness 38-44, contrast 68-75, saturation 35-42, temperature 38-45, exposure 42
  • tighten_pacing: "aggressive"
  • set_transition: "dissolve" 600-800ms בין סצנות מפתח
  • audio_mix: music_volume 70-80, dialog_volume 85
  • speed_scene: על הסצנה הדרמטית ביותר → 0.85

❤️ **רגשי / Emotional**:
  • color_grade: brightness 52, contrast 55, saturation 48, temperature 62, exposure 52
  • tighten_pacing: "light"
  • set_transition: "crossfade" 500-700ms
  • audio_mix: music_volume 65, dialog_volume 90
  • speed_scene: 0.9-0.95

⚡ **TikTok / מהיר**:
  • color_grade: brightness 58, contrast 70, saturation 75, temperature 52, exposure 58
  • tighten_pacing: "aggressive"
  • set_transition: "cut" 0ms
  • audio_mix: music_volume 90, dialog_volume 75
  • speed_scene: 1.2-1.35

🗑️ **"הסר חלקים משעממים"**:
  • tighten_pacing: "medium" או "aggressive"
  • trim_scene / reject_scene לפי הצורך
  • speed_scene: 1.1-1.2 על סצנות בינוניות`;

const REASONING_INSTRUCTION = `הסבר עכשיו במשפטים קצרים ובעברית את ההחלטות האמנותיות שלך כבמאי — אילו פעולות תבצע ולמה. זה ההסבר שהמשתמש יראה בזמן אמת בזמן שאתה עורך. כתוב 3-5 משפטים מקצועיים, כמו במאי שמסביר את החזון. אל תפרט JSON, רק את החשיבה האמנותית.`;

const TOOLS = [{
  type: "function",
  function: {
    name: "apply_edits",
    description: "Apply a sequence of concrete editing operations.",
    parameters: {
      type: "object",
      properties: {
        reply: { type: "string", description: "Friendly Hebrew explanation (1-2 sentences) of what is being applied." },
        summary: { type: "string", description: "Short Hebrew label for the edit batch." },
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "color_grade", "color_preset", "trim_scene", "speed_scene",
                  "reorder_scenes", "reject_scene", "set_transition",
                  "audio_mix", "tighten_pacing",
                ],
              },
              brightness: { type: "number" },
              contrast: { type: "number" },
              saturation: { type: "number" },
              temperature: { type: "number" },
              exposure: { type: "number" },
              preset: { type: "string", enum: ["טבעי", "סינמטי", "וינטאג׳", "קר", "חם", "מונוכרום"] },
              scene_number: { type: "number" },
              trim_start_sec: { type: "number" },
              trim_end_sec: { type: "number" },
              playback_speed: { type: "number" },
              order: { type: "array", items: { type: "number" } },
              reason: { type: "string" },
              after_scene: { type: "number" },
              transition: { type: "string", enum: ["cut", "crossfade", "fade", "dissolve"] },
              duration_ms: { type: "number" },
              music_volume: { type: "number" },
              dialog_volume: { type: "number" },
              aggressiveness: { type: "string", enum: ["light", "medium", "aggressive"] },
            },
            required: ["type"],
            additionalProperties: false,
          },
        },
      },
      required: ["reply", "summary", "operations"],
      additionalProperties: false,
    },
  },
}];

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !LOVABLE_API_KEY) {
      return jsonResponse({ error: "Server not configured" }, 500);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const projectId: string = typeof body?.projectId === "string" ? body.projectId : "";
    const prompt: string = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const stage: string = typeof body?.stage === "string" ? body.stage : "editing";
    const activeScene: number = typeof body?.activeScene === "number" ? body.activeScene : 0;
    const currentColor = body?.currentColor ?? null;
    const history: Array<{ role: "user" | "assistant"; content: string }> =
      Array.isArray(body?.history) ? body.history.slice(-10) : [];

    if (!projectId) return jsonResponse({ error: "Missing projectId" }, 400);
    if (!prompt) return jsonResponse({ error: "Missing prompt" }, 400);

    const { data: project, error: projErr } = await userClient
      .from("projects")
      .select("id, name, type, genre, script, scenes_count, edit_instructions, color_adjustments")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();
    if (projErr || !project) return jsonResponse({ error: "Project not found" }, 404);

    const { data: scenes } = await userClient
      .from("scenes")
      .select("id, scene_number, status, scene_videos(id, file_name, angle_label)")
      .eq("project_id", projectId)
      .order("scene_number");

    const sceneSummary = (scenes || []).map((s: any) => ({
      scene_number: s.scene_number,
      status: s.status,
      videos: (s.scene_videos || []).map((v: any) => ({ id: v.id, angle: v.angle_label })),
    }));

    const projectContext = `
שלב נוכחי: ${stage}
סצנה פעילה: ${activeScene + 1}
מספר סצנות: ${project.scenes_count}
ז'אנר: ${project.genre || "לא צוין"}
תקציר סצנות: ${JSON.stringify(sceneSummary)}
התאמות צבע נוכחיות: ${JSON.stringify(currentColor || project.color_adjustments)}
תוכנית עריכה קיימת: ${project.edit_instructions ? "קיימת" : "אין"}
`;

    const baseMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: projectContext },
      ...history,
      { role: "user", content: prompt },
    ];

    // Build SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        };

        let reasoningText = "";

        try {
          // ===== PHASE 1: stream the director's reasoning =====
          const reasoningRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              stream: true,
              messages: [
                ...baseMessages,
                { role: "system", content: REASONING_INSTRUCTION },
              ],
            }),
          });

          if (!reasoningRes.ok || !reasoningRes.body) {
            if (reasoningRes.status === 429) { send("error", { error: "מגבלת קצב — נסה שוב בעוד רגע" }); controller.close(); return; }
            if (reasoningRes.status === 402) { send("error", { error: "נגמר הקרדיט ב-AI Gateway" }); controller.close(); return; }
            const t = await reasoningRes.text();
            console.error("Reasoning error:", reasoningRes.status, t);
            send("error", { error: "AI request failed" });
            controller.close();
            return;
          }

          const reader = reasoningRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, idx).trim();
              buffer = buffer.slice(idx + 1);
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const json = JSON.parse(payload);
                const delta = json.choices?.[0]?.delta?.content;
                if (typeof delta === "string" && delta.length > 0) {
                  reasoningText += delta;
                  send("reasoning", { delta });
                }
              } catch {
                // ignore parse errors on partial chunks
              }
            }
          }

          // ===== PHASE 2: structured tool call for operations =====
          const opsRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-pro",
              messages: [
                ...baseMessages,
                { role: "assistant", content: reasoningText || "אבצע את העריכה." },
                { role: "system", content: "כעת המר את החזון שתיארת לפעולות עריכה קונקרטיות בקריאה ל-apply_edits. ה-reply צריך להיות 1-2 משפטים קצרים בלבד." },
              ],
              tools: TOOLS,
              tool_choice: { type: "function", function: { name: "apply_edits" } },
            }),
          });

          if (!opsRes.ok) {
            if (opsRes.status === 429) { send("error", { error: "מגבלת קצב — נסה שוב בעוד רגע" }); controller.close(); return; }
            if (opsRes.status === 402) { send("error", { error: "נגמר הקרדיט ב-AI Gateway" }); controller.close(); return; }
            const t = await opsRes.text();
            console.error("Ops error:", opsRes.status, t);
            send("error", { error: "AI ops request failed" });
            controller.close();
            return;
          }

          const aiData = await opsRes.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          let parsed: any = null;
          if (toolCall?.function?.arguments) {
            try { parsed = JSON.parse(toolCall.function.arguments); }
            catch (e) { console.error("Failed to parse tool arguments", e); }
          }

          if (!parsed) {
            const text = aiData.choices?.[0]?.message?.content || reasoningText || "לא הצלחתי להבין את הבקשה.";
            send("operations", { reply: text, summary: "", operations: [] });
            send("done", {});
            controller.close();
            return;
          }

          // Persist
          try {
            await adminClient.from("projects").update({
              edit_instructions: {
                ...(project.edit_instructions as any || {}),
                last_ai_edit: {
                  prompt,
                  summary: parsed.summary,
                  operations: parsed.operations,
                  reasoning: reasoningText,
                  at: new Date().toISOString(),
                },
              },
            }).eq("id", projectId).eq("user_id", user.id);
          } catch (e) {
            console.warn("Could not persist last_ai_edit:", e);
          }

          send("operations", {
            reply: parsed.reply,
            summary: parsed.summary,
            operations: parsed.operations || [],
          });
          send("done", {});
          controller.close();
        } catch (e) {
          console.error("Stream error:", e);
          try { send("error", { error: e instanceof Error ? e.message : "Unknown error" }); } catch {}
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("ai-editor error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
