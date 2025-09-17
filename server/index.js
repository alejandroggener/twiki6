const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(DB_PATH);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize DB
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS daily (date TEXT PRIMARY KEY, start TEXT, end TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, steps INTEGER, surrendered INTEGER, timestamp INTEGER)`);
});

// Get today's pair (server chooses by date)
app.get('/api/today', (req, res) => {
  const today = (new Date()).toISOString().slice(0,10);
  db.get('SELECT start,end FROM daily WHERE date = ?', [today], (err,row) => {
    if(err) return res.status(500).json({error: err.message});
    if(row) return res.json({date: today, start: row.start, end: row.end});
    // fallback: return a default pair if none seeded
    return res.json({date: today, start: 'España', end: 'Leonardo_da_Vinci'});
  });
});

// Submit result
app.post('/api/result', (req, res) => {
  const { date, steps, surrendered } = req.body;
  const ts = Date.now();
  db.run('INSERT INTO results (date, steps, surrendered, timestamp) VALUES (?,?,?,?)', [date, steps, surrendered?1:0, ts], function(err){
    if(err) return res.status(500).json({error: err.message});
    return res.json({ok:true, id: this.lastID});
  });
});

// Get stats for a date (distribution and percentiles)
app.get('/api/stats', (req, res) => {
  const date = req.query.date || (new Date()).toISOString().slice(0,10);
  db.all('SELECT steps, surrendered FROM results WHERE date = ?', [date], (err, rows) => {
    if(err) return res.status(500).json({error: err.message});
    if(!rows) rows = [];
    // Build distribution map of steps (include surrendered in +11 bin)
    const distribution = {};
    const stepsArray = [];
    rows.forEach(r => {
      if (r.surrendered) {
        // Always count surrendered in +11
        distribution[11] = (distribution[11]||0)+1;
      } else {
        distribution[r.steps] = (distribution[r.steps]||0)+1;
        stepsArray.push(r.steps);
      }
    });
    // compute percentiles helper
    res.json({distribution, total: rows.length, finished: stepsArray.length});
  });
});

// Admin: add daily pair (not secured — for demo only)
app.post('/api/admin/add', (req, res) => {
  const { date, start, end } = req.body;
  db.run('INSERT OR REPLACE INTO daily (date, start, end) VALUES (?,?,?)', [date, start, end], function(err){
    if(err) return res.status(500).json({error: err.message});
    res.json({ok:true});
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server listening on', PORT));