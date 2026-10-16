# ⚡ SE Quiz Arena (Kahoot-Style Real-Time Multiplayer Quiz)

A full-stack, real-time multiplayer quiz game engineered for **70+ concurrent players** with zero lag. Featuring a light mode aesthetic, procedural Web Audio sound synthesis, dynamic QR code room joining, live lobby, Kahoot-style speed score calculation with streak multipliers, between-question leaderboards, and an animated Grand Finale 3D podium celebrating the **Top 10**!

---

## 🌟 Key Features

1. **Common Room PIN & Instant QR Scan**:
   - Host generates a common 6-digit game PIN (e.g., `430705`).
   - High-resolution SVG QR Code automatically rendered on the host big screen. Players simply scan with their mobile phone cameras to open the join page with the PIN pre-filled.
   - Works seamlessly on local Wi-Fi / LAN across mobile phones, tablets, and laptops.

2. **Player Onboarding & Kahoot-Style Lobby**:
   - Players select from **16 fun avatar emojis** (🚀, 🦊, ⚡, 🦄, 🤖, 🐯, 🎯, 🌟, 🍕, 🏆, etc.).
   - Enter their custom nickname with duplicate name protection.
   - Real-time lobby grid displaying all joined players with bounce-in animations, live player counter, and interactive kick controls for the host.

3. **50 High-Quality Software Engineering Questions**:
   - Curated 50 comprehensive questions covering 5 core syllabus units:
     - **Unit I**: Software Process Models (Waterfall, Spiral, RAD, Incremental, Win-Win, RUP, Agile)
     - **Unit II**: Software Requirements Analysis & UML Design (Functional/Non-Functional, SRS, UML diagrams, Coupling/Cohesion, DFD, Feasibility)
     - **Unit III**: Software Project Management (KLOC, COCOMO, Function Points, Delphi, CMM, CPM, SCM, Metrics, Risk Management)
     - **Unit IV**: Software Testing (White Box, Black Box, Regression, Statement Coverage, Mutation, Stress, All-Pair, Beta, Recovery, Integration)
     - **Unit V**: Agile and Scrum (Agile Manifesto, XP, TDD, Product Owner, Sprint Duration, Retrospective, CI, Pair Programming, Lean, Scrum Values)
   - Balanced non-consecutive options design (zero duplicate consecutive answer keys, ~25% distribution across A, B, C, D).
   - Stored cleanly in [`server/questions.json`](file:///d:/SE%20QUIZ/server/questions.json) with rich explanations for every question.

4. **Kahoot-Inspired Speed & Streak Score Calculation**:
   - **Base Score**: Up to `1,000` points per question based on response speed:
     $$\text{Base Points} = \text{round}\left(\left(1 - \frac{\text{Time Taken}}{2 \times \text{Time Limit}}\right) \times 1000\right)$$
     *(Fastest correct answer receives ~1,000 points; slowest correct receives ~500 points; incorrect receives 0).*
   - **Consecutive Streak Bonuses**:
     - 🔥 **2 in a row**: +100 bonus pts
     - 🔥🔥 **3 in a row**: +250 bonus pts
     - 🔥🔥🔥 **4 in a row**: +400 bonus pts
     - 🔥🔥🔥🔥 **5+ in a row**: +500 Super Streak bonus!
   - Server-authoritative timestamps eliminate client spoofing and cheating.

5. **Live Distribution Histogram & Explanations**:
   - After each question, the host screen reveals a real-time bar chart showing vote distributions across all 4 options, highlights the correct answer with a green pulse, and presents a concise takeaway explanation.

6. **Resilient Reconnection Engine (Accidental F5 / Page Refresh Protection)**:
   - When a student joins, a unique `sessionToken` is issued and saved in browser `sessionStorage`.
   - If a student presses **F5 (Refresh)** or accidentally closes and re-opens the tab:
     - The client immediately re-establishes connection using their `sessionToken`.
     - The server restores their exact score, streak, correct answer tally, and active question/result view.
     - If they refreshed mid-question after answering, their locked answer remains submitted!
     - If they refreshed before answering, the timer resumes with the exact remaining seconds.

7. **One-Click CSV / Excel Grade Export**:
   - The final podium screen includes an **"📥 Download Results (CSV)"** button.
   - Instantly downloads a clean spreadsheet with rankings, student handles, final scores, accuracy percentages, and max streaks for grading.

8. **Zero-Dependency High Performance Architecture**:
   - Built with pure Node.js native HTTP and native RFC 6455 WebSockets.
   - Starts in milliseconds with zero `node_modules` installation headaches, SSL issues, or heavy memory consumption. Effortlessly scales to 70+ simultaneous players.

---

## 🚀 Quick Start (Local Run)

### 1. Start the Server
In the project directory, run:
```bash
node server/server.js
# or
npm start
```

### 2. Open the Views
- **🖥️ Host (Projector / Presentation Screen)**:
  Open [http://localhost:3000/host](http://localhost:3000/host) on the main monitor or projector.
- **📱 Player (Mobile / Laptop View)**:
  Open [http://localhost:3000/](http://localhost:3000/) on any device.

### 3. Playing on the Same Wi-Fi (Classroom / Auditorium)
When the server boots, it detects and logs your local LAN IP (e.g., `http://192.168.1.15:3000/`).
- Make sure players are connected to the same Wi-Fi.
- Players can either scan the QR Code on the Host Screen with their phone camera or type the URL into their mobile browser.

---

## ☁️ Deployment Instructions

### Option 1: Render.com (100% Free)
1. Push your repository to GitHub.
2. Go to [Render.com](https://render.com) and click **New Web Service**.
3. Connect your GitHub repository.
4. Set:
   - **Environment**: `Node`
   - **Build Command**: `echo 'No build needed'`
   - **Start Command**: `node server/server.js`
5. Click **Deploy Web Service**! Render will give you a live public HTTPS/WSS URL (e.g., `https://se-quiz.onrender.com`).

### Option 2: Railway.app / Fly.io / Docker
This repository includes a production [`Dockerfile`](file:///d:/SE%20QUIZ/Dockerfile):
```bash
docker build -t se-quiz .
docker run -p 3000:3000 se-quiz
```

---

## 📁 Project Structure

```
d:\SE QUIZ/
├── package.json          # Project configuration & scripts
├── Dockerfile            # Container deployment specification
├── render.yaml           # 1-click cloud deployment blueprint
├── README.md             # Complete documentation
├── server/
│   ├── server.js         # HTTP static & REST server + WebSocket dispatcher
│   ├── miniWs.js         # Zero-dependency RFC 6455 WebSocket engine
│   ├── gameManager.js    # Room lifecycle, state machine, speed & streak scoring
│   ├── qr.js             # Pure SVG QR code generator for room joining
│   └── questions.json    # 50 curated Software Engineering questions
└── public/
    ├── index.html        # Mobile-first player interface
    ├── host.html         # Projector-ready host display interface
    ├── css/
    │   ├── style.css     # Premium Light Mode design system & player cards
    │   └── host.css      # Host presentation styling & 3D podium
    └── js/
        ├── player.js     # Player client logic, avatar picker, real-time sync
        ├── host.js       # Host client logic, QR loader, timer loop, controls
        ├── sounds.js     # Web Audio API procedural sound synthesizer
        └── confetti.js   # 60fps canvas confetti explosion engine
```

---

## ⌨️ Host Keyboard Shortcuts
- **Spacebar**: Automatically advances to the next step (Start Game ➔ Next: Leaderboard ➔ Next Question).
- **Fullscreen Button (⛶)**: Enter immersive theater/projector mode.
- **Sound Button (🔊/🔇)**: Toggle procedural lobby music and effects.
