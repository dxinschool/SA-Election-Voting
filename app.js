const express = require('express');
const session = require('express-session');
const db = require('./db');
const config = require('./config');

const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: 'sba-election-secret-key',
  resave: false,
  saveUninitialized: false,
}));

// ── Async route wrapper ──

const asyncRoute = fn => (req, res, next) => fn(req, res, next).catch(next);

// ── Pass config to all templates ──

app.use(async (req, res, next) => {
  try {
    res.locals.deadline = await db.getSetting('election_deadline', config.election.deadline);
  } catch (e) {
    res.locals.deadline = config.election.deadline;
  }
  next();
});

// ── Auth middleware ──

function requireAuth(req, res, next) {
  if (!req.session.sid) return res.redirect('/');
  next();
}

// ── Init DB ──

(async () => {
  try {
    await db.initSchema();
    await db.seed();
    console.log('Database connected and ready');
  } catch (e) {
    console.error('Database connection failed:', e.message);
    console.error('The app will still start, but DB features will be unavailable.');
    console.error('If deploying, ensure the cloud platform has IPv6 connectivity.');
  }
})();

// ── Helpers ──

function isElectionOver() {
  return Date.now() >= new Date(config.election.deadline).getTime();
}

// ── Routes ──

app.get('/', (req, res) => {
  if (req.session.sid) return res.redirect('/home');
  res.render('login', { title: config.election.title, error: null });
});

app.post('/login', asyncRoute(async (req, res) => {
  const student = await db.findStudent(req.body.sid);
  if (!student) return res.render('login', { title: config.election.title, error: 'Invalid Student ID' });
  req.session.sid = student.sid;
  res.redirect('/home');
}));

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ── Registration ──

app.get('/register', (req, res) => {
  res.render('register', { title: config.election.title, error: null, success: null });
});

app.post('/register', asyncRoute(async (req, res) => {
  const { sid, sname, section, email } = req.body;
  if (!sid || !sname || !section) {
    return res.render('register', { title: config.election.title, error: 'SID, Name, and Section are required.', success: null });
  }
  const existing = await db.findStudent(sid);
  if (existing) {
    return res.render('register', { title: config.election.title, error: 'Student ID already registered.', success: null });
  }
  await db.addStudent(sid, sname, section, email || null);
  res.render('register', { title: config.election.title, error: null, success: 'Registered successfully! You can now sign in.' });
}));

// ── Home ──

app.get('/home', requireAuth, asyncRoute(async (req, res) => {
  const raw = await db.findStudent(req.session.sid);
  const student = { SID: raw.sid, SNAME: raw.sname, SECTION: raw.section, EMAIL: raw.email };
  const all = await db.getAllCandidates();
  const voted = await db.hasVoted(req.session.sid);
  const totalVoters = await db.getTotalVoters();
  const candidateFlag = await db.isCandidate(req.session.sid);
  const votingEnabled = await db.getSetting('voting_enabled', 'true') === 'true';
  res.render('home', {
    title: config.election.title,
    student,
    candidates: all,
    totalVoters,
    voted,
    isCandidate: candidateFlag,
    votingEnabled,
    success: req.query.voted === '1',
  });
}));

// ── Candidates ──

app.get('/candidates', requireAuth, asyncRoute(async (req, res) => {
  const raw = await db.getAllCandidates();
  const candidates = raw.map(c => ({ CID: c.cid, CNAME: c.cname, SLUG: c.slug, DESC: c.description }));
  const viewOnly = req.query.view === '1';
  const votingEnabled = await db.getSetting('voting_enabled', 'true') === 'true';
  res.render('candidates', { title: config.election.title, candidates, viewOnly, votingEnabled });
}));

app.get('/candidate/:slug', requireAuth, asyncRoute(async (req, res) => {
  const raw = await db.getCandidateBySlug(req.params.slug);
  if (!raw) return res.status(404).send('Association not found');
  const candidate = { CID: raw.cid, CNAME: raw.cname, SLUG: raw.slug, DESC: raw.description };
  const rawMembers = await db.getMembers(raw.cid);
  const members = rawMembers.map(m => ({ MNAME: m.mname, POSITION: m.position }));
  res.render('candidate', { title: config.election.title, candidate, members });
}));

// ── Vote (guarded) ──

app.post('/vote', requireAuth, asyncRoute(async (req, res) => {
  if (isElectionOver()) {
    return res.status(403).send('Voting has ended.');
  }
  if (await db.isCandidate(req.session.sid)) {
    return res.status(403).send('Candidates cannot vote.');
  }
  if (await db.getSetting('voting_enabled', 'true') !== 'true') {
    return res.status(403).send('Voting is currently disabled by the administrator.');
  }
  const sid = req.session.sid;
  const preferences = [];
  for (let i = 1; i <= 10; i++) {
    const key = 'pref' + i;
    if (req.body[key] && req.body[key] !== '') {
      preferences.push(parseInt(req.body[key], 10));
    } else {
      break;
    }
  }
  await db.castVote(sid, preferences);
  res.redirect('/home?voted=1');
}));

// ── Results (public) ──

app.get('/results', asyncRoute(async (req, res) => {
  const data = await db.getResults();
  const rawCandidates = await db.getAllCandidates();
  const candidates = rawCandidates.map(c => ({ CID: c.cid, CNAME: c.cname }));
  res.render('results', {
    title: config.election.title,
    winner: data.winner,
    totalVoters: data.totalVoters,
    blankVotes: data.blankVotes,
    rounds: data.rounds,
    candidates,
  });
}));

// ── Teacher / Admin ──

function requireTeacher(req, res, next) {
  if (!req.session.teacher) return res.redirect('/teacher/login');
  next();
}

app.get('/teacher', requireTeacher, asyncRoute(async (req, res) => {
  const totalStudents = await db.getTotalVoters();
  const totalVoted = await db.getTotalVotesCast();
  const blankVotes = await db.getBlankVotes();
  const rawCandidates = await db.getAllCandidates();
  const candidates = rawCandidates.map(c => ({ CID: c.cid, CNAME: c.cname, DESC: c.description }));
  const rawDeadline = await db.getSetting('election_deadline', config.election.deadline);
  const votingEnabled = await db.getSetting('voting_enabled', 'true') === 'true';
  const d = new Date(rawDeadline);
  const deadlineInput = d.toISOString().slice(0, 16);
  const deadlineDisplay = d.toLocaleString();
  res.render('teacher', {
    title: config.election.title,
    totalStudents,
    totalVoted,
    blankVotes,
    candidates,
    votingEnabled,
    deadlineInput,
    deadlineDisplay,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}));

app.get('/teacher/login', (req, res) => {
  if (req.session.teacher) return res.redirect('/teacher');
  res.render('teacher-login', { title: config.election.title, error: null });
});

app.post('/teacher/login', (req, res) => {
  if (req.body.password === config.admin.password) {
    req.session.teacher = true;
    return res.redirect('/teacher');
  }
  res.render('teacher-login', { title: config.election.title, error: 'Incorrect password.' });
});

app.get('/teacher/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/teacher/login'));
});

app.post('/teacher/settings', requireTeacher, asyncRoute(async (req, res) => {
  if (req.body.deadline) {
    const deadlineStr = req.body.deadline + ':59';
    await db.setSetting('election_deadline', deadlineStr);
    res.redirect('/teacher?success=Deadline updated');
  } else {
    res.redirect('/teacher?success=No change');
  }
}));

app.post('/teacher/reset', requireTeacher, asyncRoute(async (req, res) => {
  await db.resetElection();
  res.redirect('/teacher?success=Election reset successfully');
}));

app.post('/teacher/toggle-voting', requireTeacher, asyncRoute(async (req, res) => {
  const current = await db.getSetting('voting_enabled', 'true') === 'true';
  await db.setSetting('voting_enabled', current ? 'false' : 'true');
  res.redirect('/teacher?success=Voting ' + (current ? 'disabled' : 'enabled'));
}));

app.post('/teacher/candidate/add', requireTeacher, asyncRoute(async (req, res) => {
  const { cname, sid, desc } = req.body;
  if (!cname) return res.redirect('/teacher?error=Name is required');
  if (sid) {
    const student = await db.findStudent(sid);
    if (!student) return res.redirect('/teacher?error=Student ID not found');
  }
  await db.addCandidate(cname, desc || null, sid || null);
  res.redirect('/teacher?success=Candidate added');
}));

app.post('/teacher/candidate/delete', requireTeacher, asyncRoute(async (req, res) => {
  const cid = parseInt(req.body.cid, 10);
  if (!cid) return res.redirect('/teacher?error=Invalid candidate');
  await db.deleteCandidate(cid);
  res.redirect('/teacher?success=Candidate deleted');
}));

app.get('/teacher/candidate/edit/:cid', requireTeacher, asyncRoute(async (req, res) => {
  const cid = parseInt(req.params.cid, 10);
  const raw = await db.getCandidate(cid);
  if (!raw) return res.redirect('/teacher?error=Candidate not found');
  const candidate = { CID: raw.cid, CNAME: raw.cname, DESC: raw.description, SID: raw.sid };
  res.render('teacher-candidate-edit', { title: config.election.title, candidate, error: null });
}));

app.post('/teacher/candidate/edit/:cid', requireTeacher, asyncRoute(async (req, res) => {
  const cid = parseInt(req.params.cid, 10);
  const { cname, sid, desc } = req.body;
  if (!cname) return res.redirect('/teacher/candidate/edit/' + cid + '?error=Name is required');
  if (sid) {
    const student = await db.findStudent(sid);
    if (!student) return res.redirect('/teacher/candidate/edit/' + cid + '?error=Student ID not found');
  }
  await db.updateCandidate(cid, cname, desc || null, sid || null);
  res.redirect('/teacher?success=Candidate updated');
}));

// ── Candidate Panel ──

app.get('/candidate-panel', requireAuth, asyncRoute(async (req, res) => {
  if (!(await db.isCandidate(req.session.sid))) {
    return res.status(403).send('You are not a candidate.');
  }
  const raw = await db.getCandidateBySid(req.session.sid);
  if (!raw) return res.status(404).send('Candidate not found');
  const candidate = { CID: raw.cid, CNAME: raw.cname, SLUG: raw.slug, DESC: raw.description };
  const rawMembers = await db.getMembers(raw.cid);
  const members = rawMembers.map(m => ({ MNAME: m.mname, POSITION: m.position }));
  res.render('candidate-panel', { title: config.election.title, candidate, members });
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
