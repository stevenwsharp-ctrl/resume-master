export interface ProfileExperience {
  title: string
  company: string
  location: string
  start: string
  end: string
  description: string
}

export interface ProfileEducation {
  degree: string
  school: string
  year: string
  details: string
}

export interface ProfileProject {
  name: string
  description: string
}

// Everything the user tells us about themselves. Free text is fine:
// the AI turns it into polished resume language.
export interface Profile {
  name: string
  headline: string
  email: string
  phone: string
  location: string
  links: string
  background: string
  skills: string
  experience: ProfileExperience[]
  education: ProfileEducation[]
  certifications: string
  projects: ProfileProject[]
  extra: string
  // Text of a resume the user uploaded. The AI uses it as extra source
  // material (skills, wins, numbers) on top of the fields above.
  reference_resume?: ReferenceResume
}

export interface ReferenceResume {
  filename: string
  text: string
  uploaded_at: string
}

export const emptyProfile: Profile = {
  name: '',
  headline: '',
  email: '',
  phone: '',
  location: '',
  links: '',
  background: '',
  skills: '',
  experience: [],
  education: [],
  certifications: '',
  projects: [],
  extra: '',
}

export interface ResumeContent {
  name: string
  headline: string
  contact: { email: string; phone: string; location: string; links: string[] }
  summary: string
  skills: { category: string; items: string[] }[]
  experience: {
    title: string
    company: string
    location: string
    start: string
    end: string
    bullets: string[]
  }[]
  education: { degree: string; school: string; year: string; details: string }[]
  certifications: string[]
  projects: { name: string; description: string }[]
}

export interface AtsKeyword {
  term: string
  importance: 'required' | 'preferred' | 'bonus'
  used: boolean
}

export interface ResumeNotes {
  match_keywords: string[]
  gaps: string[]
  tips: string[]
  // Missing on resumes made before the ATS check existed.
  ats?: {
    keywords: AtsKeyword[]
    modernized: { from: string; to: string }[]
    trending: string[]
  }
}

export interface ResumeRow {
  id: string
  user_id: string
  kind: 'master' | 'tailored'
  title: string
  company: string | null
  job_url: string | null
  job_description: string | null
  content: ResumeContent
  notes: ResumeNotes | null
  created_at: string
  updated_at: string
}
