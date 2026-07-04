# SBA Election Voting System

## Project Overview

A School Student Association (SBA) election voting system. Students can log in, view candidates, cast votes, and view results. Supports runoff voting when there's a tie.

## Tech Stack

- Backend: Node.js / JavaScript (Express)
- Database: PostgreSQL via Supabase (hosted)
- Database driver: `pg` (node-postgres)
- Frontend: EJS templates with inline CSS/JS

## Database Schema (PostgreSQL via Supabase)

- **Student** (sid TEXT PK, sname TEXT, section TEXT, email TEXT)
- **Candidate** (cid SERIAL PK, cname TEXT, slug TEXT UNIQUE, desc TEXT, sid TEXT FK→students)
- **Members** (id SERIAL PK, cid INTEGER FK→candidates, mname TEXT, position TEXT)
- **Ballot** (voter_sid TEXT PK FK→students, created_at TIMESTAMP DEFAULT NOW())
- **Votes** (id SERIAL PK, voter_sid TEXT FK→ballots, candidate_cid INT FK→candidates, preference INT, UNIQUE voter+pref, UNIQUE voter+candidate)
- **Settings** (key TEXT PK, value TEXT)

## Key Rules

- Anonymous voting, 1 vote per student
- Candidates cannot vote (blocked server-side via `sid` lookup)
- Students can change vote before deadline
- IRV: Tie → eliminate all but tied candidates, hold runoff
- Vote counts must be verified against actual total

## Hosting

- **DB**: Supabase PostgreSQL (IPv6-only on this project)
- **App**: Railway / Render (cloud platforms with IPv6)
- DB auto-migrates on first start; or run `migration.sql` manually in Supabase SQL editor
- Connection string in `config.js` (also reads `DATABASE_URL` env var)

## Development

- Project root: `/home/tomori/Desktop/SBA`
- Run: `node app.js` (starts on port 3000)
- The Supabase instance is IPv6-only — local dev works only with IPv6 connectivity
