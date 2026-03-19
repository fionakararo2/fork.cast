const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Database Connection
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.getConnection((err, connection) => {
  if (err) console.error('❌ MySQL connection failed:', err);
  else { console.log('✅ Connected to MySQL'); connection.release(); }
});

// --- AUTH ---

// Signup
app.post('/api/auth/signup', (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

  db.query('SELECT id FROM users WHERE email = ?', [email], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length > 0) return res.status(400).json({ error: 'Account already exists' });

    const name = displayName || email.split('@')[0];
    db.query('INSERT INTO users (email, password, display_name) VALUES (?, ?, ?)',
      [email, password, name], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, userId: result.insertId, displayName: name });
      });
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(401).json({ error: 'User not found' });

    const user = results[0];
    if (user.password !== password) return res.status(401).json({ error: 'Incorrect password' });

    db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id], () => {});
    res.json({ success: true, user: { id: user.id, email: user.email, displayName: user.display_name } });
  });
});

// Change password
app.put('/api/auth/change-password', (req, res) => {
  const { userId, oldPassword, newPassword } = req.body;
  db.query('SELECT * FROM users WHERE id = ?', [userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'User not found' });
    if (results[0].password !== oldPassword) return res.status(401).json({ error: 'Incorrect current password' });

    db.query('UPDATE users SET password = ? WHERE id = ?', [newPassword, userId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// Update profile
app.put('/api/auth/update-profile', (req, res) => {
  const { userId, displayName, bio } = req.body;
  db.query('UPDATE users SET display_name = ?, bio = ? WHERE id = ?',
    [displayName, bio, userId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

// Get profile
app.get('/api/auth/profile/:userId', (req, res) => {
  db.query('SELECT id, email, display_name, bio, created_at, last_login FROM users WHERE id = ?',
    [req.params.userId], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, profile: results[0] });
    });
});

// --- PREFERENCES ---

app.post('/api/preferences/save', (req, res) => {
  const { userId, prefs } = req.body;
  const sql = `INSERT INTO preferences (userId, prefs_json) VALUES (?, ?)
               ON DUPLICATE KEY UPDATE prefs_json = VALUES(prefs_json)`;
  db.query(sql, [userId, JSON.stringify(prefs)], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/preferences/:userId', (req, res) => {
  db.query('SELECT prefs_json FROM preferences WHERE userId = ?', [req.params.userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.json({ success: true, prefs: null });
    res.json({ success: true, prefs: JSON.parse(results[0].prefs_json) });
  });
});

// --- MEAL PLANS ---

app.post('/api/plans/save', (req, res) => {
  const { userId, plan, timePeriod } = req.body;
  const sql = `INSERT INTO meal_plans (userId, plan_json, time_period) VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE plan_json = VALUES(plan_json), time_period = VALUES(time_period)`;
  db.query(sql, [userId, JSON.stringify(plan), timePeriod], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/plans/:userId', (req, res) => {
  db.query('SELECT plan_json, time_period FROM meal_plans WHERE userId = ?', [req.params.userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.json({ success: true, plan: null });
    res.json({ success: true, plan: JSON.parse(results[0].plan_json), timePeriod: results[0].time_period });
  });
});

// --- FAVORITES ---

app.post('/api/favorites/save', (req, res) => {
  const { userId, favorites } = req.body;
  const sql = `INSERT INTO favorites (userId, favorites_json) VALUES (?, ?)
               ON DUPLICATE KEY UPDATE favorites_json = VALUES(favorites_json)`;
  db.query(sql, [userId, JSON.stringify(favorites)], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/favorites/:userId', (req, res) => {
  db.query('SELECT favorites_json FROM favorites WHERE userId = ?', [req.params.userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.json({ success: true, favorites: [] });
    res.json({ success: true, favorites: JSON.parse(results[0].favorites_json) });
  });
});

// --- ACTIVITY LOG ---

app.post('/api/activity/log', (req, res) => {
  const { userId, action, details } = req.body;
  db.query('INSERT INTO activity_log (userId, action, details) VALUES (?, ?, ?)',
    [userId, action, details], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

app.get('/api/activity/:userId', (req, res) => {
  db.query('SELECT action, details, created_at FROM activity_log WHERE userId = ? ORDER BY created_at DESC LIMIT 10',
    [req.params.userId], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, activity: results });
    });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Fork.cast server live on port ${PORT}`);
});
