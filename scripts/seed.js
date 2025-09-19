const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = (...args) => import('node-fetch').then(mod => mod.default(...args));

// Use environment variable for database path in production
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'server', 'data.db');
const db = new sqlite3.Database(DB_PATH);

const today = (new Date()).toISOString().slice(0,10);

async function getRandomWikiPair() {
  const url = 'https://es.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=2&format=json'
  const res = await fetch(url)
  const data = await res.json()
  const pages = data.query?.random || []
  if (pages.length < 2) return ['España', 'Leonardo_da_Vinci']
  return pages.map(p => p.title.replace(/ /g, '_'))
}

async function summarizeAndCleanupResults() {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10)
  
  return new Promise((resolve, reject) => {
    db.all('SELECT steps, surrendered FROM results WHERE date = ?', [yesterday], (err, rows) => {
      if (err) return reject(err)
      if (!rows || rows.length === 0) return resolve()

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
          if (err) return reject(err)
          // Delete detailed results for yesterday
          db.run('DELETE FROM results WHERE date = ?', [yesterday], function(err){
            if (err) return reject(err)
            console.log('Summarized and cleaned up results for', yesterday)
            resolve()
          })
        }
      )
    })
  })
}

(async () => {
  try {
    // Update daily pair
    const [start, end] = await getRandomWikiPair();
    
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS daily (
          date TEXT PRIMARY KEY,
          start TEXT,
          end TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS daily_stats (
          date TEXT PRIMARY KEY,
          step_counts TEXT,
          surrendered INTEGER
        )`);

        db.run('INSERT OR REPLACE INTO daily (date,start,end) VALUES (?,?,?)',
          [today, start, end], 
          function(err){
            if(err) reject(err);
            else {
              console.log('Updated daily pair:', start, '→', end);
              resolve();
            }
          }
        );
      });
    });

    // Cleanup yesterday's data
    await summarizeAndCleanupResults();
    
    console.log('Daily update completed successfully');
    
  } catch (error) {
    console.error('Error during daily update:', error);
    process.exit(1);
  } finally {
    db.close();
  }
})();