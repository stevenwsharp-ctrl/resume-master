// Shared by the functions that write resumes (`tailor` and `revise`): the
// resume shape, the writing rules, and the federal two-page rules.
import { z } from "npm:zod@4.6.6";

export const MODEL = "claude-opus-5-5";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export const ResumeSchema = z.object({
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
      // Federal resumes need these; empty strings otherwise.
      hours_per_week: z.string(),
      series_grade: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({ degree: z.string(), school: z.string(), year: z.string(), details: z.string() }),
  ),
  certifications: z.array(z.string()),
  projects: z.array(z.object({ name: z.string(), description: z.string() })),
});

export type Format = "standard" | "federal";

export const WRITING_RULES = `- Use only facts present in the candidate's profile, their previous resume (when one is given), and anything the candidate tells you directly. Never invent employers, titles, dates, degrees, certifications, hours, grades, or numbers. You may rephrase, reorder, merge, and emphasize.
- Write bullets as strong action verb + what was done + measurable result when the facts support one.
- Keep it to what fits on one or two pages: the most relevant 3-6 bullets per role, recent roles first.
- The previous resume is reference material: mine it for skills, tools, accomplishments and numbers the profile doesn't mention. Where the two disagree, the profile is newer and wins. Don't copy the old resume's wording when you can write it better.
- Leave a field as an empty string or empty list when there is nothing for it. For a standard (non-federal) resume, leave hours_per_week and series_grade empty.`;

// From OPM's guidance on the two-page limit for federal resumes (Merit Hiring
// Plan, in force on USAJOBS since 2025-09-27):
// https://www.opm.gov/policy-data-oversight/hiring-information/merit-hiring-plan-resources/agency-guidance-on-the-two-page-limit-on-resume-length/
export const FEDERAL_RULES = `This is a FEDERAL resume (USAJOBS / Title 5). OPM's rules apply and override any other date-format or length guidance; a resume longer than two pages is rejected without review:
- HARD LIMIT: two US letter pages at 10-point body text with 0.5-inch margins. When in doubt, cut. Drop outdated or unrelated experience, keep the most relevant and recent roles, and use fewer, tighter bullets.
- For every job: title and employer; for federal jobs, the series and grade in series_grade (for example "GS-0343-12"); start and end dates as MM/YYYY (for example 05/2019 and 08/2022, or "Present"); and hours worked per week in hours_per_week (for example "40"). Take these only from the candidate's facts; leave a field empty if they never gave it, and mention what's missing in the notes.
- Write each job's bullets to show the candidate can do the specific duties and skills in the announcement at the required level. Mirror the announcement's language and emphasize skills and competencies, in concise, results-focused statements.
- Education, when relevant or required: school, degree type, completion date, and cumulative GPA (put the GPA in details) when the candidate gave one.
- Certifications and licenses with their type and date, when relevant.
- When relevant and given: current security clearance, job-related training, language skills, organizations and affiliations, publications, and eligibility for special hiring programs (veterans' preference, military spouse, Schedule A). Put these in certifications, skills or projects as fits; don't invent them.
- Contact: name, email and phone are required.`;

export function isFederalPosting(url: string | null, text: string): boolean {
  if (url && /(^|\.)usajobs\.gov$/i.test(safeHost(url))) return true;
  return /usajobs|\bGS-\d{1,2}\b|\bGS-\d{4}\b|merit hiring plan/i.test(text);
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
