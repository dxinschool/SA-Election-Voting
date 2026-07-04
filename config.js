module.exports = {
  election: {
    deadline: '2026-07-09T23:59:59',
    title: 'SBA Election 2026',
  },
  admin: {
    password: 'teacher123',
  },
  database: {
    url: process.env.DATABASE_URL, // must be set via environment variable
  },
};
