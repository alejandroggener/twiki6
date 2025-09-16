const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname,'data.db'));
const today = (new Date()).toISOString().slice(0,10);

db.serialize(() => {
  // Create table if it doesn't exist
  db.run(`CREATE TABLE IF NOT EXISTS daily (
    date TEXT PRIMARY KEY,
    start TEXT,
    end TEXT
  )`);

  db.run('INSERT OR REPLACE INTO daily (date,start,end) VALUES (?,?,?)',
    [today, 'Pablo_Neruda', 'Isla_Negra'], 
    function(err){
      if(err) console.error(err);
      else console.log('Seeded today pair');
      db.close();
    }
  );
});