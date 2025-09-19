const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = (...args) => import('node-fetch').then(mod => mod.default(...args));

// Use environment variable for database path in production
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data.db');
const db = new sqlite3.Database(DB_PATH);

async function getRandomWikiPair() {
  const url = 'https://es.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=2&format=json'
  const res = await fetch(url)
  const data = await res.json()
  const pages = data.query?.random || []
  if (pages.length < 2) return ['España', 'Leonardo_da_Vinci']
  return pages.map(p => p.title.replace(/ /g, '_'))
}

async function generateDailyPairs(startDate, days) {
  console.log(`Generating ${days} daily pairs starting from ${startDate}...`)
  
  // Create tables if they don't exist
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS daily (
        date TEXT PRIMARY KEY,
        start TEXT,
        end TEXT
      )`, (err) => {
        if (err) reject(err)
        else resolve()
      });
    });
  });

  const pairs = []
  const currentDate = new Date(startDate)
  
  for (let i = 0; i < days; i++) {
    const dateString = currentDate.toISOString().slice(0, 10)
    
    try {
      const [start, end] = await getRandomWikiPair()
      pairs.push({ date: dateString, start, end })
      console.log(`${i + 1}/${days}: ${dateString} - ${start} → ${end}`)
      
      // Small delay to be respectful to Wikipedia API
      await new Promise(resolve => setTimeout(resolve, 100))
      
    } catch (error) {
      console.error(`Error generating pair for ${dateString}:`, error)
      // Use fallback pair
      pairs.push({ date: dateString, start: 'España', end: 'Leonardo_da_Vinci' })
    }
    
    currentDate.setDate(currentDate.getDate() + 1)
  }
  
  // Insert all pairs into database
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const stmt = db.prepare('INSERT OR REPLACE INTO daily (date, start, end) VALUES (?, ?, ?)')
      
      pairs.forEach(({ date, start, end }) => {
        stmt.run([date, start, end])
      })
      
      stmt.finalize((err) => {
        if (err) reject(err)
        else {
          console.log(`Successfully inserted ${pairs.length} daily pairs`)
          resolve()
        }
      })
    })
  })
}

async function summarizeAndCleanupResults() {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10)
  
  return new Promise((resolve, reject) => {
    db.all('SELECT steps, surrendered FROM results WHERE date = ?', [yesterday], (err, rows) => {
      if (err) return reject(err)
      if (!rows || rows.length === 0) {
        console.log('No results to cleanup for', yesterday)
        return resolve()
      }

      // Aggregate step counts and surrendered
      const stepCounts = {}
      let surrendered = 0
      rows.forEach(r => {
        if (r.surrendered) surrendered++
        else stepCounts[r.steps] = (stepCounts[r.steps]||0) + 1
      })

      // Create daily_stats table if it doesn't exist
      db.run(`CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT PRIMARY KEY,
        step_counts TEXT,
        surrendered INTEGER
      )`, (err) => {
        if (err) return reject(err)
        
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
  })
}

// Main execution
(async () => {
  try {
    const args = process.argv.slice(2)
    
    if (args.includes('--cleanup-only')) {
      // Only run cleanup
      await summarizeAndCleanupResults()
      console.log('Cleanup completed successfully')
    } else {
      // Generate pairs for one year starting from today
      const today = new Date().toISOString().slice(0, 10)
      const daysToGenerate = args.includes('--days') ? 
        parseInt(args[args.indexOf('--days') + 1]) || 365 : 365
      
      console.log(`Starting daily pair generation for ${daysToGenerate} days from ${today}`)
      
      await generateDailyPairs(today, daysToGenerate)
      
      // Also run cleanup for yesterday's data
      await summarizeAndCleanupResults()
      
      console.log('All operations completed successfully')
    }
    
  } catch (error) {
    console.error('Error during execution:', error)
    process.exit(1)
  } finally {
    db.close()
  }
})();