import React, { useEffect, useState, useMemo } from 'react'
import WikipediaRenderer from './WikipediaRenderer'
import confetti from 'canvas-confetti'

const SERVER = import.meta.env.VITE_SERVER || 'http://localhost:4000'

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
      <header className="header">TWiki6</header>

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
            <h4>Distribución de pasos (histórico hoy)</h4>
            <div className="bars">
                {stats && Object.keys(stats.distribution || {}).length > 0 
                ? Object.entries(stats.distribution).sort((a,b)=>a[0]-b[0]).map(([k,v])=>(
                    <div key={k} className="bar-item">
                        <div className="bar-label">{k}</div>
                        <div className="bar" style={{height: Math.min(200, 20*v)+'px'}}></div>
                        <div className="bar-count">{v}</div>
                    </div>
                    ))
                : Array.from({length:5}).map((_,i)=>(
                    <div key={i} className="bar-item">
                        <div className="bar-label">–</div>
                        <div className="bar" style={{height:0}}></div>
                        <div className="bar-count">0</div>
                    </div>
                    ))
                }
            </div>
          </div>

          <button className="btn" onClick={startGame}>Empezar</button>
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
              <p>No te preocupes, hoy era bastante complicado. Otros X jugadores han abandonado</p>
            </>
          ) : (
            <>
              <h2>¡Felicidades!</h2>
              <p>Has llegado en {steps} pasos.</p>
              {percentileText && <p className="percentile">{percentileText}</p>}
            </>
          )}
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
