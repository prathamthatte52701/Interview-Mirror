# InterviewMirror AI

An AI mock-interview platform. You pick a role, difficulty, and interviewer personality, then do a real spoken (or typed) interview against an AI interviewer. It asks questions, listens to your answers, scores you on relevance/clarity/structure/specificity/confidence, adapts its next question based on how you did, and gives you a full report at the end — radar chart, strengths/weaknesses, a hiring verdict, and a PDF export.

Live demo: https://im-ai.onrender.com

---

## What it actually is (in plain words)

Two apps talking to each other:

- **Client** — a React single-page app. No page reloads; it fakes routing itself by watching the browser URL.
- **Server** — an Express API. It owns the question bank, talks to Google Gemini for the "smart" parts, and falls back to a hand-written scoring algorithm when there's no Gemini key (or Gemini fails).

Everything about "how good was your answer" happens on the server, never in the browser — the client just records audio/video, sends it up, and renders whatever comes back.

---

## Tech stack

**Client**
| Piece | What it's for |
|---|---|
| React 18 + Vite 5 | UI + dev/build tooling |
| Plain CSS (no Tailwind) | one stylesheet per page family (`auth.css`, `global.css`, `landing.css`) |
| `lucide-react` | every icon in the app |
| `recharts` | the radar chart + round-by-round line chart on the results page |
| `jspdf` | builds the downloadable PDF report client-side, no server round trip |
| Web Speech API (`SpeechRecognition` + `speechSynthesis`) — native browser API, not a package | speech-to-text for your answers, text-to-speech for the AI interviewer's voice |
| `getUserMedia` — native browser API | camera feed for the presence panel |

> `framer-motion` and `html2canvas` are listed in `package.json` but not actually imported anywhere in the code — leftover dependencies, safe to ignore or remove.

**Server**
| Piece | What it's for |
|---|---|
| Node.js + Express 4 | the API |
| MongoDB + Mongoose | users, sessions, Indian cities list |
| `@google/genai` (Gemini `2.5-flash`) | generates interview questions, scores answers, writes the end-of-session summary |
| `jsonwebtoken` + `bcryptjs` | login tokens + password hashing |
| `multer` | resume file upload |
| `nanoid` | short session IDs |

No AI framework, no queue, no Redis — it's a fairly small Express app.

---

## Project layout

```
IM AI/
├── client/
│   └── src/
│       ├── pages/        AuthPage, ForgotPasswordPage, LandingPage, SetupPage,
│       │                 InterviewPage, DashboardPage, HistoryPage, ProfilePage,
│       │                 TermsPage, PrivacyPage, ContactPage
│       ├── components/   InterviewerStage, AnswerComposer, AnalysisPanel,
│       │                 PresencePanel, TranscriptPanel, ScoreRing, TimerRing, ...
│       ├── hooks/        useSpeech.js (STT/TTS), usePresence.js (camera panel)
│       ├── lib/          auth.js (client-side validation + calls), storage.js
│       ├── services/     api.js (fetch wrapper, auto-logout on 401)
│       └── styles/       auth.css, global.css, landing.css
└── server/
    ├── routes/           authRoutes.js, interviewRoutes.js, cityRoutes.js
    ├── lib/              sessionEngine.js (the actual interview brain),
    │                     questionBank.js, scoring.js (heuristic grader),
    │                     aiProvider.js (Gemini calls), env.js
    ├── models/           User.js, InterviewSession.js, City.js  (Mongoose)
    ├── middleware/        auth.js  (JWT check, guest bypass)
    └── config/            db.js  (Mongo connect)
```

---

## Running it locally

```bash
cd "IM AI/server"
npm install
cp .env.example .env       # fill in the values below
npm run dev                 # Express on :5000 (or PORT)

cd "IM AI/client"
npm install
npm run dev                 # Vite dev server, proxies /api to :5000
```

`server/.env`:

```
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=any_long_random_string
PORT=5000
CLIENT_URL=http://localhost:5173
CLIENT_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
GEMINI_API_KEY=your_gemini_key          # optional — app works without it, just dumber
AI_MODE=gemini
```

**If `GEMINI_API_KEY` is missing:** the app still works. Every AI step (question generation, scoring, summary) silently falls back to a rule-based version instead. You lose adaptive/creative questions and get a keyword-matching scorer instead of Gemini's judgment — but nothing breaks.

**If `MONGO_URI` is wrong or Mongo is unreachable:** signup, login, forgot-password, and the city-autocomplete endpoint return `503 Database unavailable`. Guest mode still works fully (it never touches the database).

---

## How the whole thing flows, screen by screen

```
/login  /signup ───login/signup/guest───▶ /home
                                              │
                                              ▼
                                          /setup
              name · domain · difficulty · persona
              · pressure mode · resume/JD (optional)
                                              │  POST /api/interview/start
                                              ▼
                                          /interview
       speak or type answer ──▶ live scoring feed
       ──▶ submit ──▶ AI decides: dig deeper (follow-up)
                       or move to a new topic
       ──▶ repeat until you click "End Session"
                                              │  POST /api/interview/end
                                              ▼
                                          /dashboard
       per-question scores · radar chart · trend line
       · your answer vs. an ideal answer · PDF export
                                              │
                                              ▼
                                     /history  /profile
```

You can't jump straight to `/interview` by typing the URL — the app checks there's an active session first and bounces you back to `/setup` if not.

### Signing in
Three ways in:
1. **Sign up** — full name, username, email, password, phone number, optional city/address. Account is created but you're *not* auto-logged-in — you land back on the login page.
2. **Log in** — needs username **and** email **and** password (not just one).
3. **Continue as Guest** — one click, no form. Gets you a 45-minute token, no database record at all. Limited to once every 7 days per browser (tracked in `localStorage`).

Password rules (same on client and server): 8–64 characters, at least one uppercase, one lowercase, one number, one special character, no spaces.

**Forgot password** is a direct reset, not an email link: you type your username + email + a new password, and if that username/email pair matches an account, the password just changes right there. No verification email, no OTP. Fine for a demo/prototype, not something you'd want on a real production app with real user data.

### Setting up an interview
10 domains (Software Engineering, Data Science, Product Manager, HR & General, Finance, DevOps, Machine Learning, Marketing, Cybersecurity, Design & UX), 3 difficulty levels, 7 interviewer personalities (calm senior, friendly recruiter, strict panelist, startup founder, technical mentor, engineering manager, product interviewer), 2 pressure modes (balanced / high-pressure — high-pressure starts the "pressure score" higher and ramps it up faster on weak answers).

You can optionally paste or upload a resume (PDF/TXT) and a job description — the AI reads both and tries to ask more relevant questions. (Heads up: PDF text extraction is a crude fallback, not a real PDF parser — it works okay on simple text-based PDFs, badly on anything image-heavy or fancy-formatted.)

### During the interview
- The AI interviewer's question is read aloud with a persona-matched voice (rate/pitch tuned per persona, tries to pick a matching system voice by name).
- You answer by speaking (live transcription appears as you talk) or by typing.
- Each question has a 90-second timer; it auto-submits when time runs out, or ~5.5 seconds after you stop talking.
- While you're still answering, a live-analysis call streams interim feedback (not saved to the transcript — this is a "how am I doing so far" preview, separate from the real graded submission).
- After you submit, the server decides: was that answer weak or short? If so, it might ask a **follow-up** on the same topic (max 2 per interview) instead of moving on — this is the "adaptive" part.
- If you enable your camera, a presence panel shows eye contact / posture / attention / confidence numbers. **Important: these are not real computer-vision measurements.** The app only checks "is a person roughly visible" (a simple brightness/contrast check on the video frame) and then generates believable-looking numbers that drift randomly within realistic ranges every 2 seconds. Treat it as a UI feature, not a real presence-detection engine.

### Scoring — AI vs. fallback
For every answer, the server tries Gemini first. It asks for a strict JSON response with 7 scored dimensions (relevance, clarity, structure, specificity, confidence, delivery, role-fit) plus written feedback, strengths, weaknesses, and an ideal-answer rewrite. **If Gemini fails or isn't configured**, a local heuristic kicks in instead: it counts filler words ("um", "like", "basically"...), checks for numbers/metrics in your answer, checks for STAR-format structure (situation/task/action/result), checks how many expected keywords you hit, and turns all that into the same 7 scores using fixed formulas. Same story for question generation and the final summary — Gemini first, deterministic fallback if it's unavailable.

### End of interview
Ending a session computes:
- Average score per dimension across every answer
- A hiring verdict: **Strong Hire** (avg ≥ 8) / **Hire** (≥ 6.5) / **Borderline** (≥ 5.5) / **No Hire** (below)
- Top strengths / weaknesses / missing themes (most frequent across your answers)
- If Gemini is available, an AI-written narrative (overall verdict, top strengths, critical gaps, a 3-step coaching plan) — this AI verdict overrides the formula-based one when both exist

The dashboard shows all of that plus a radar chart, a round-by-round trend line, and a side-by-side "your answer vs. what a strong answer looks like" comparison. You can export the whole thing as a PDF — built entirely in the browser, nothing hits the server for it.

Guests can see their own dashboard right after finishing, but can't come back to History later — guest sessions aren't saved anywhere.

---

## API reference

Everything lives under `/api`. Routes marked **JWT** need `Authorization: Bearer <token>` (guest tokens work too, except where noted).

### Auth (`/api/auth`)

| Method & path | Auth | What it does |
|---|---|---|
| `POST /signup` | — | Create an account. Doesn't log you in. |
| `POST /login` | — | Needs username + email + password together. Returns a 1-hour JWT. |
| `POST /forgot-password` | — | Direct password reset by username+email match, no verification. |
| `POST /guest` | — | Issues a 45-minute guest JWT, no signup needed. |
| `GET /me` | JWT | Returns the current user (or a synthesized guest profile). |

### Interview (`/api/interview`)

| Method & path | Auth | What it does |
|---|---|---|
| `POST /start` | JWT | Creates a session, returns the first question and the interviewer's intro line. |
| `POST /answer` | JWT | Submits your answer, scores it, decides follow-up-or-new-topic, returns the next question. |
| `POST /live-analysis` | JWT | Scores your in-progress answer without saving it or advancing the interview. |
| `POST /end` | JWT | Closes the session, computes and returns the final summary. |
| `GET /sessions` | JWT | List your past sessions. |
| `GET /sessions/:id` | JWT | One full session, including its transcript. |
| `POST /upload-resume` | JWT | Upload a PDF/TXT resume, get back extracted text. |
| `GET /question-bank` | — | The raw static question bank (optionally filtered by role). |

### Cities (`/api/cities`)

| Method & path | Auth | What it does |
|---|---|---|
| `GET /?search=&limit=` | — | Indian city autocomplete for the signup form (India-only). |

---

## Known rough edges (worth knowing before you rely on this in production)

- **Forgot-password has no verification step** — anyone who knows a username+email pair can change that account's password.
- **PDF resume parsing is a crude text scrape**, not a real parser — works on simple PDFs, fails on scanned/image-based or heavily formatted ones.
- **Camera "presence" metrics are simulated**, not measured — real camera visibility check, fake eye-contact/posture/attention numbers.
- **Guest data isn't persisted** — refresh or come back later and it's gone.
- The server also ships an unused local JSON file-DB module (`server/data/db.json`) — it's dead code, never actually wired in; when Mongo is down, the app returns errors rather than falling back to it.
