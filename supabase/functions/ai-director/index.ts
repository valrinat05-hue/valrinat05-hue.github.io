import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STYLE_PROFILES: Record<string, { description: string; pacing: string; transitions: string; trimRules: string }> = {
  cinematic: {
    description: "סגנון קולנועי - שוטים ארוכים, מעברים חלקים, בניית מתח דרמטי",
    pacing: "Use longer shots (4-8 seconds minimum). Build tension gradually. Prefer wide establishing shots followed by close-ups. Use slow dissolves and fades.",
    transitions: "Prefer dissolve, crossfade, and slow fades. Use hard cuts only for dramatic impact.",
    trimRules: "Keep shots longer for breathing room. Trim only dead air and technical issues. Prefer clips with cinematic framing, depth of field, and dramatic lighting.",
  },
  tiktok: {
    description: "סגנון TikTok - חיתוכים מהירים, אנרגיה גבוהה, קליפים קצרים",
    pacing: "Fast cuts every 1-3 seconds. High energy. Jump cuts are encouraged. Keep only the most impactful moments from each clip.",
    transitions: "Use hard cuts almost exclusively. Occasional whip-pan or flash transition. No slow dissolves.",
    trimRules: "Aggressively trim to only the peak moments. Remove any slow buildup. Prefer clips with strong motion, facial expressions, reactions, and dynamic movement.",
  },
  emotional: {
    description: "סגנון סיפורי רגשי - בניית עלילה, רגעים אינטימיים, חיבור רגשי",
    pacing: "Mix of medium and slow pacing (3-6 seconds per shot). Build emotional arc. Start quiet, build to climax, resolve gently.",
    transitions: "Use crossfade for emotional transitions. Dissolve for time passage. Gentle fades to black between acts.",
    trimRules: "Keep intimate moments, reactions, and emotional peaks. Trim technical issues but preserve authentic pauses and reactions. Prefer clips showing faces, emotions, human connection.",
  },
};

function buildError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return buildError("יש להתחבר כדי להשתמש ב-AI Director", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) return buildError("Supabase secrets are missing", 500);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return buildError("לא נמצא משתמש מחובר", 401);
    const userId = user.id;

    const body = await req.json().catch(() => null);
    const projectId = typeof body?.projectId === "string" ? body.projectId : "";
    const editingStyle = typeof body?.editingStyle === "string" && STYLE_PROFILES[body.editingStyle]
      ? body.editingStyle
      : "cinematic";

    if (!projectId) return buildError("Missing projectId", 400);

    const styleProfile = STYLE_PROFILES[editingStyle];

    // Fetch project
    const { data: project, error: projErr } = await userClient
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();
    if (projErr || !project) return buildError("Project not found", 404);

    // Fetch scenes with videos
    const { data: scenes } = await userClient
      .from("scenes")
      .select("*, scene_videos(*)")
      .eq("project_id", projectId)
      .order("scene_number");
    if (!scenes || scenes.length === 0) return buildError("No scenes found", 400);

    // Build detailed metadata for AI analysis
    const sceneSummary = scenes.map((s: any) => ({
      scene_number: s.scene_number,
      status: s.status,
      video_count: s.scene_videos?.length || 0,
      videos: (s.scene_videos || []).map((v: any) => ({
        id: v.id,
        file_name: v.file_name,
        angle: v.angle_label,
      })),
    }));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return buildError("AI not configured", 500);

    const systemPrompt = `You are an expert film editor and director AI. You analyze video project metadata and create DETAILED, PRECISE editing instructions that can be executed automatically.

Your job is to create a professional edit that feels ${editingStyle === "tiktok" ? "fast-paced and energetic" : editingStyle === "emotional" ? "emotionally compelling" : "cinematic and polished"}.

EDITING STYLE: ${styleProfile.description}
PACING RULES: ${styleProfile.pacing}
TRANSITION RULES: ${styleProfile.transitions}
CLIP SELECTION: ${styleProfile.trimRules}

CRITICAL RULES FOR SMART EDITING:
1. HIGHLIGHT DETECTION: For each clip, identify the strongest segment. Estimate where the "best moment" is (faces, motion, emotion, peak action).
2. TRIM AGGRESSIVELY: Remove weak openings, dead endings, repeated content. Suggest precise trim_start_sec and trim_end_sec for each clip.
3. CLIP RANKING: Rate each clip 1-10 for quality. Only include clips rated 6+ in the final edit.
4. STORY FLOW: Arrange clips to tell a coherent story with beginning, middle, and end.
5. REPETITION REMOVAL: If multiple clips show similar content, pick only the strongest one.

You MUST respond with a valid JSON object (no markdown, no code blocks) with this EXACT structure:
{
  "summary": "Brief overall direction summary in Hebrew",
  "mood": "The mood/tone for the film (in Hebrew)",
  "pacing": "${editingStyle === "tiktok" ? "fast" : editingStyle === "emotional" ? "dynamic" : "slow"}",
  "editing_style": "${editingStyle}",
  "total_estimated_duration_sec": 120,
  "scene_plan": [
    {
      "scene_number": 1,
      "selected_video_id": "uuid of best video",
      "selected_angle": "angle label",
      "quality_score": 8,
      "reason": "Why this clip was chosen (Hebrew)",
      "trim_start_sec": 2.5,
      "trim_end_sec": 15.0,
      "highlight_description": "Description of the best moment in this clip (Hebrew)",
      "transition_in": "none",
      "transition_out": "crossfade",
      "transition_duration_ms": 500,
      "playback_speed": 1.0,
      "notes": "Direction notes (Hebrew)"
    }
  ],
  "rejected_clips": [
    {
      "scene_number": 1,
      "video_id": "uuid",
      "reason": "Why rejected (Hebrew)",
      "quality_score": 3
    }
  ],
  "story_arc": {
    "act1_scenes": [1],
    "act2_scenes": [2, 3],
    "act3_scenes": [4],
    "climax_scene": 3
  },
  "overall_notes": "Final notes for the editor (Hebrew)"
}`;

    const userPrompt = `Analyze this video project and create a professional ${editingStyle} edit plan:

Project: "${project.name}"
Type: ${project.type}
Genre: ${project.genre || "not specified"}
Script: ${project.script || "no script provided"}
Total Scenes: ${scenes.length}

Scene Details:
${JSON.stringify(sceneSummary, null, 2)}

Create a detailed, precise editing plan. Choose the strongest clips, define exact trim points, remove weak/repetitive content, arrange into a compelling story, and set the mood and pacing for a "${editingStyle}" style edit. Respond in Hebrew.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) return buildError("Rate limit exceeded, try again later", 429);
      if (status === 402) return buildError("Credits exhausted", 402);
      const errText = await aiResponse.text();
      console.error("AI error:", status, errText);
      return buildError("AI analysis failed", 500);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response
    let editPlan: any;
    try {
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
      editPlan = JSON.parse(jsonStr);
    } catch {
      editPlan = {
        summary: rawContent,
        mood: "לא ניתן לנתח",
        pacing: "medium",
        editing_style: editingStyle,
        total_estimated_duration_sec: 0,
        scene_plan: [],
        rejected_clips: [],
        story_arc: { act1_scenes: [], act2_scenes: [], act3_scenes: [], climax_scene: 0 },
        overall_notes: rawContent,
      };
    }

    // Ensure editing_style is set
    editPlan.editing_style = editingStyle;

    // Save to database
    const { error: updateErr } = await adminClient
      .from("projects")
      .update({ edit_instructions: editPlan })
      .eq("id", projectId)
      .eq("user_id", userId);
    if (updateErr) console.error("Save error:", updateErr);

    return new Response(JSON.stringify({ plan: editPlan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-director error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
