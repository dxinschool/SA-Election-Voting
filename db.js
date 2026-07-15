const { Pool } = require('pg');
const config = require('./config');

let pool;

function getPool() {
  if (!pool) {
    const conn = process.env.DATABASE_URL;
    if (!conn) throw new Error('DATABASE_URL environment variable is required');
    pool = new Pool({
      connectionString: conn,
      ssl: { rejectUnauthorized: false },
      family: 4,
    });
  }
  return pool;
}

// ── Helpers ──

async function queryAll(sql, params) {
  const result = await getPool().query(sql, params);
  return result.rows;
}

async function queryOne(sql, params) {
  const rows = await queryAll(sql, params);
  return rows[0] || null;
}

async function run(sql, params) {
  await getPool().query(sql, params);
}

// ── Init ──

async function initSchema() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS students (
      sid TEXT PRIMARY KEY,
      sname TEXT NOT NULL,
      section TEXT NOT NULL,
      email TEXT
    )
  `);

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS candidates (
      cid SERIAL PRIMARY KEY,
      cname TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      sid TEXT REFERENCES students(sid),
      position TEXT DEFAULT ''
    )
  `);

  // Migration: add sid + position columns, and enforce unique SID per candidate
  await getPool().query(`
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS sid TEXT REFERENCES students(sid)
  `).catch(() => {});

  await getPool().query(`
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS position TEXT DEFAULT ''
  `).catch(() => {});

  // Unique index prevents one SID being linked to multiple candidates (multiple NULLs allowed)
  await getPool().query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_sid ON candidates(sid)
  `).catch(() => {});

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      cid INTEGER NOT NULL REFERENCES candidates(cid),
      mname TEXT NOT NULL,
      position TEXT NOT NULL
    )
  `);

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS ballots (
      voter_sid TEXT PRIMARY KEY REFERENCES students(sid),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      voter_sid TEXT NOT NULL REFERENCES ballots(voter_sid),
      candidate_cid INTEGER NOT NULL REFERENCES candidates(cid),
      preference INTEGER NOT NULL CHECK(preference >= 1),
      UNIQUE(voter_sid, preference),
      UNIQUE(voter_sid, candidate_cid)
    )
  `);

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  console.log('Schema ready');
}

// ── Seed ──

async function seed() {
  const existing = await queryAll('SELECT COUNT(*)::int AS count FROM candidates');
  if (existing[0].count > 0) {
    console.log('Already seeded, skipping');
    return;
  }

  await run("INSERT INTO students (sid, sname, section, email) VALUES ($1, $2, $3, $4)", ['SBA-2401', 'Juan Dela Cruz', 'Grade 12 - STEM A', 'juan@example.com']);
  await run("INSERT INTO students (sid, sname, section, email) VALUES ($1, $2, $3, $4)", ['SBA-2402', 'Maria Reyes', 'Grade 12 - STEM B', 'maria@example.com']);
  await run("INSERT INTO students (sid, sname, section, email) VALUES ($1, $2, $3, $4)", ['SBA-2403', 'Carlos Santos', 'Grade 11 - ABM A', 'carlos@example.com']);
  await run("INSERT INTO students (sid, sname, section, email) VALUES ($1, $2, $3, $4)", ['SBA-2404', 'Ana Gonzales', 'Grade 11 - HUMSS B', 'ana@example.com']);
  await run("INSERT INTO students (sid, sname, section, email) VALUES ($1, $2, $3, $4)", ['SBA-2405', 'Pedro Lim', 'Grade 12 - STEM A', 'pedro@example.com']);

  await run("INSERT INTO students (sid, sname, section, email) VALUES ($1, $2, $3, $4)", ['SBA-2406', 'Maria Santos', 'Grade 12 - STEM B', 'maria.santos@example.com']);
  await run("INSERT INTO students (sid, sname, section, email) VALUES ($1, $2, $3, $4)", ['SBA-2407', 'Jose Garcia', 'Grade 11 - ABM A', 'jose.garcia@example.com']);
  await run("INSERT INTO students (sid, sname, section, email) VALUES ($1, $2, $3, $4)", ['SBA-2408', 'Elena Rodriguez', 'Grade 12 - HUMSS A', 'elena.rodriguez@example.com']);

  await run("INSERT INTO candidates (cname, slug, description, sid, position) VALUES ($1, $2, $3, $4, $5)", ['Maria Santos', 'maria-santos', 'Improve campus facilities, add more student lounges, and strengthen the SBA funding for club activities.', 'SBA-2406', 'President']);
  await run("INSERT INTO candidates (cname, slug, description, sid, position) VALUES ($1, $2, $3, $4, $5)", ['Jose Garcia', 'jose-garcia', 'Focus on academic support programs, tutoring centers, and mental health awareness campaigns.', 'SBA-2407', 'Vice President']);
  await run("INSERT INTO candidates (cname, slug, description, sid, position) VALUES ($1, $2, $3, $4, $5)", ['Elena Rodriguez', 'elena-rodriguez', 'Promote environmental sustainability, tree planting initiatives, and eco-friendly school policies.', 'SBA-2408', 'Secretary']);

  await run("INSERT INTO members (cid, mname, position) VALUES ($1, $2, $3)", [1, 'Anna Reyes', 'Campaign Manager']);
  await run("INSERT INTO members (cid, mname, position) VALUES ($1, $2, $3)", [1, 'Ben Torres', 'Treasurer']);
  await run("INSERT INTO members (cid, mname, position) VALUES ($1, $2, $3)", [2, 'Carla Gomez', 'Campaign Manager']);
  await run("INSERT INTO members (cid, mname, position) VALUES ($1, $2, $3)", [2, 'Ding Cruz', 'Logistics Head']);
  await run("INSERT INTO members (cid, mname, position) VALUES ($1, $2, $3)", [3, 'Franco Lopez', 'Campaign Manager']);
  await run("INSERT INTO members (cid, mname, position) VALUES ($1, $2, $3)", [3, 'Grace Tan', 'Secretary']);

  console.log('Seed data inserted');
}

// ── Queries ──

async function findStudent(sid) {
  return queryOne('SELECT * FROM students WHERE sid = $1', [sid]);
}

async function addStudent(sid, sname, section, email) {
  await run('INSERT INTO students (sid, sname, section, email) VALUES ($1, $2, $3, $4)', [sid, sname, section, email]);
}

async function getAllCandidates() {
  return queryAll('SELECT * FROM candidates ORDER BY cid');
}

async function getCandidateBySlug(slug) {
  return queryOne('SELECT * FROM candidates WHERE slug = $1', [slug]);
}

async function getCandidate(cid) {
  return queryOne('SELECT * FROM candidates WHERE cid = $1', [cid]);
}

async function updateCandidate(cid, cname, description, sid, position) {
  await run('UPDATE candidates SET cname = $1, description = $2, sid = $3, position = $4 WHERE cid = $5',
    [cname, description || null, sid || null, position || '', cid]);
}

async function updateCandidateDescription(cid, description) {
  await run('UPDATE candidates SET description = $1 WHERE cid = $2', [description, cid]);
}

async function getCandidateBySid(sid) {
  return queryOne('SELECT * FROM candidates WHERE sid = $1', [sid]);
}

async function getMembers(cid) {
  return queryAll('SELECT * FROM members WHERE cid = $1 ORDER BY id', [cid]);
}

async function addCandidate(cname, description, sid, position) {
  const slug = cname.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const result = await getPool().query(
    'INSERT INTO candidates (cname, slug, description, sid, position) VALUES ($1, $2, $3, $4, $5) RETURNING cid',
    [cname, slug, description || null, sid || null, position || '']
  );
  return result.rows[0].cid;
}

async function deleteCandidate(cid) {
  await run('DELETE FROM members WHERE cid = $1', [cid]);
  await run('DELETE FROM votes WHERE candidate_cid = $1', [cid]);
  await run('DELETE FROM candidates WHERE cid = $1', [cid]);
}

async function addMember(cid, mname, position) {
  const result = await getPool().query(
    'INSERT INTO members (cid, mname, position) VALUES ($1, $2, $3) RETURNING id',
    [cid, mname, position]
  );
  return result.rows[0].id;
}

async function deleteMember(id) {
  await run('DELETE FROM members WHERE id = $1', [id]);
}

async function hasVoted(sid) {
  const row = await queryOne('SELECT COUNT(*)::int AS count FROM ballots WHERE voter_sid = $1', [sid]);
  return row.count > 0;
}

async function getBallot(sid) {
  return queryAll(
    'SELECT candidate_cid, preference FROM votes WHERE voter_sid = $1 ORDER BY preference',
    [sid]
  );
}

async function castVote(sid, preferences) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM votes WHERE voter_sid = $1', [sid]);
    await client.query('DELETE FROM ballots WHERE voter_sid = $1', [sid]);

    await client.query('INSERT INTO ballots (voter_sid) VALUES ($1)', [sid]);

    for (let i = 0; i < preferences.length; i++) {
      await client.query(
        'INSERT INTO votes (voter_sid, candidate_cid, preference) VALUES ($1, $2, $3)',
        [sid, preferences[i], i + 1]
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getBlankVotes() {
  const row = await queryOne(
    "SELECT COUNT(*)::int AS count FROM ballots b WHERE NOT EXISTS (SELECT 1 FROM votes v WHERE v.voter_sid = b.voter_sid)"
  );
  return row.count;
}

async function getSetting(key, defaultValue) {
  const row = await queryOne('SELECT value FROM settings WHERE key = $1', [key]);
  return row ? row.value : defaultValue;
}

async function setSetting(key, value) {
  await run('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value]);
}

async function resetElection() {
  await run('DELETE FROM votes');
  await run('DELETE FROM ballots');
}

async function isCandidate(sid) {
  const row = await queryOne('SELECT COUNT(*)::int AS count FROM candidates WHERE sid = $1', [sid]);
  return row.count > 0;
}

async function getTotalVoters() {
  const row = await queryOne('SELECT COUNT(*)::int AS count FROM students');
  return row.count;
}

async function getTotalVotesCast() {
  const row = await queryOne('SELECT COUNT(*)::int AS count FROM ballots');
  return row.count;
}

// ── IRV Tallying ──

async function getResults() {
  const candidates = await getAllCandidates();
  const totalVoters = await getTotalVoters();
  const blankVotes = await getBlankVotes();

  const rows = await queryAll(
    'SELECT voter_sid, candidate_cid, preference FROM votes ORDER BY voter_sid, preference'
  );

  const ballotMap = {};
  for (const r of rows) {
    if (!ballotMap[r.voter_sid]) ballotMap[r.voter_sid] = [];
    ballotMap[r.voter_sid].push({ cid: r.candidate_cid, pref: r.preference });
  }
  const allBallots = Object.values(ballotMap);

  if (allBallots.length === 0) {
    return { rounds: [], winner: null, winnerPos: null, totalVoters, blankVotes };
  }

  const rounds = [];
  let eliminated = [];
  let remaining = candidates.map(c => c.cid);
  let roundNum = 1;

  while (remaining.length > 1) {
    const counts = {};
    remaining.forEach(cid => counts[cid] = 0);

    for (const ballot of allBallots) {
      for (const vote of ballot) {
        if (!eliminated.includes(vote.cid)) {
          counts[vote.cid]++;
          break;
        }
      }
    }

    const totalActive = Object.values(counts).reduce((s, x) => s + x, 0);
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    const voteData = remaining.map(cid => ({
      name: candidates.find(c => c.cid === cid).cname,
      count: counts[cid],
    }));

    if (sorted[0][1] > totalActive / 2) {
      rounds.push({ label: `Round ${roundNum}`, votes: voteData });
      break;
    }

    if (new Set(Object.values(counts)).size === 1) {
      rounds.push({ label: `Round ${roundNum}`, votes: voteData });
      break;
    }

    const minVote = Math.min(...Object.values(counts));
    const toEliminate = remaining.filter(cid => counts[cid] === minVote);
    const eliminatedName = toEliminate.map(cid => candidates.find(c => c.cid === cid)?.cname).filter(Boolean).join(', ');

    rounds.push({ label: `Round ${roundNum}`, votes: voteData, eliminated: eliminatedName });

    eliminated = [...eliminated, ...toEliminate];
    remaining = remaining.filter(cid => !eliminated.includes(cid));
    roundNum++;
  }

  let winner = null;
  let winnerPos = null;
  if (remaining.length > 0) {
    const finalCounts = {};
    remaining.forEach(cid => finalCounts[cid] = 0);
    for (const ballot of allBallots) {
      for (const vote of ballot) {
        if (!eliminated.includes(vote.cid)) {
          finalCounts[vote.cid]++;
          break;
        }
      }
    }
    const sortedFinal = Object.entries(finalCounts).sort((a, b) => b[1] - a[1]);
    if (sortedFinal.length > 0) {
      if (sortedFinal.length === 1 || sortedFinal[0][1] > sortedFinal[1][1]) {
        const winnerCid = parseInt(sortedFinal[0][0]);
        const winnerCandidate = candidates.find(c => c.cid === winnerCid);
        winner = winnerCandidate?.cname || null;
        winnerPos = winnerCandidate?.position || null;
      }
    }
  }

  return { rounds, winner, winnerPos, totalVoters, blankVotes };
}

async function close() {
  if (pool) await pool.end();
}

module.exports = {
  initSchema,
  seed,
  findStudent,
  addStudent,
  getAllCandidates,
  getCandidateBySlug,
  getCandidate,
  getCandidateBySid,
  updateCandidate,
  updateCandidateDescription,
  getMembers,
  addCandidate,
  deleteCandidate,
  addMember,
  deleteMember,
  hasVoted,
  isCandidate,
  getBallot,
  castVote,
  getResults,
  getBlankVotes,
  getTotalVoters,
  getTotalVotesCast,
  getSetting,
  setSetting,
  resetElection,
  close,
};
