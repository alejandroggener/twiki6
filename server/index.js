const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const cron = require('node-cron')
const fetch = (...args) => import('node-fetch').then(mod => mod.default(...args));

const DB_PATH = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(DB_PATH);

// Helper to get two random Spanish Wikipedia titles
async function getRandomWikiPair() {
  const url = 'https://es.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=2&format=json'
  const res = await fetch(url)
  const data = await res.json()
  const pages = data.query?.random || []
  if (pages.length < 2) return ['España', 'Leonardo_da_Vinci']
  return pages.map(p => p.title.replace(/ /g, '_'))
}

// Schedule daily pair update at 00:00 GMT
cron.schedule('0 0 * * *', async () => {
  try {
    const [start, end] = await getRandomWikiPair()
    const today = (new Date()).toISOString().slice(0,10)
    db.run('INSERT OR REPLACE INTO daily (date, start, end) VALUES (?,?,?)', [today, start, end], function(err){
      if(err) console.error('Error updating daily pair:', err)
      else console.log('Daily pair updated:', start, '→', end)
    })
  } catch (e) {
    console.error('Error fetching random Wikipedia pair:', e)
  }
}, {
  timezone: 'Etc/GMT'
})

// Create daily_stats table for summaries
db.run(`CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY,
  step_counts TEXT,   -- JSON string: { "1": 5, "2": 10, ... }
  surrendered INTEGER
)`)

// Helper to summarize and clean up yesterday's results
async function summarizeAndCleanupResults() {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10)
  db.all('SELECT steps, surrendered FROM results WHERE date = ?', [yesterday], (err, rows) => {
    if (err) return console.error('Error reading results:', err)
    if (!rows || rows.length === 0) return

    // Aggregate step counts and surrendered
    const stepCounts = {}
    let surrendered = 0
    rows.forEach(r => {
      if (r.surrendered) surrendered++
      else stepCounts[r.steps] = (stepCounts[r.steps]||0) + 1
    })

    // Save summary
    db.run('INSERT OR REPLACE INTO daily_stats (date, step_counts, surrendered) VALUES (?,?,?)',
      [yesterday, JSON.stringify(stepCounts), surrendered],
      function(err){
        if (err) console.error('Error saving daily_stats:', err)
        else {
          // Delete detailed results for yesterday
          db.run('DELETE FROM results WHERE date = ?', [yesterday], function(err){
            if (err) console.error('Error deleting old results:', err)
            else console.log('Summarized and cleaned up results for', yesterday)
          })
        }
      }
    )
  })
}

// Schedule summary and cleanup at 00:05 GMT every day
cron.schedule('5 0 * * *', summarizeAndCleanupResults, { timezone: 'Etc/GMT' })

const app = express();
app.use(cors());

const clientDist = path.join(__dirname, '..', 'client', 'dist');
// Serve static files from client/dist
app.use(express.static(clientDist));

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

// SPA fallback: return index.html for any path the client handles
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server listening on', PORT));