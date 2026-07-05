# SBA Election Voting System — Complete Documentation

> School Student Association (SBA) election voting system with ranked-choice voting (IRV).
> Built with Node.js, Express, PostgreSQL (Neon/Supabase), and EJS templates.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [Configuration](#5-configuration)
6. [app.js — Server & Routes](#6-appjs--server--routes)
7. [db.js — Database Layer](#7-dbjs--database-layer)
8. [IRV Algorithm Explained](#8-irv-algorithm-explained)
9. [EJS Templates](#9-ejs-templates)
10. [How to Run Locally](#10-how-to-run-locally)
11. [How to Deploy to Production](#11-how-to-deploy-to-production)
12. [Teacher Dashboard Guide](#12-teacher-dashboard-guide)
13. [Candidate Panel Guide](#13-candidate-panel-guide)
14. [Security Considerations](#14-security-considerations)
15. [Seed Data & Test Accounts](#15-seed-data--test-accounts)

---

## 1. Project Overview

This is a **ranked-choice voting system** for school elections. Students log in with their Student ID, rank candidates by preference, and vote. The system uses **Instant-Runoff Voting (IRV)**:

- Voters rank candidates in order of preference (1st choice, 2nd choice, etc.)
- If no candidate gets >50% of first-choice votes, the lowest-ranked candidate is eliminated
- Votes for the eliminated candidate transfer to the voter's next preference
- This repeats until one candidate has a majority

**Key features:**
- Student login (SID-based, no password)
- Ranked-choice ballot with drag-down selects
- Candidate profiles with campaign members
- Real-time IRV results with per-round breakdowns
- Teacher dashboard (password-protected) for managing candidates, toggling voting, and viewing stats
- Candidate self-service panel
- Deadline-based countdown timer (polls auto-close)
- Blank/abstain voting
- Winner shown as "Leading" before deadline, "Winner" after

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v20+ |
| Framework | Express 4.x |
| Database | PostgreSQL (hosted on Neon.tech or Supabase) |
| Database Driver | `pg` (node-postgres) |
| Templating | EJS (Embedded JavaScript) |
| Styling | Inline CSS in EJS templates (no external files) |
| Client JS | Vanilla JavaScript in EJS templates (countdown, ballot previews, toasts) |
| Session Mgmt | `express-session` with MemoryStore |
| Deployment | Render (or Railway, Fly.io) |

---

## 3. Project Structure

```
sba-election/
├── app.js                  # Express server, routes, middleware
├── config.js               # Election config (deadline, title, admin password)
├── db.js                   # PostgreSQL connection, schema, queries, IRV logic
├── migration.sql           # SQL to set up schema + seed data in any PostgreSQL DB
├── package.json            # Dependencies and scripts
├── AGENTS.md               # OpenCode agent instructions
├── DOCUMENTATION.md        # This file
├── .gitignore              # Git ignore rules
└── views/
    ├── login.ejs           # Student login page
    ├── register.ejs        # Student registration
    ├── home.ejs            # Student dashboard (3-card layout)
    ├── candidates.ejs      # Candidate grid + ranked ballot
    ├── candidate.ejs       # Candidate profile page
    ├── results.ejs         # IRV results with round-by-round breakdown
    ├── teacher-login.ejs   # Teacher password login
    ├── teacher.ejs         # Teacher dashboard
    ├── teacher-candidate-edit.ejs  # Edit candidate form
    └── candidate-panel.ejs # Candidate self-service panel
```

---

## 4. Database Schema

PostgreSQL tables (auto-created by `db.js`, or via `migration.sql`):

### Table: `students`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `sid` | TEXT | PRIMARY KEY | Student ID (e.g. SBA-2401) |
| `sname` | TEXT | NOT NULL | Full name |
| `section` | TEXT | NOT NULL | Grade & section |
| `email` | TEXT | | Email address |

### Table: `candidates`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `cid` | SERIAL | PRIMARY KEY | Auto-incrementing ID |
| `cname` | TEXT | NOT NULL | Candidate's full name |
| `slug` | TEXT | UNIQUE NOT NULL | URL-friendly name (e.g. `maria-santos`) |
| `description` | TEXT | | Campaign platform text |
| `sid` | TEXT | FK → students(sid) | Links to student account (candidates can't vote) |
| `position` | TEXT | DEFAULT '' | Position they're running for (President, VP, etc.) |

### Table: `members`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Auto-incrementing ID |
| `cid` | INTEGER | FK → candidates(cid) | Which candidate's team |
| `mname` | TEXT | NOT NULL | Member's name |
| `position` | TEXT | NOT NULL | Member's role (Campaign Manager, etc.) |

### Table: `ballots`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `voter_sid` | TEXT | PRIMARY KEY, FK → students(sid) | Who voted (one ballot per student) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | When the ballot was cast |

### Table: `votes`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Auto-incrementing ID |
| `voter_sid` | TEXT | FK → ballots(voter_sid) | Links to ballot |
| `candidate_cid` | INTEGER | FK → candidates(cid) | Which candidate ranked |
| `preference` | INTEGER | CHECK(>=1) | Rank position (1=first choice) |
| | | UNIQUE(voter_sid, preference) | One candidate per rank position |
| | | UNIQUE(voter_sid, candidate_cid) | Can't rank same candidate twice |

### Table: `settings`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | TEXT | PRIMARY KEY | Setting name |
| `value` | TEXT | NOT NULL | Setting value |

**Default settings:**
- `voting_enabled` = `"true"`
- `election_deadline` = `"2026-07-09T23:59:59"`

### Entity Relationships (text diagram)

```
students ──→ ballots ──→ votes ──→ candidates
  ↑                                      │
  └────── candidates.sid ────────────────┘
                    │
               members (campaign team)
```

---

## 5. Configuration

**`config.js`** contains three sections:

```js
module.exports = {
  election: {
    deadline: '2026-07-09T23:59:59',     // Default deadline (overridden by DB setting)
    title: 'SBA Election 2026',           // Election title shown everywhere
  },
  admin: {
    password: 'teacher123',               // Teacher dashboard login password
  },
  database: {
    url: process.env.DATABASE_URL,        // Must be set via environment variable
  },
};
```

**Important:** The database URL must be set via the `DATABASE_URL` environment variable (for security — never hardcode credentials). The `config.js` reads it as `process.env.DATABASE_URL`.

---

## 6. app.js — Server & Routes

The Express server is organized into these sections:

### Middleware Stack

1. **`express.urlencoded()`** — Parses form POST bodies
2. **`express.session()`** — Session management (MemoryStore)
3. **`asyncRoute` wrapper** — Catches promise rejections in async handlers → passes to Express error handler
4. **Config middleware** — Reads `election_deadline` from DB settings (fallback to config.js), sets `res.locals.deadline` for all templates
5. **`requireAuth` middleware** — Redirects to `/` if no session
6. **`requireTeacher` middleware** — Redirects to `/teacher/login` if no teacher session

### Route Map

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/` | — | Login page (redirects to `/home` if already logged in) |
| POST | `/login` | — | Authenticate by SID, create session |
| GET | `/logout` | — | Destroy session |
| GET | `/register` | — | Registration form |
| POST | `/register` | — | Create new student account |
| GET | `/home` | Student | Dashboard with 3 cards (Candidates, Vote, Results) |
| GET | `/candidates` | Student | Candidate grid + ranked ballot. `?view=1` hides ballot |
| GET | `/candidate/:slug` | Student | Candidate profile with banner, avatar, members |
| POST | `/vote` | Student | Cast ranked ballot (guarded: deadline, voting_enabled, isCandidate) |
| GET | `/results` | Public | IRV round-by-round results with winner |
| GET | `/teacher/login` | — | Teacher login form |
| POST | `/teacher/login` | — | Password check, create teacher session |
| GET | `/teacher/logout` | — | Destroy teacher session |
| GET | `/teacher` | Teacher | Dashboard: stats, toggle voting, candidate CRUD, deadline, reset |
| POST | `/teacher/settings` | Teacher | Update election deadline |
| POST | `/teacher/reset` | Teacher | Clear all votes/ballots |
| POST | `/teacher/toggle-voting` | Teacher | Enable/disable voting |
| POST | `/teacher/candidate/add` | Teacher | Add candidate (with position + members) |
| POST | `/teacher/candidate/delete` | Teacher | Delete candidate (cascades to members, votes) |
| GET | `/teacher/candidate/edit/:cid` | Teacher | Edit candidate form (shows members) |
| POST | `/teacher/candidate/edit/:cid` | Teacher | Update candidate info |
| POST | `/teacher/candidate/member/add` | Teacher | Add campaign member to candidate |
| POST | `/teacher/candidate/member/delete` | Teacher | Remove campaign member |
| GET | `/candidate-panel` | Student (candidate) | Candidate self-service dashboard |

### Voting Guards (POST /vote)

Three checks prevent unauthorized voting, all on the server side (cannot be bypassed from the browser):

```js
1. isElectionOver()      → 403 if deadline passed (from config.js)
2. db.isCandidate(sid)   → 403 if user is a candidate
3. voting_enabled setting → 403 if voting is disabled
```

The preferences are parsed from `pref1`, `pref2`, etc. form fields (up to 10). An empty array = abstain (blank vote).

---

## 7. db.js — Database Layer

### Connection

Uses `pg.Pool` with connection string from `DATABASE_URL` environment variable. SSL is enabled with `rejectUnauthorized: false` (required for Neon/Supabase). IPv4 is forced with `family: 4`.

### Helper Functions

| Function | Purpose |
|----------|---------|
| `pg(sql, params)` | Converts `?` placeholders to `$1`, `$2`… for PostgreSQL |
| `queryAll(sql, params)` | Returns all matching rows as objects |
| `queryOne(sql, params)` | Returns first row or null |
| `run(sql, params)` | Executes a write query (no return value) |
| `colorFor(cid, allCids)` | Assigns a consistent color to each candidate for the results page bars |

### Schema Initialization — `initSchema()`

Creates all tables with `CREATE TABLE IF NOT EXISTS`. Also runs `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migrations for the `sid` and `position` columns (so existing databases don't break when new columns are added).

### Seed Data — `seed()`

Only inserts if the `candidates` table is empty (checks `COUNT(*)` first). Creates 8 students (5 regular + 3 candidates) and 3 candidates with campaign members.

### Query Functions

| Function | SQL | Purpose |
|----------|-----|---------|
| `findStudent(sid)` | `SELECT * FROM students WHERE sid = $1` | Look up student by ID |
| `addStudent(sid, …)` | `INSERT INTO students` | Register a new student |
| `getAllCandidates()` | `SELECT * FROM candidates ORDER BY cid` | Get all candidates |
| `getCandidateBySlug(slug)` | `… WHERE slug = $1` | Get candidate for profile page |
| `getCandidate(cid)` | `… WHERE cid = $1` | Get single candidate by ID |
| `updateCandidate(cid, …)` | `UPDATE candidates SET … WHERE cid = $1` | Edit candidate |
| `getCandidateBySid(sid)` | `… WHERE sid = $1` | Find candidate by linked student ID |
| `getMembers(cid)` | `SELECT * FROM members WHERE cid = $1` | Get campaign team |
| `addCandidate(…)` | `INSERT INTO candidates … RETURNING cid` | Create candidate (returns new CID) |
| `deleteCandidate(cid)` | `DELETE FROM members/votes/candidates` | Remove candidate and all related data |
| `addMember(cid, name, role)` | `INSERT INTO members … RETURNING id` | Add campaign member |
| `deleteMember(id)` | `DELETE FROM members WHERE id = $1` | Remove campaign member |
| `hasVoted(sid)` | `SELECT COUNT(*) FROM ballots` | Check if student has voted |
| `getBallot(sid)` | `SELECT candidate_cid, preference FROM votes` | Get a voter's ranked choices |
| `castVote(sid, prefs)` | Wrapped in BEGIN/COMMIT | Replace existing ballot with new rankings |
| `getBlankVotes()` | `SELECT COUNT(*) WHERE NOT EXISTS vote` | Count abstentions |
| `getSetting(key)` | `SELECT value FROM settings WHERE key = $1` | Get a DB setting |
| `setSetting(key, value)` | `INSERT … ON CONFLICT DO UPDATE` | Save a DB setting |
| `resetElection()` | `DELETE FROM votes; DELETE FROM ballots` | Clear all votes (preserves candidates) |
| `isCandidate(sid)` | `SELECT COUNT(*) FROM candidates WHERE sid = $1` | Check if student is a candidate |
| `getTotalVoters()` | `SELECT COUNT(*) FROM students` | Total registered students |
| `getTotalVotesCast()` | `SELECT COUNT(*) FROM ballots` | Total ballots submitted |
| `getResults()` | Complex IRV algorithm (see below) | Full IRV tally |

### Transactional Voting — `castVote()`

Uses a database transaction (`BEGIN`/`COMMIT` with `ROLLBACK` on error):

1. Delete existing votes for this voter
2. Delete existing ballot for this voter
3. Insert new ballot record
4. Insert ranked votes (one row per preference)
5. Commit

This ensures atomic vote replacement (students can change their vote before the deadline).

---

## 8. IRV Algorithm Explained

The `getResults()` function implements **Instant-Runoff Voting**:

### Step-by-step

```
Input:  All ranked ballots from the votes table
Output: Rounds array (each round's vote counts + eliminated candidate)
        Winner name (or null if no majority/tie)
        Winner position (the position field of the winning candidate)
```

1. **Group votes by voter** into ballots (ordered by preference)
2. **If no ballots exist**, return empty results
3. **While more than 1 candidate remains:**
   a. Count each ballot's highest-ranked *remaining* candidate as one vote
   b. If someone has **>50%** of active votes → they win (break)
   c. If **all remaining candidates are tied** → tie, no winner (break)
   d. Otherwise, **eliminate the candidate(s) with the fewest votes**
   e. Record the round (vote counts + who was eliminated)
   f. Remove eliminated candidates and repeat
4. **Determine winner:** The last remaining candidate wins (if they have more votes than the alternative in a head-to-head)

### Edge Cases Handled

- **Exhausted ballots:** If a voter's top-ranked choices are all eliminated, their ballot becomes inactive
- **Simultaneous elimination:** Multiple candidates with the same minimum vote count are eliminated together
- **Ties in final round:** No winner declared (winner is null) — the results page shows the rounds without a winner
- **Zero votes:** If voting hasn't started, the `rounds` array is empty and the empty state is shown

### Return Value

```js
{
  rounds: [
    {
      label: "Round 1",
      votes: [{ name: "Maria Santos", count: 5, color: "#8A5DF4" }, ...],
      eliminated: "Jose Garcia"    // only present if someone was eliminated in this round
    },
    ...
  ],
  winner: "Maria Santos",     // null if no majority/tie
  winnerPos: "President",     // null if no winner
  totalVoters: 100,
  blankVotes: 2
}
```

---

## 9. EJS Templates

All CSS and JavaScript are **inlined** in each template (no external files). Every template shares the same visual language: dark theme, Inter font, purple accent (`#8A5DF4`).

### `login.ejs`
- Form with SID input and Sign In button
- "View Results" button for public access
- Error message display for invalid SIDs
- Responsive (centered on page)

### `register.ejs`
- Registration form (SID, name, section, email)
- Duplicate SID detection
- Success/error messages

### `home.ejs`
- 3-card dashboard layout:
  - **Candidates card:** Shows count + link to candidates page
  - **My Vote card:** Shows voting status (not voted/voted) with appropriate button
  - **Results card:** Link to public results page
- "Not Eligible" notice if user is a candidate
- "Voting Disabled" banner if admin has disabled voting
- Success toast with auto-dismiss (3.5s) after voting
- Candidate panel link visible if user is a candidate
- Countdown timer in header

### `candidates.ejs`
- 3-column responsive grid of candidate cards (adapts to 2/1 columns on smaller screens)
- Each card has: color banner, initial avatar, name, position, "View Profile" button
- **Ballot section** (hidden when `?view=1`):
  - Ranked dropdowns for 1st, 2nd, etc. choices (N-1 selects for N candidates)
  - Preview circles next to each dropdown showing selected candidate's initial
  - Duplicate-prevention: selecting a candidate in one dropdown disables them in others
  - "Abstain" card to submit a blank vote
- "Voting Disabled" banner when admin has disabled voting

### `candidate.ejs`
- Full profile page with gradient banner, avatar, name, position
- Campaign platform description
- Campaign members list (initial avatar, name, role)
- Back button

### `results.ejs`
- Countdown timer in header
- Winner card (hidden until election over, or shows "Leading" before deadline)
- Stats row: voters, votes cast, rounds, candidates, blank votes
- Round-by-round breakdown with horizontal bar charts
- Elimination text in red per round
- Empty state when no votes
- JS auto-reload when countdown hits zero (flips "Leading" → "Winner")
- Publicly accessible (no login required)

### `teacher-login.ejs`
- Password-only login form
- Error display for incorrect password

### `teacher.ejs`
- Election overview stats (students, voted, remaining, candidates, blank)
- Voting status toggle (enable/disable)
- Candidate list with Edit/Delete buttons (with confirm dialog)
- Add Candidate form with: name, position, SID, description, 3 member rows
- Deadline change form
- Election reset with confirmation

### `teacher-candidate-edit.ejs`
- Edit candidate form (name, position, SID, description)
- Campaign members list with Remove buttons
- Add Campaign Member form (name, role)

### `candidate-panel.ejs`
- Candidate's own profile view
- Campaign members list
- Links to public profile and results

---

## 10. How to Run Locally

### Prerequisites
- Node.js v20+
- PostgreSQL database (Neon or Supabase)
- IPv6 connectivity (if using some Supabase instances) — see note below

### Steps

```bash
# 1. Clone and install
cd sba-election
npm install

# 2. Set environment variable
export DATABASE_URL="postgresql://user:pass@host:port/db?sslmode=require"

# 3. Run the app
node app.js
```

### First-time setup

The app auto-creates the schema and seed data on first run. Alternatively, you can run `migration.sql` manually in your database's SQL editor and then start the app.

### IPv6 Note

This project's Supabase PostgreSQL instance is IPv6-only. If your local network doesn't have IPv6, the app will start but won't connect to the database. In that case:
- Use a database with IPv4 support (e.g., Neon.tech)
- Or deploy to a cloud platform that has IPv6 (Railway, Render)

---

## 11. How to Deploy to Production

### Option A: Render (recommended for simplicity)

1. Push the repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service** → connect your repo
3. Fill in:
   - **Build Command:** `npm install`
   - **Start Command:** `node app.js`
   - **Plan:** Free
4. Add environment variable:
   - Key: `DATABASE_URL`
   - Value: Your PostgreSQL connection string (from Neon or Supabase)
5. Click **Create Web Service**

**To keep it awake:** Render free tier spins down after 15 min idle. Set up a free ping at [cron-job.org](https://cron-job.org) pointing to `https://your-app.onrender.com/` every 14 minutes.

### Option B: Railway

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Set `DATABASE_URL` environment variable
4. Done

### Database Migration

Before deploying, run `migration.sql` in your database's SQL editor to create the schema and seed data. The app will also auto-create tables on first start, but using the migration file is safer.

---

## 12. Teacher Dashboard Guide

Access: `https://your-app.com/teacher/login` (password: `teacher123` by default)

### Features

| Feature | Description |
|---------|-------------|
| **Election Overview** | Total students, voted count, remaining, candidates, blank votes |
| **Voting Status** | Enable/disable voting with one click. When disabled, students see a banner and can't submit votes. |
| **Candidates List** | View all candidates with their position and description. Edit or delete any candidate. |
| **Add Candidate** | Create a new candidate with name, position, SID (links to student account), description, and up to 3 campaign members. |
| **Edit Candidate** | Change name, position, SID, description. Add/remove campaign members. |
| **Deadline** | Change the election deadline (datetime-local picker). Updates the countdown across all pages. |
| **Reset Election** | Deletes all votes and ballots. Preserves students and candidates. Requires confirmation. |

---

## 13. Candidate Panel Guide

Access: Log in with a candidate's student SID (e.g., `SBA-2406` for Maria Santos), then go to `/candidate-panel`.

Candidates see:
- Their own profile (name, position, description)
- Their campaign members
- Links to their public profile and election results

**Candidates cannot vote.** This is enforced server-side — even a direct POST to `/vote` is blocked with a 403 response if the user's SID is linked to a candidate account.

---

## 14. Security Considerations

### Implemented Safeguards

- **Parameterized queries** — All SQL uses `$1`, `$2` placeholders (via `pg`). No SQL injection.
- **Server-side voting guards** — Deadline, voting toggle, and candidate status are all checked on the server. Cannot be bypassed from the browser.
- **EJS auto-escaped output** — `<%= %>` escapes HTML. Prevents XSS in templates.
- **Environment variable for DB credentials** — Connection string is not in the code. Set via `DATABASE_URL` env var.
- **Transactional voting** — `BEGIN`/`COMMIT` ensures atomic vote replacement.

### Known Limitations (Acceptable for Showcase)

| Issue | Impact | Mitigation |
|-------|--------|------------|
| **No password on student login** | Anyone who knows a SID can vote as that student | SIDs should be kept private; suitable for school settings |
| **No CSRF protection** | Potential for cross-site form submission | Low risk for a school election showcase |
| **No rate limiting** | Brute-force SID guessing possible | Rate limiting can be added with `express-rate-limit` |
| **MemoryStore sessions** | Sessions lost on server restart; not scalable | Fine for single-instance deployment |
| **Hardcoded teacher password** | Password in `config.js` | Change `config.js` or use env var override |

---

## 15. Seed Data & Test Accounts

### Students

| SID | Name | Section | Type |
|-----|------|---------|------|
| SBA-2401 | Juan Dela Cruz | Grade 12 - STEM A | Voter |
| SBA-2402 | Maria Reyes | Grade 12 - STEM B | Voter |
| SBA-2403 | Carlos Santos | Grade 11 - ABM A | Voter |
| SBA-2404 | Ana Gonzales | Grade 11 - HUMSS B | Voter |
| SBA-2405 | Pedro Lim | Grade 12 - STEM A | Voter |
| SBA-2406 | Maria Santos | Grade 12 - STEM B | Candidate |
| SBA-2407 | Jose Garcia | Grade 11 - ABM A | Candidate |
| SBA-2408 | Elena Rodriguez | Grade 12 - HUMSS A | Candidate |

### Candidates

| Name | Position | SID | Campaign Members |
|------|----------|-----|-----------------|
| Maria Santos | President | SBA-2406 | Anna Reyes (Campaign Manager), Ben Torres (Treasurer) |
| Jose Garcia | Vice President | SBA-2407 | Carla Gomez (Campaign Manager), Ding Cruz (Logistics Head) |
| Elena Rodriguez | Secretary | SBA-2408 | Franco Lopez (Campaign Manager), Grace Tan (Secretary) |

### Teacher Access

- URL: `/teacher`
- Password: `teacher123` (changeable in `config.js`)

---

> **Note:** This project is designed as a showcase/demonstration of a ranked-choice voting system.
> For production use in actual elections, additional security measures (rate limiting, CSRF tokens,
> persistent session store, password-based student auth) should be implemented.
