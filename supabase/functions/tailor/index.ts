// Supabase Edge Function: builds a resume from the user's saved profile,
// optionally tailored to a job posting (fetched from a URL or pasted text).
// Saves the result to the `resumes` table and returns it.
import Anthropic from "npm:@anthropic-ai/sdk@0.134.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.134.0/helpers/zod";
import { z } from "npm:zod@4.6.6";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const MODEL = "claude-opus-5-5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ResumeSchema = z.object({
  name: z.string(),
  headline: z.string(),
  contact: z.object({
    email: z.string(),
    phone: z.string(),
    location: z.string(),
    links: z.array(z.string()),
  }),
  summary: z.string(),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      location: z.string(),
      start: z.string(),
      end: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({ degree: z.string(), school: z.string(), year: z.string(), details: z.string() }),
  ),
  certifications: z.array(z.string()),
  projects: z.array(z.object({ name: z.string(), description: z.string() })),
});

const OutputSchema = z.object({
  resume: ResumeSchema,
  job_title: z.string(),
  company: z.string(),
  match_keywords: z.array(z.string()),
  gaps: z.array(z.string()),
  tips: z.array(z.string()),
});

const SYSTEM = `You are an expert resume writer and recruiter. You turn a candidate's raw background into a concise, achievement-focused, ATS-friendly resume.

Rules:
- Use only facts present in the candidate's profile. Never invent employers, titles, dates, degrees, certifications, or numbers. You may rephrase, reorder, merge, and emphasize.
- Write bullets as strong action verb + what was done + measurable result when the profile supports one.
- Keep it to what fits on one or two pages: the most relevant 3-6 bullets per role, recent roles first.
- Leave a field as an empty string or empty list when the profile has nothing for it.
- When a job posting is given, mirror its important keywords and priorities wherever the candidate's real experience supports them, lead with the most relevant experience and skills, and write the headline and summary for that role.
- In "gaps", list requirements from the posting the profile does not show evidence for. In "tips", give short, specific suggestions for the candidate (for example, details worth adding to their profile). With no posting, set job_title and company to empty strings and use "gaps" for weak spots in the profile.`;

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

async function fetchJobPosting(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Job link must be http(s)");
  const res = await fetch(parsed, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`The job site returned ${res.status}`);
  const text = htmlToText(await res.text());
  return text.slice(0, 60000);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Please sign in" }, 401);

  let body: { job_url?: string; job_text?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { data: profileRow, error: profileErr } = await supabase
    .from("profiles")
    .select("data")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr) return json({ error: profileErr.message }, 500);
  if (!profileRow) return json({ error: "Fill in your profile first" }, 400);

  const jobUrl = body.job_url?.trim() || null;
  let jobText = body.job_text?.trim() || "";
  if (!jobText && jobUrl) {
    try {
      jobText = await fetchJobPosting(jobUrl);
    } catch (e) {
      return json(
        { error: `Couldn't read that job link (${(e as Error).message}). Paste the job description instead.`, needs_text: true },
        422,
      );
    }
    if (jobText.length < 300) {
      return json(
        { error: "That page didn't contain a readable job description (the site may require sign-in). Paste the job description instead.", needs_text: true },
        422,
      );
    }
  }
  const tailored = Boolean(jobText);

  const prompt = [
    "<candidate_profile>",
    JSON.stringify(profileRow.data, null, 2),
    "</candidate_profile>",
    tailored
      ? `<job_posting${jobUrl ? ` url="${jobUrl}"` : ""}>\n${jobText}\n</job_posting>\n\nWrite the best possible resume for this candidate, tailored to this job posting. The posting text may include unrelated page content; ignore it.`
      : "Write the best possible general-purpose master resume for this candidate.",
  ].join("\n");

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
    if (message.stop_reason === "refusal") return json({ error: "The AI declined this request. Try editing the job text." }, 422);
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No output from the model");
    parsed = OutputSchema.parse(JSON.parse(textBlock.text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Too many requests right now, try again in a minute." }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `AI service error: ${e.message}` }, 502);
    return json({ error: (e as Error).message }, 500);
  }

  const title = tailored
    ? [parsed.job_title, parsed.company].filter(Boolean).join(" at ") || "Tailored resume"
    : "Master resume";

  const { data: saved, error: saveErr } = await supabase
    .from("resumes")
    .insert({
      user_id: user.id,
      kind: tailored ? "tailored" : "master",
      title,
      company: parsed.company || null,
      job_url: jobUrl,
      job_description: tailored ? jobText : null,
      content: parsed.resume,
      notes: { match_keywords: parsed.match_keywords, gaps: parsed.gaps, tips: parsed.tips },
    })
    .select()
    .single();
  if (saveErr) return json({ error: saveErr.message }, 500);

  return json({ resume: saved });
});
