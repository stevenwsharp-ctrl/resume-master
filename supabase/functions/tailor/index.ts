// Supabase Edge Function: builds a resume from the user's saved profile,
// optionally tailored to a job posting (fetched from a URL or pasted text).
// Saves the result to the `resumes` table and returns it.
import Anthropic from "npm:@anthropic-ai/sdk@0.134.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.134.0/helpers/zod";
import { z } from "npm:zod@4.6.6";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { cors, FEDERAL_RULES, isFederalPosting, json, MODEL, ResumeSchema } from "../_shared/resume.ts";

const OutputSchema = z.object({
  resume: ResumeSchema,
  job_title: z.string(),
  company: z.string(),
  match_keywords: z.array(z.string()),
  gaps: z.array(z.string()),
  tips: z.array(z.string()),
  ats: z.object({
    // The terms an ATS or recruiter would search for: from the posting when there is one,
    // otherwise the current in-demand terms for the candidate's field and level.
    keywords: z.array(
      z.object({ term: z.string(), importance: z.enum(["required", "preferred", "bonus"]), used: z.boolean() }),
    ),
    // Places where the candidate's own wording was swapped for today's standard term.
    modernized: z.array(z.object({ from: z.string(), to: z.string() })),
    // Current, in-demand skills for this field that the profile doesn't show. Suggestions only.
    trending: z.array(z.string()),
  }),
});

const SYSTEM = `You are an expert resume writer, recruiter, and applicant tracking system (ATS) specialist. You turn a candidate's raw background into a concise, achievement-focused resume that parses cleanly in ATS software (Workday, Greenhouse, Lever, iCIMS, Taleo), ranks well in keyword searches, and reads well to a human reviewer in a six-second skim.

Truthfulness (never break these):
- Use only facts present in the candidate's profile and their previous resume (when one is given). Never invent employers, titles, dates, degrees, certifications, tools, skills, or numbers. You may rephrase, reorder, merge, and emphasize.
- A keyword goes in the resume only when the candidate's real experience supports it. Requirements they can't back up go in "gaps"; in-demand skills they don't show go in ats.trending. Never stuff keywords into the resume, hide them, or list a skill just because the posting wants it.
- The previous resume is reference material: mine it for skills, tools, accomplishments and numbers the profile doesn't mention, and use them where relevant. Where the two disagree, the profile is newer and wins. Don't copy the old resume's wording when you can write it better.
- Leave a field as an empty string or empty list when the profile has nothing for it. Fill hours_per_week and series_grade only for a federal resume, and only from the candidate's facts.

Keywords and current terminology:
- When a job posting is given, pull out the hard skills, tools, methods, certifications and role titles an ATS or recruiter would search for, and use the posting's exact wording for the ones the candidate's experience supports (e.g. the posting says "stakeholder management" and the profile says "worked with business owners": write "stakeholder management").
- Put each important keyword where it carries weight: the headline, the summary, the skills section, and in context inside at least one bullet that shows it being used. A keyword that appears only in a skills list is weaker than one backed by a bullet.
- Write an acronym together with its full form the first time it appears (e.g. "Search Engine Optimization (SEO)"), since ATS searches may use either.
- Use today's industry terminology. Where the candidate describes something in dated or informal words, use the current standard term recruiters search for, as long as it means the same thing (e.g. "data processing" → "ETL pipelines" only if that's what it was; "internet marketing" → "digital marketing"; "help desk" → "IT support / service desk"). Record each swap in ats.modernized. Don't upgrade the substance: "used Excel" does not become "data science".
- Draw on your knowledge of what employers in the candidate's field currently ask for to choose which of their real skills to feature, and list the in-demand ones they lack (most valuable first, at most 8) in ats.trending.
- In ats.keywords, list the 10-25 terms that matter most for this role (from the posting; with no posting, the terms recruiters most often search for in the candidate's target field and level), mark each as required, preferred or bonus, and set used to true only when it appears in the resume you wrote. match_keywords is the list of terms you used.

What reviewers and ATS reward:
- Headline: a plain role title a recruiter would search for (matching the posting's title when the candidate's experience fits it), optionally followed by two or three core specialties. No slogans.
- Summary: 2-4 sentences, no first person ("I", "my"), stating years of experience, specialty, top skills and one or two headline results.
- Bullets: start with a strong past-tense action verb (present tense for a current role), then what was done, then the result. Quantify (money, %, time, volume, team size, users) whenever the profile supports a number; never estimate one. One to two lines each, no bullets that just restate the job title, no repeated opening verbs within a role, no filler ("responsible for", "duties included", "helped with").
- Skills: group into a few plain categories (e.g. "Technical", "Tools & Platforms", "Methods", "Languages"), most relevant first, no ratings or proficiency bars, no soft-skill clichés ("team player", "hard worker") — show soft skills in bullets instead.
- Dates: one consistent format, "Mon YYYY" (e.g. "Mar 2021"), and "Present" for a current role. Job titles exactly as held; when an internal title is obscure, you may add the common equivalent in parentheses.
- Length: one page for under ~8 years of experience, at most two pages otherwise. Cut older or less relevant roles to 1-2 bullets rather than adding padding. Omit anything older than ~15 years unless it is relevant.
- Plain text only: no tables, columns, emojis, symbols as bullets, or special characters in place of words. Spell out "and" instead of "&" in prose.

Output:
- When a job posting is given, lead with the most relevant experience and skills, and write the headline and summary for that role.
- In "gaps", list requirements from the posting the profile does not show evidence for. In "tips", give short, specific suggestions for the candidate (for example, numbers or tools worth adding to their profile, or a certification worth getting). With no posting, set job_title and company to empty strings and use "gaps" for weak spots in the profile.`;

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

  let body: { job_url?: string; job_text?: string; federal?: boolean };
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
  const format = body.federal || (tailored && isFederalPosting(jobUrl, jobText)) ? "federal" : "standard";

  const { reference_resume: reference, ...profile } = profileRow.data as Record<string, unknown> & {
    reference_resume?: { filename?: string; text?: string };
  };

  const prompt = [
    "<candidate_profile>",
    JSON.stringify(profile, null, 2),
    "</candidate_profile>",
    reference?.text ? `<previous_resume>\n${reference.text}\n</previous_resume>` : "",
    tailored
      ? `<job_posting${jobUrl ? ` url="${jobUrl}"` : ""}>\n${jobText}\n</job_posting>\n\nWrite the best possible resume for this candidate, tailored to this job posting. The posting text may include unrelated page content; ignore it.`
      : "Write the best possible general-purpose master resume for this candidate, aimed at the kind of role their headline and recent experience point to.",
    format === "federal" ? `\n${FEDERAL_RULES}` : "",
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
    : format === "federal" ? "Federal master resume" : "Master resume";

  const { data: saved, error: saveErr } = await supabase
    .from("resumes")
    .insert({
      user_id: user.id,
      kind: tailored ? "tailored" : "master",
      title,
      company: parsed.company || null,
      job_url: jobUrl,
      job_description: tailored ? jobText : null,
      format,
      content: parsed.resume,
      notes: { match_keywords: parsed.match_keywords, gaps: parsed.gaps, tips: parsed.tips, ats: parsed.ats },
    })
    .select()
    .single();
  if (saveErr) return json({ error: saveErr.message }, 500);

  return json({ resume: saved });
});
