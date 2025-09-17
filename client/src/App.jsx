import React, { useEffect, useState, useMemo } from 'react'
import WikipediaRenderer from './WikipediaRenderer'
import confetti from 'canvas-confetti'
import logo from './logo.png'

const SERVER = import.meta.env.VITE_SERVER || 'http://localhost:4000'

function StepsGraph({ stats, highlightStep }) {
  // Always show steps 1-10 and "+11"
  const dist = stats?.distribution || {}
  const bars = []
  for (let i = 1; i <= 10; i++) {
    bars.push({ label: i, count: dist[i] || 0 })
  }
  // "+11" bar
  const plus11 = Object.entries(dist)
    .filter(([k]) => parseInt(k,10) >= 11)
    .reduce((sum, [,v]) => sum+v, 0)
  bars.push({ label: '+11', count: plus11 })

  // Determine which bar to highlight
  let highlightIndex = null
  if (highlightStep !== undefined && highlightStep !== null) {
    highlightIndex = highlightStep >= 11 ? 10 : highlightStep - 1
  }

  return (
    <div>
      <div style={{fontWeight:400,fontSize:15,color:'#6b7280',marginBottom:8}}>
        Total jugadores: {Object.values(dist).reduce((a,b)=>a+b,0)}
      </div>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
        <div className="bars" style={{marginBottom: '8px'}}>
          {bars.map(({label,count}, idx) => (
            <div key={label} className="bar-item">
              {count > 0 && <div className="bar-count">{count}</div>}
              <div
                className="bar"
                style={{
                  height: Math.min(200, 20*count)+'px',
                  background: idx === highlightIndex ? '#b6f5c9' : undefined // pastel green
                }}
              ></div>
            </div>
          ))}
        </div>
        <div className="bars" style={{marginTop: '0'}}>
          {bars.map(({label}) => (
            <div key={label} className="bar-item">
              <div className="bar-label">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [todayPair, setTodayPair] = useState(null)
  const [phase, setPhase] = useState('front') // front, play, results
  const [steps, setSteps] = useState(0)
  const [currentPageTitle, setCurrentPageTitle] = useState(null)
  const [surrendered, setSurrendered] = useState(false)
  const [stats, setStats] = useState(null)
  const [fade, setFade] = useState(false)

  // Fetch today pair and stats
  useEffect(() => {
    fetch(`${SERVER}/api/today`).then(r => r.json()).then(setTodayPair)
    fetch(`${SERVER}/api/stats`).then(r => r.json()).then(setStats)
  }, [])

  useEffect(() => {
    if (phase === 'results' && !surrendered) {
      // Wait for the icon to reach the center (1s)
      setTimeout(() => {
        const canvas = document.getElementById('confetti-canvas')
        if (canvas) {
          confetti.create(canvas, { resize: true })({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.5 }
          })
        }
      }, 500)
    }
  }, [phase, surrendered])

  const startGame = () => {
    if (!todayPair) return
    setSteps(0)
    setSurrendered(false)
    setCurrentPageTitle(todayPair.start)
    setPhase('play')
  }

  const onLinkClick = (title) => {
    setFade(true) // start fade-out
    setTimeout(() => {
      setSteps(s => s + 1)
      if (title === todayPair.end) {
        setCurrentPageTitle(title)
        fetch(`${SERVER}/api/result`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ date: todayPair.date, steps: steps + 1, surrendered: false })
        })
          .then(() => fetch(`${SERVER}/api/stats?date=${todayPair.date}`).then(r => r.json()).then(setStats))
          .catch(() => { })
        setPhase('results')
      } else {
        setCurrentPageTitle(title)
      }
      setFade(false) // fade-in new page
    }, 150) // fade duration
  }

  const surrender = () => {
    setSurrendered(true)
    fetch(`${SERVER}/api/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: todayPair.date, steps: 11, surrendered: true })
    })
      .then(() => fetch(`${SERVER}/api/stats?date=${todayPair.date}`).then(r => r.json()).then(setStats))
      .catch(() => { })
    setPhase('results')
  }

  const percentileText = useMemo(() => {
    if (!stats || stats.finished === 0 || phase !== 'results' || surrendered) return null
    const dist = stats.distribution || {}
    let better = 0, total = 0
    Object.entries(dist).forEach(([k, v]) => { const s = parseInt(k, 10); if (s > steps) better += v; total += v; })
    if (total === 0) return 'Eres el primer jugador en terminar hoy!'
    const pct = Math.round((better / total) * 100)
    return `Mejor que ${pct}% de jugadores que terminaron hoy`
  }, [stats, steps, phase, surrendered])

  return (
    <div className="page">
      <header className="header">
        <img src={logo} alt="Logo" style={{height:40, verticalAlign:'middle', marginRight:8}} />
      </header>

      {/* Front page */}
      {phase === 'front' && todayPair && (
        <main className="card">
          <h2>Conecta:</h2>
          <div className="pair">
            <div className="concept">{todayPair.start.replace(/_/g, ' ')}</div>
            <div className="arrow">→</div>
            <div className="concept">{todayPair.end.replace(/_/g, ' ')}</div>
          </div>

          <div className="graph">
            <h4>Datos de hoy</h4>
            <StepsGraph stats={stats} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <button className="btn" onClick={startGame}>Empezar</button>
          </div>
        </main>
      )}

      {/* Game page */}
      {phase === 'play' && currentPageTitle && (
        <main className="game">
          <div className="topbar">
            <div><strong>Objetivo: </strong>{todayPair.end.replace(/_/g, ' ')}</div>
            <div>Pasos: {steps}</div>
            <button className="btn small" onClick={surrender}>Rendirse</button>
          </div>

          <div className={`wiki-window ${fade ? 'fade' : ''}`}>
            <WikipediaRenderer title={currentPageTitle} onLinkClick={onLinkClick} />
          </div>
        </main>
      )}

      {/* Results page */}
      {phase === 'results' && (
        <main className="card">
          {surrendered ? (
            <>
              <h2>Te rendiste</h2>
              <p>No te preocupes, hoy era bastante complicado. Prueba suerte mañana</p>
              <p>Puedes practicar tantas veces como quieras en&nbsp;
                  <a href="https://wikispeedrun.org/" target="_blank" rel="noopener noreferrer">
                    Wiki SpeedRun
                  </a>
              </p>
            </>
          ) : (
            <>
              <h2>¡Felicidades!</h2>
              <p>Has llegado en {steps} pasos.</p>
              <p>Si te has quedado con ganas de más, puedes seguir jugando en&nbsp;
                <a href="https://wikispeedrun.org/" target="_blank" rel="noopener noreferrer">
                    Wiki SpeedRun
                  </a>
              </p>
              {percentileText && <p className="percentile">{percentileText}</p>}
            </>
          )}
          <div className="graph" style={{marginTop: 24}}>
            <h4>Tu puntuación</h4>
            <StepsGraph stats={stats} highlightStep={surrendered ? 11 : steps} />
          </div>
          <div className="share">
            <a href={`https://api.whatsapp.com/send?text=He jugado+ConectaWiki+(${todayPair.start.replace(/_/g,' ')}→${todayPair.end.replace(/_/g,' ')})+y+he+hecho+${steps}+pasos`} target="_blank">WhatsApp</a>
            <a href={`https://www.facebook.com/sharer/sharer.php?u=https://tu-dominio.com`} target="_blank">Facebook</a>
            <a href={`https://www.tiktok.com/`} target="_blank">TikTok</a>
            <a href={`https://www.instagram.com/`} target="_blank">Instagram</a>
          </div>
          <button className="btn" onClick={() => { setPhase('front'); setSteps(0); }}>Volver</button>
        </main>
      )}
      {/* Celebrate overlay */}
      {(phase === 'results' && !surrendered) && (
        <div className="celebrate-overlay">
          <div className="celebrate" id="celebrate-icon">🎉</div>
          <canvas id="confetti-canvas" className="confetti-canvas"></canvas>
        </div>
      )}

      {/* Surrender overlay */}
      {(phase === 'results' && surrendered) && (
        <div className="surrender-overlay">
          <div className="surrender-gradient"></div>
          <div className="surrender-emoji">😥</div>
        </div>
      )}

      <footer className="footer">Juego con enlaces de Wikipedia en español</footer>
    </div>
  )
}
