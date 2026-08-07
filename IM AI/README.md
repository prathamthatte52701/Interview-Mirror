# Interview Mirror AI

Merged prototype based on the original GitHub repo and the uploaded v3 source dump.

## What this version keeps
- immersive interview room UI
- visible AI interviewer
- live camera preview
- browser speech + mic
- role-based question bank
- heuristic answer evaluation
- pressure score and follow-up prompts
- recruiter-style dashboard
- Express backend with JSON persistence

## Run
From project root:
```bash
npm install
npm run dev
```

Client: http://localhost:5173  
Server: http://localhost:5001

For separate terminals:
```bash
npm run dev:server
npm run dev:client
```

Keep local AI credentials in `server/.env`. Use `server/.env.example` only as a template.
