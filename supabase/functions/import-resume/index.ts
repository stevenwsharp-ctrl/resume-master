// Supabase Edge Function: reads a user's existing resume (its text, or
// screenshots of it) and
// sorts it into the profile fields the site uses, so the profile page can be
// prefilled from it. Nothing is saved here; the user reviews it first.
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

const ProfileSchema = z.object({
  name: z.string(),
  headline: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.string(),
  background: z.string(),
  skills: z.string(),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      location: z.string(),
      start: z.string(),
      end: z.string(),
      description: z.string(),
      hours_per_week: z.string(),
      series_grade: z.string(),
    }),
  ),
  education: z.array(
    z.object({ degree: z.string(), school: z.string(), year: z.string(), details: z.string() }),
  ),
  certifications: z.string(),
  projects: z.array(z.object({ name: z.string(), description: z.string() })),
  extra: z.string(),
});

// For screenshots the model also transcribes the resume, so the site can keep
// its text as reference material.
const ImageOutputSchema = ProfileSchema.extend({ resume_text: z.string() });

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_IMAGES = 5;

const SYSTEM = `You read a candidate's existing resume and copy its contents into structured profile fields. Be faithful: copy facts, numbers, dates and wording from the resume; never add anything that is not in it.

Field guide:
- headline: the role or title the resume presents the candidate as (or their most recent title).
- links: one URL per line (LinkedIn, GitHub, portfolio...).
- background: the resume's summary or objective, as written. Empty if there is none.
- skills: every skill, tool, technology and language listed, comma separated.
- experience: one entry per role, most recent first. description holds that role's bullets, one per line starting with "- ". hours_per_week and series_grade (like "GS-0343-12") only when the resume states them, as federal resumes do.
- education, projects: one entry per item.
- certifications: one per line.
- extra: awards, volunteering, languages, publications, clearances and anything else that doesn't fit above.
Use empty strings and empty lists for anything the resume doesn't contain.
When the resume is given as images (screenshots or photos of pages, in order), also fill resume_text with a faithful plain-text transcription of the whole resume.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return json({ error: "Please sign in" }, 401);

  let body: { text?: unknown; images?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // fall through to the empty-resume error
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 50000) : "";
  const images = (Array.isArray(body.images) ? body.images : []).filter(
    (img): img is { media_type: ImageType; data: string } =>
      IMAGE_TYPES.includes(img?.media_type) && typeof img?.data === "string" && img.data.length > 0,
  );
  if (images.length > MAX_IMAGES) return json({ error: `Up to ${MAX_IMAGES} screenshots at a time, please.` }, 400);
  if (!images.length && text.length < 100) {
    return json({ error: "That resume looks empty. Try another file or paste the text." }, 400);
  }

  const content: Anthropic.ContentBlockParam[] = images.length
    ? [
      ...images.map((img) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: img.media_type, data: img.data },
      })),
      { type: "text", text: "These images are my resume. Read them into the profile fields and transcribe the full text." },
    ]
    : [{ type: "text", text: `<resume>\n${text}\n</resume>` }];
  const schema = images.length ? ImageOutputSchema : ProfileSchema;

  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
  try {
    const message = await anthropic.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        thinking: { type: "adaptive" },
        output_config: { effort: "low", format: zodOutputFormat(schema) },
        system: SYSTEM,
        messages: [{ role: "user", content }],
      })
      .finalMessage();
    if (message.stop_reason === "refusal") return json({ error: "The AI couldn't read this resume." }, 422);
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No output from the model");
    const { resume_text, ...profile } = schema.parse(JSON.parse(textBlock.text)) as z.infer<typeof ProfileSchema> & {
      resume_text?: string;
    };
    if (images.length && !profile.name && !profile.experience.length && !resume_text?.trim()) {
      return json({ error: "Couldn't find a resume in that image. Try a clearer screenshot." }, 422);
    }
    return json({ profile, text: resume_text?.trim() || text });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Too many requests right now, try again in a minute." }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `AI service error: ${e.message}` }, 502);
    return json({ error: (e as Error).message }, 500);
  }
});
