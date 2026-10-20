# 🧪 WebLab

A live web-coding playground for classrooms. Students type **HTML, CSS, and
JavaScript** in tabbed editors on the left, and see the result instantly in the
**Preview** tab on the right. An **AI Tutor** tab lets them ask questions about
their own code (powered by a green-pt backend), and a **Download ZIP** button
hands them a folder they can unzip and open by double-clicking `index.html`.

Built for high-school IT/AI classes: no accounts, no build tools, nothing to
install for students.

## Features

- **Left pane:** HTML / CSS / JS tabs with syntax highlighting (CodeMirror),
  auto-saved to the browser so work survives refreshes and reboots.
- **Right pane:**
  - **👀 Preview** — live rendering of the combined page, with a friendly red
    error bar when their JavaScript throws (with line number).
  - **🤖 AI Tutor** — chat that automatically sees the student's current code,
    styled for teaching (short answers, copy-pasteable fenced code blocks).
- **⬇ Download ZIP** — produces `project-name/` containing `index.html`,
  `style.css`, `script.js`, and a `README.txt` with open instructions.
  Unzip → double-click `index.html` → it opens in any browser, offline.
- **Start fresh** button, draggable pane divider, `Ctrl/Cmd+S` feedback.
- Runs anywhere Node.js ≥ 18 runs. Zero CDN dependencies (CodeMirror and
  JSZip are served locally).

## Run locally

```bash
npm install
npm start          # http://localhost:3000
```

The AI Tutor stays politely offline until you set a key (see below). Everything
else (editor, preview, ZIP download) works without any configuration.

## Environment variables

| Variable          | Required | Default                    | What it does |
|-------------------|----------|----------------------------|--------------|
| `PORT`            | auto     | `3000`                     | Set automatically by Railway |
| `GREENPT_API_KEY` | for AI   | —                          | Your green-pt API key |
| `GREENPT_BASE_URL`| no       | `https://api.greenpt.ai/v1`| OpenAI-compatible base URL |
| `GREENPT_MODEL`   | no       | `glm-5.3`                  | Model id to use for the tutor |

## Deploy on Railway

1. **Push this folder to a GitHub repo** (or use the Railway CLI: `railway init`
   inside this folder).
2. On [railway.app](https://railway.app): **New Project → Deploy from GitHub
   repo** → pick the repo. Railway auto-detects Node.js and runs `npm start`.
3. **Variables** tab → add:
   - `GREENPT_API_KEY` = your green-pt key
   - (optional) `GREENPT_MODEL`, `GREENPT_BASE_URL`
4. **Settings → Networking → Generate Domain** to get the public URL students
   will use (e.g. `https://weblab-production.up.railway.app`).
5. Open the URL and check the 🤖 AI Tutor tab — if the banner is gone, the key
   works.

Cost note: the service is a tiny Express server; Railway's hobby plan is
usually enough for a class. The AI calls consume your green-pt credits.

## Classroom notes

- Each student's work is stored in their own browser (localStorage). Different
  students on different computers/browsers do not see each other's work.
  "Download ZIP" is the way work gets handed in.
- The preview runs in a sandboxed iframe. Advanced APIs (like `localStorage`
  inside the preview) are blocked by the sandbox and will show in the error
  bar — exported files opened directly from disk work fully.
- The ZIP always contains all three files so the structure stays consistent
  for grading, even if a file is empty.

## Project structure

```
weblab/
├── server.js            # Express server + green-pt chat proxy (+ rate limit)
├── package.json
├── test/compose.test.js # transform tests (npm test)
└── public/
    ├── index.html       # layout: topbar + two panes
    ├── app.js           # tabs, editors, preview, chat, ZIP download
    ├── compose.js       # pure HTML assembly (preview + export) — tested in Node
    ├── style.css
    └── vendor/          # CodeMirror 5 + theme, served locally
```
