import React, { useEffect, useState, useMemo, useRef} from 'react'
import WikipediaRenderer from './WikipediaRenderer'
import confetti from 'canvas-confetti'
import logo from './logo.png'

const SERVER = import.meta.env.VITE_SERVER ?? ''

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

  // Calculate scaling
  const maxCount = Math.max(...bars.map(b => b.count))
  const maxBarHeight = 100
  let getBarHeight = (count) => {
    if (maxCount >= 7) {
      // Scale all bars so the tallest is maxBarHeight
      return (count / maxCount) * maxBarHeight
    } else {
      // Use fixed height per player, capped
      return Math.min(maxBarHeight, 20 * count)
    }
  }
  
  // Animation: refs for each bar
  const barRefs = useRef([])

  useEffect(() => {
    // Reset all bar heights to 0 first
    barRefs.current.forEach(el => {
      if (el) el.style.height = '0px'
    })
    // Animate to final height after a short delay
    const timeout = setTimeout(() => {
      bars.forEach((bar, idx) => {
        const el = barRefs.current[idx]
        if (el) {
          el.style.height = getBarHeight(bar.count) + 'px'
        }
      })
    }, 50) // 50ms is enough for the browser to register the change

    return () => clearTimeout(timeout)
  }, [stats, highlightStep])

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
                ref={el => barRefs.current[idx] = el}
                style={{
                  height: 0, // initial height
                  background: idx === highlightIndex ? '#b6f5c9' : undefined
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
  const [showInstructions, setShowInstructions] = useState(false)

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

  function isSimilar(a, b) {
    if (!a || !b) return false
    const norm = s => s.toLowerCase().replace(/_/g, ' ').trim()
    return norm(a) === norm(b) ||
      norm(a).includes(norm(b)) ||
      norm(b).includes(norm(a))
  }

  const onLinkClick = (title) => {
    if (isSimilar(title, todayPair.end)) {
      // Winning: skip fade animation
      setSteps(s => s + 1)
      fetch(`${SERVER}/api/result`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: todayPair.date, steps: steps + 1, surrendered: false })
      })
        .then(() => fetch(`${SERVER}/api/stats?date=${todayPair.date}`))
        .then(r => r.json())
        .then(newStats => {
          setStats(newStats)
          setPhase('results')
        })
        .catch(() => setPhase('results'))
    } else {
      // Only fade when navigating to a new Wiki page
      setFade(true)
      setTimeout(() => {
        setSteps(s => s + 1)
        setCurrentPageTitle(title)
        setFade(false)
      }, 150)
    }
  }

  const surrender = () => {
    setSurrendered(true)
    fetch(`${SERVER}/api/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: todayPair.date, steps: 11, surrendered: true })
    })
      .then(() => fetch(`${SERVER}/api/stats?date=${todayPair.date}`))
      .then(r => r.json())
      .then(newStats => {
        setStats(newStats)
        setPhase('results')
      })
      .catch(() => setPhase('results'))
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
        <main className="card" style={{ position: 'relative' }}>
          
          {/* How to play button */}
          <button
            className="btn info"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              zIndex: 2
            }}
            onClick={() => setShowInstructions(v => !v)}
          >
            {showInstructions ? 'Cerrar instrucciones' : '¿Cómo jugar?'}
          </button>
          {/* Instructions card */}
          {showInstructions && (
            <div
              className="instructions-card"
              style={{
                position: 'absolute',
                top: 64,
                right: 16,
                background: '#f9fafb',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                padding: '20px 24px',
                maxWidth: 320,
                textAlign: 'left',
                fontSize: 16,
                fontWeight: 400,
                color: '#374151',
                zIndex: 3
              }}
            >
              <h3 style={{marginTop:0}}>¿Cómo jugar?</h3>
              La teoria de los 6 grados de Wikipedia dice que bastan 6 links para connectar dos conceptos aleatorios entre sí. ¿Te atreves a intentarlo?
              <ol style={{paddingLeft:20, fontSize:14, color:'#6b7280'}}>
                <li>Solo puedes avanzar haciendo clic en los enlaces azules de Wikipedia.</li>
                <li>Tu objetivo es llegar a la página final en el menor número de pasos posible.</li>
                <li>Puedes rendirte si te quedas atascado.</li>
                <li>¡Comparte tu resultado y desafía a tus amigos!</li>
              </ol>
            </div>
          )}
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
            <div className="topbar-row">
              <div><strong>Clicks: </strong>{steps}</div>
              <button className="btn small" onClick={surrender}>Rendirse</button>
            </div>
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
            </>
          )}
          <div className="graph" style={{marginTop: 24}}>
            <h4>Tu puntuación:&nbsp;
              <span style={{ fontSize: '15px', color: '#6b7280', fontWeight: 400 }}>
                {surrendered ? 'No acabado' : `${steps} clicks`}
              </span>
            </h4>
            <StepsGraph stats={stats} highlightStep={surrendered ? 11 : steps} />
          </div>
          <div style={{ width: '100%', margin: '24px 0 16px 0', textAlign: 'left', fontWeight: 500, fontSize: 16 }}>
            Comparte tus resultados
          </div>
          <div className="share" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', marginBottom: 16 }}>
<a
  href={`https://api.whatsapp.com/send?text=
🚀 ¡He jugado a WikiLinks! 🚀%0A%0A
Conecté%0A
${todayPair.start.replace(/_/g,' ')} ➡️ ${todayPair.end.replace(/_/g,' ')}%0A%0A
${surrendered ? '😅 No lo terminé esta vez...' : `🎯 ¡En solo ${steps} clicks! 🎯`}%0A%0A
¿Te atreves a superarme? Juega gratis aquí:%0A
https://wikilinks.onrender.com/
`}
  target="_blank"
  rel="noopener noreferrer"
>
              WhatsApp
            </a>
            <a href={`https://www.facebook.com/sharer/sharer.php?u=https://tu-dominio.com`} target="_blank">Facebook</a>
            <a href={`https://www.tiktok.com/`} target="_blank">TikTok</a>
            <a href={`https://www.instagram.com/`} target="_blank">Instagram</a>
          </div>
          {/*<button className="btn" onClick={() => { setPhase('front'); setSteps(0); }}>Volver</button>*/}
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

      <footer className="footer">v.0.6 Creado por Alejandro G. Gener. Codigo disponible en&nbsp;
        <a href="https://github.com/alejandroggener/twiki6" target="_blank" rel="noopener noreferrer">
          Github
        </a>  
      </footer>
    </div>
  )
}
