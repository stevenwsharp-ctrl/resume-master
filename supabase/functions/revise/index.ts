// Supabase Edge Function: rewrites one saved resume following the user's own
// request ("make the summary shorter", a pasted detail to work in, ...).
// The previous version is pushed onto the row's history so it can be undone.
import Anthropic from "npm:@anthropic-ai/sdk@0.134.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.134.0/helpers/zod";
import { z } from "npm:zod@4.6.6";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { cors, FEDERAL_RULES, json, MODEL, ResumeSchema, WRITING_RULES } from "../_shared/resume.ts";
import type { Format } from "../_shared/resume.ts";

const MAX_HISTORY = 15;
const MAX_REQUEST = 20000;

const OutputSchema = z.object({
  resume: ResumeSchema,
  change_summary: z.string(),
});

const SYSTEM = `You are an expert resume writer revising a candidate's existing resume. The candidate has read it and asked for specific changes.

Rules:
- Make the changes the candidate asks for. Keep everything they didn't ask to change as it is, unless a change forces it (for example, trimming to fit a page limit).
- The candidate's request may include new facts or pasted text (a new job, a number, a certification). Those are the candidate's own words, so you may use them. Still never make up anything beyond what the candidate, their profile, or their previous resume says.
- If the request asks for something that would need invented facts, do what you honestly can and say what you couldn't do in change_summary.
${WRITING_RULES}
- Keep it ATS-friendly: plain text, no first person, bullets that open with an action verb, keywords only where the candidate's real experience backs them, and acronyms spelled out on first use.
- In change_summary, tell the candidate in one to three plain sentences what you changed.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Please sign in" }, 401);

  let body: { resume_id?: string; request?: string; format?: Format; pages?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const request = body.request?.trim() ?? "";
  if (!body.resume_id) return json({ error: "Which resume?" }, 400);
  if (!request) return json({ error: "Type what you'd like changed first." }, 400);
  if (request.length > MAX_REQUEST) return json({ error: "That request is very long. Trim it a little and try again." }, 400);

  // Row-level security limits both reads to the signed-in user's own data.
  const [{ data: row, error: rowErr }, { data: profileRow }] = await Promise.all([
    supabase.from("resumes").select("*").eq("id", body.resume_id).maybeSingle(),
    supabase.from("profiles").select("data").eq("user_id", user.id).maybeSingle(),
  ]);
  if (rowErr) return json({ error: rowErr.message }, 500);
  if (!row) return json({ error: "Resume not found" }, 404);

  const format: Format = body.format === "federal" || body.format === "standard" ? body.format : row.format;
  const { reference_resume: reference, ...profile } = (profileRow?.data ?? {}) as Record<string, unknown> & {
    reference_resume?: { text?: string };
  };

  const prompt = [
    "<current_resume>",
    JSON.stringify(row.content, null, 2),
    "</current_resume>",
    `<candidate_profile>\n${JSON.stringify(profile, null, 2)}\n</candidate_profile>`,
    reference?.text ? `<previous_resume>\n${reference.text}\n</previous_resume>` : "",
    row.job_description ? `<job_posting>\n${row.job_description}\n</job_posting>\nThis resume is tailored to the job posting above; keep it tailored.` : "",
    typeof body.pages === "number" ? `The current resume prints at about ${body.pages.toFixed(1)} pages.` : "",
    format === "federal"
      ? FEDERAL_RULES + (row.format !== "federal" ? "\nThe current resume is in standard format: convert it to the federal format." : "")
      : "",
    `<candidate_request>\n${request}\n</candidate_request>`,
    "Rewrite the resume following the candidate's request.",
  ].filter(Boolean).join("\n\n");

  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
  let parsed: z.infer<typeof OutputSchema>;
  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(OutputSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") return json({ error: "The AI declined this request. Try wording it differently." }, 422);
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No output from the model");
    parsed = OutputSchema.parse(JSON.parse(textBlock.text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Too many requests right now, try again in a minute." }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `AI service error: ${e.message}` }, 502);
    return json({ error: (e as Error).message }, 500);
  }

  const history = [
    ...((row.history as unknown[]) ?? []),
    { content: row.content, format: row.format, saved_at: row.updated_at, reason: `Before: ${request.slice(0, 200)}` },
  ].slice(-MAX_HISTORY);

  const { data: saved, error: saveErr } = await supabase
    .from("resumes")
    .update({ content: parsed.resume, format, history, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .select()
    .single();
  if (saveErr) return json({ error: saveErr.message }, 500);

  return json({ resume: saved, change_summary: parsed.change_summary });
});
