const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = (...args) => import('node-fetch').then(mod => mod.default(...args));
const db = new sqlite3.Database(path.join(__dirname,'data.db'));
const today = (new Date()).toISOString().slice(0,10);

async function getRandomWikiPair() {
  const url = 'https://es.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=2&format=json'
  const res = await fetch(url)
  const data = await res.json()
  const pages = data.query?.random || []
  if (pages.length < 2) return ['España', 'Leonardo_da_Vinci']
  return pages.map(p => p.title.replace(/ /g, '_'))
}

(async () => {
  const [start, end] = await getRandomWikiPair();

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS daily (
      date TEXT PRIMARY KEY,
      start TEXT,
      end TEXT
    )`);

    db.run('INSERT OR REPLACE INTO daily (date,start,end) VALUES (?,?,?)',
      [today, start, end], 
      function(err){
        if(err) console.error(err);
        else console.log('Seeded today pair:', start, '→', end);
        db.close();
      }
    );
  });
})();