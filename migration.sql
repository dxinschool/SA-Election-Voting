-- SBA Election - Supabase PostgreSQL Schema

CREATE TABLE IF NOT EXISTS students (
  sid TEXT PRIMARY KEY,
  sname TEXT NOT NULL,
  section TEXT NOT NULL,
  email TEXT
);

CREATE TABLE IF NOT EXISTS candidates (
  cid SERIAL PRIMARY KEY,
  cname TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  sid TEXT REFERENCES students(sid),
  position TEXT DEFAULT ''
);

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS sid TEXT REFERENCES students(sid);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS position TEXT DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_sid ON candidates(sid);

CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  cid INTEGER NOT NULL REFERENCES candidates(cid),
  mname TEXT NOT NULL,
  position TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ballots (
  voter_sid TEXT PRIMARY KEY REFERENCES students(sid),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
  id SERIAL PRIMARY KEY,
  voter_sid TEXT NOT NULL REFERENCES ballots(voter_sid),
  candidate_cid INTEGER NOT NULL REFERENCES candidates(cid),
  preference INTEGER NOT NULL CHECK(preference >= 1),
  UNIQUE(voter_sid, preference),
  UNIQUE(voter_sid, candidate_cid)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed Data

INSERT INTO students (sid, sname, section, email) VALUES
  ('SBA-2401', 'Juan Dela Cruz', 'Grade 12 - STEM A', 'juan@example.com'),
  ('SBA-2402', 'Maria Reyes', 'Grade 12 - STEM B', 'maria@example.com'),
  ('SBA-2403', 'Carlos Santos', 'Grade 11 - ABM A', 'carlos@example.com'),
  ('SBA-2404', 'Ana Gonzales', 'Grade 11 - HUMSS B', 'ana@example.com'),
  ('SBA-2405', 'Pedro Lim', 'Grade 12 - STEM A', 'pedro@example.com'),
  ('SBA-2406', 'Maria Santos', 'Grade 12 - STEM B', 'maria.santos@example.com'),
  ('SBA-2407', 'Jose Garcia', 'Grade 11 - ABM A', 'jose.garcia@example.com'),
  ('SBA-2408', 'Elena Rodriguez', 'Grade 12 - HUMSS A', 'elena.rodriguez@example.com')
ON CONFLICT (sid) DO NOTHING;

INSERT INTO candidates (cname, slug, description, sid, position) VALUES
  ('Maria Santos', 'maria-santos', 'Improve campus facilities, add more student lounges, and strengthen the SBA funding for club activities.', 'SBA-2406', 'President'),
  ('Jose Garcia', 'jose-garcia', 'Focus on academic support programs, tutoring centers, and mental health awareness campaigns.', 'SBA-2407', 'Vice President'),
  ('Elena Rodriguez', 'elena-rodriguez', 'Promote environmental sustainability, tree planting initiatives, and eco-friendly school policies.', 'SBA-2408', 'Secretary')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO members (cid, mname, position) VALUES
  (1, 'Anna Reyes', 'Campaign Manager'),
  (1, 'Ben Torres', 'Treasurer'),
  (2, 'Carla Gomez', 'Campaign Manager'),
  (2, 'Ding Cruz', 'Logistics Head'),
  (3, 'Franco Lopez', 'Campaign Manager'),
  (3, 'Grace Tan', 'Secretary');

-- Default settings
INSERT INTO settings (key, value) VALUES
  ('voting_enabled', 'true'),
  ('election_deadline', '2026-07-09T23:59:59')
ON CONFLICT (key) DO NOTHING;
