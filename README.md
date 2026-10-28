# Resume Master

Keep your resume ready to go. Tell the site about yourself once, get a polished resume, then paste any job link to get a version tailored to that role. Every resume stays saved in your account.

## How it works

- **Website**: React + Vite, hosted free on GitHub Pages and deployed automatically on every push to `main` (`.github/workflows/deploy.yml`).
- **Accounts and storage**: Supabase (free tier). Email/password sign-in, plus two tables, `profiles` and `resumes`, protected by row-level security so each person only ever sees their own data (`supabase/migrations`).
- **AI**: a Supabase Edge Function (`supabase/functions/tailor`) reads the user's profile, fetches the job posting from the link (or uses pasted text), asks Claude to write the resume, and saves the result. The Claude API key lives only in Supabase, never in the website.
- **Old resume import**: on the profile page, users can upload an existing resume (PDF, .docx or text). The browser pulls the text out, `supabase/functions/import-resume` has Claude sort it into profile fields to prefill anything empty, and the text is kept with the profile so `tailor` can draw on it as extra source material.

## One-time setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free). From *Project Settings → API*, copy the **Project URL** and the **anon public** key. Note the **project ref** (the `xxxx` in `https://xxxx.supabase.co`) and your **database password**.
2. **Get a Claude API key** at [console.anthropic.com](https://console.anthropic.com) and add some credit. Each resume costs roughly 5 to 15 cents.
3. **Create a Supabase access token** at *supabase.com → Account → Access Tokens*.
4. **Add these to this GitHub repo** under *Settings → Secrets and variables → Actions*:
   - Variables tab: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_REF`
   - Secrets tab: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `ANTHROPIC_API_KEY`
5. **Turn on GitHub Pages**: *Settings → Pages → Source: GitHub Actions*.
6. **Run both workflows** from the *Actions* tab (*Deploy database and AI function to Supabase*, then *Deploy site to GitHub Pages*). After that they run on their own whenever code changes.
7. **Tell Supabase where the site lives**: *Authentication → URL Configuration*, set Site URL to `https://<your-github-username>.github.io/resume-master/` and add the same URL to Redirect URLs.

The site is then live at `https://<your-github-username>.github.io/resume-master/`.

## Local development

```bash
cp .env.example .env.local   # fill in your Supabase URL and anon key
npm install
npm run dev
```

## Notes

- Some job sites (LinkedIn, Indeed, sites that need sign-in) block automated reading. When a link can't be read, the site asks the user to paste the job description instead.
- The AI is told to use only facts from the user's profile and never invent employers, dates, degrees or numbers.
- The model is set in `supabase/functions/tailor/index.ts` and `supabase/functions/import-resume/index.ts` (`MODEL`).
