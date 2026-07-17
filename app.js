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
    // Verify DB connection by running a simple query
    await db.getTotalVoters();
    console.log('Database connected and ready');
  } catch (e) {
    console.error('Database connection failed:', e.message);
    console.error('The app will still start, but DB features will be unavailable.');
  }
})();

// ── Helpers ──

async function isElectionOver() {
  const deadlineStr = await db.getSetting('election_deadline', config.election.deadline);
  return Date.now() >= new Date(deadlineStr).getTime();
}

// ── Routes ──

app.get('/', (req, res) => {
  if (req.session.sid) return res.redirect('/home');
  res.render('login', { title: config.election.title, error: null });
});

// /login redirects to / for convenience
app.get('/login', (req, res) => res.redirect('/'));

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
  res.render('candidate', { title: config.election.title, candidate, members, view: req.query.view === '1' });
}));

// ── Vote (guarded) ──

app.post('/vote', requireAuth, asyncRoute(async (req, res) => {
  if (await isElectionOver()) {
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
  const { cname, sid } = req.body;
  if (!cname) return res.redirect('/teacher?error=Name is required');
  if (sid) {
    const student = await db.findStudent(sid);
    if (!student) return res.redirect('/teacher?error=Student ID not found');
    const existingCandidate = await db.getCandidateBySid(sid);
    if (existingCandidate) return res.redirect('/teacher?error=SID already linked to ' + existingCandidate.cname);
  }
  await db.addCandidate(cname, null, sid || null);
  res.redirect('/teacher?success=Candidate added');
}));

app.post('/teacher/candidate/delete', requireTeacher, asyncRoute(async (req, res) => {
  const cid = parseInt(req.body.cid, 10);
  if (!cid) return res.redirect('/teacher?error=Invalid candidate');
  await db.deleteCandidate(cid);
  res.redirect('/teacher?success=Candidate deleted');
}));

app.post('/teacher/candidate/member/add', requireTeacher, asyncRoute(async (req, res) => {
  const cid = parseInt(req.body.cid, 10);
  const mname = (req.body.mname || '').trim();
  const role = (req.body.role || '').trim();
  if (!cid || !mname) return res.redirect('/teacher/candidate/edit/' + cid + '?error=Member name is required');
  await db.addMember(cid, mname, role);
  res.redirect('/teacher/candidate/edit/' + cid + '?success=Member added');
}));

app.post('/teacher/candidate/member/delete', requireTeacher, asyncRoute(async (req, res) => {
  const memberId = parseInt(req.body.member_id, 10);
  const cid = parseInt(req.body.cid, 10);
  if (!memberId) return res.redirect('/teacher?error=Invalid member');
  await db.deleteMember(memberId);
  res.redirect('/teacher/candidate/edit/' + cid + '?success=Member removed');
}));

app.get('/teacher/candidate/edit/:cid', requireTeacher, asyncRoute(async (req, res) => {
  const cid = parseInt(req.params.cid, 10);
  const raw = await db.getCandidate(cid);
  if (!raw) return res.redirect('/teacher?error=Candidate not found');
  const candidate = { CID: raw.cid, CNAME: raw.cname, DESC: raw.description, SID: raw.sid };
  const members = await db.getMembers(cid);
  const memberList = members.map(m => ({ ID: m.id, MNAME: m.mname, POSITION: m.position }));
  res.render('teacher-candidate-edit', {
    title: config.election.title,
    candidate,
    members: memberList,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}));

app.post('/teacher/candidate/edit/:cid', requireTeacher, asyncRoute(async (req, res) => {
  const cid = parseInt(req.params.cid, 10);
  const { cname, sid } = req.body;
  if (!cname) return res.redirect('/teacher/candidate/edit/' + cid + '?error=Name is required');
  // Preserve existing description (candidates manage it themselves)
  const current = await db.getCandidate(cid);
  if (!current) return res.redirect('/teacher?error=Candidate not found');
  if (sid) {
    const student = await db.findStudent(sid);
    if (!student) return res.redirect('/teacher/candidate/edit/' + cid + '?error=Student ID not found');
    const existingCandidate = await db.getCandidateBySid(sid);
    if (existingCandidate && existingCandidate.cid !== cid) return res.redirect('/teacher/candidate/edit/' + cid + '?error=SID already linked to ' + existingCandidate.cname);
  }
  await db.updateCandidate(cid, cname, current.description, sid || null);
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
  const members = rawMembers.map(m => ({ ID: m.id, MNAME: m.mname, POSITION: m.position }));
  res.render('candidate-panel', {
    title: config.election.title,
    candidate,
    members,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}));

// ── Candidate Panel: Manage Profile ──

app.post('/candidate-panel/description', requireAuth, asyncRoute(async (req, res) => {
  const candidate = await db.getCandidateBySid(req.session.sid);
  if (!candidate) return res.status(403).send('Not a candidate');
  const desc = (req.body.description || '').trim();
  await db.updateCandidateDescription(candidate.cid, desc);
  res.redirect('/candidate-panel?success=Description updated');
}));

app.post('/candidate-panel/member/add', requireAuth, asyncRoute(async (req, res) => {
  const candidate = await db.getCandidateBySid(req.session.sid);
  if (!candidate) return res.status(403).send('Not a candidate');
  const mname = (req.body.mname || '').trim();
  const role = (req.body.role || '').trim();
  if (!mname) return res.redirect('/candidate-panel?error=Member name is required');
  await db.addMember(candidate.cid, mname, role);
  res.redirect('/candidate-panel?success=Member added');
}));

app.post('/candidate-panel/member/delete', requireAuth, asyncRoute(async (req, res) => {
  const candidate = await db.getCandidateBySid(req.session.sid);
  if (!candidate) return res.status(403).send('Not a candidate');
  const memberId = parseInt(req.body.member_id, 10);
  if (!memberId) return res.redirect('/candidate-panel?error=Invalid member');
  // Verify the member belongs to this candidate
  const members = await db.getMembers(candidate.cid);
  if (!members.find(m => m.id === memberId)) return res.redirect('/candidate-panel?error=Member not found');
  await db.deleteMember(memberId);
  res.redirect('/candidate-panel?success=Member removed');
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
