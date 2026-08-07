# InterviewMirror AI

AI-powered mock interview platform. Practice role-specific interviews with an adaptive AI interviewer, get live performance analysis (confidence, clarity, structure, specificity), and track presence (eye contact, posture, tone) via voice and camera.

Live: https://im-ai.onrender.com

## Tech stack

**Client** (`client/`)
- React 18 + Vite 5
- `react-router`-free custom SPA routing (path-based, driven from `App.jsx`)
- `lucide-react` — icons
- `recharts` — performance charts (dashboard radar/trend)
- `framer-motion` — animations
- `html2canvas` + `jspdf` — PDF export of interview reports
- Plain CSS (no Tailwind) — `client/src/styles/*.css`, one stylesheet per page family

**Server** (`server/`)
- Node.js + Express 4
- MongoDB via Mongoose (users, sessions, cities) — falls back to a local JSON file DB (`server/data/db.json`) if `MONGO_URI` is unreachable/unset
- `@google/genai` (Gemini) — question generation, live/final answer evaluation; falls back to a heuristic scorer if no `GEMINI_API_KEY`
- `jsonwebtoken` + `bcryptjs` — auth (JWT, hashed passwords)
- `multer` — resume upload (PDF/TXT parsing)
- `cors`, `morgan`, `dotenv`

## Project structure

```
IM AI/
├── client/
│   └── src/
│       ├── pages/        # AuthPage, SetupPage, InterviewPage, DashboardPage,
│       │                 # HistoryPage, ProfilePage, LandingPage, legal pages
│       ├── components/    # InterviewerStage, AnswerComposer, AnalysisPanel,
│       │                 # PresencePanel, TranscriptPanel, ScoreRing, TimerRing
│       ├── hooks/         # useSpeech (STT/TTS), usePresence (camera signals)
│       ├── lib/           # auth.js (client-side validation + API calls), storage.js
│       ├── services/      # api.js (fetch wrapper)
│       └── styles/        # auth.css, global.css, landing.css
└── server/
    ├── routes/            # authRoutes, interviewRoutes, cityRoutes
    ├── lib/                # sessionEngine, questionBank, scoring, aiProvider, fileDb
    ├── models/             # User, InterviewSession, City (Mongoose)
    ├── middleware/         # auth.js (JWT verify, guest bypass)
    └── config/             # db.js (Mongo connect + DNS fix for Windows)
```

## Setup

```bash
cd "IM AI/server" && npm install && cp .env.example .env
# fill in MONGO_URI, JWT_SECRET, GEMINI_API_KEY

cd "IM AI/client" && npm install
```

`server/.env`:

```
MONGO_URI=...
JWT_SECRET=...
PORT=5000
CLIENT_URL=http://localhost:5173
CLIENT_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
GEMINI_API_KEY=...
AI_MODE=gemini
```

Run:

```bash
cd "IM AI/server" && npm run dev     # Express on PORT (default 5000)
cd "IM AI/client" && npm run dev     # Vite dev server, proxies /api to :5000
```

## App flow

```
/login /signup ──auth──▶ /home (LandingPage)
                              │
                              ▼
                          /setup (SetupPage)
            candidate name · domain · difficulty · persona
            · pressure mode · resume/JD (optional)
                              │  createSession()
                              ▼
                          /interview (InterviewPage)
            speak/type answer ──▶ live analysis ──▶ submit
            ──▶ next AI question (adaptive follow-up or new topic)
            ──▶ repeat until "End Session"
                              │  endSession()
                              ▼
                          /dashboard (DashboardPage)
            per-question scores · radar chart · round-by-round trend
            · answer-vs-model comparison · PDF export
                              │
                              ▼
                    /history · /profile
```

### Auth
- Email/username/password signup and login (JWT, 7-day-ish expiry — client auto-logs-out exactly on expiry via a precise `setTimeout`, and on any `401` from the API)
- **Guest mode** — one-click, no signup, JWT with `isGuest: true`, bypasses the DB entirely (`middleware/auth.js`); limited to one guest session per browser per 7 days (tracked in `localStorage`)
- Forgot-password flow (username + email + new password, no email verification — local/demo-grade)
- Username: 3–12 chars, no spaces, identical validation rules enforced independently on client and server for signup/login/forgot-password

### Setup → Interview
- 10 domains (Software Engineering, Data Science, PM, HR, Finance, DevOps, ML, Marketing, Cybersecurity, Design & UX), 3 difficulties, 7 interviewer personas, 2 pressure modes
- Optional resume upload (PDF/TXT, parsed server-side) or pasted text, optional job description — both feed into question generation as context
- `sessionEngine.js` picks the next question: adapts to the previous answer (follow-up vs. new topic) based on Gemini's evaluation, tracks a running "pressure score"
- Answers can be typed or spoken (Web Speech API via `useSpeech`); a response timer auto-submits on timeout
- `usePresence` estimates eye contact / posture / attention / confidence / engagement from the camera feed if enabled (client-side heuristics, not sent raw video anywhere)
- Live per-answer scoring feed (`/api/interview/live-analysis`) shown before final submit

### Dashboard / Results
- Per-question scorecards, radar chart of skill dimensions, round-by-round trend, side-by-side answer-vs-ideal-answer comparison
- Hiring recommendation badge (strong-hire / hire / borderline / no-hire) computed from `scoring.js`
- Export the full report as PDF (`html2canvas` + `jspdf`)
- History page lists past sessions (registered users only — guests don't persist history)

## API

All under `/api`:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | — | create account |
| POST | `/auth/login` | — | username + email + password |
| POST | `/auth/forgot-password` | — | reset via username + email |
| POST | `/auth/guest` | — | issue a guest JWT |
| GET | `/auth/me` | JWT | current user |
| POST | `/interview/start` | JWT | create session, get first question |
| POST | `/interview/answer` | JWT | submit answer, get next question |
| POST | `/interview/live-analysis` | JWT | score an in-progress answer without advancing |
| POST | `/interview/end` | JWT | close session, compute summary |
| GET | `/interview/sessions` | JWT | list own sessions |
| GET | `/interview/sessions/:id` | JWT | one session |
| POST | `/interview/upload-resume` | JWT | parse PDF/TXT resume |
| GET | `/interview/question-bank` | — | static question bank |
| GET | `/city` | — | Indian city autocomplete |

## Notes

- `server/data/db.json` and `sessions.json` are the local file-DB fallback and are gitignored (contain local dev session data)
- MongoDB connection forces Google DNS (`8.8.8.8`/`8.8.4.4`) in `config/db.js` — works around Windows not resolving Atlas's `mongodb+srv` SRV record
- CORS origin is read from `CLIENT_ORIGIN` (comma-separated) — must include every port/host the frontend is actually served from
