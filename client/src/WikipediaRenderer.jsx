import React, { useEffect, useState, useCallback } from 'react'

const WIKI_API = 'https://es.wikipedia.org/w/api.php?action=parse&format=json&origin=*&redirects=true&page='

// Parse HTML into hierarchical sections based on Wikipedia's structure
function parseSections(html) {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html

  const root = wrapper.querySelector('.mw-parser-output') || wrapper

  // Remove edit links
  root.querySelectorAll('.mw-editsection').forEach(n => n.remove())

  // Rewrite links
  root.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || ''
    if (href.startsWith('/wiki/')) {
      let targetTitle = href.split('/wiki/')[1].split('#')[0]
      targetTitle = decodeURIComponent(targetTitle.replace(/_/g, ' '))
      a.setAttribute('href', '#')
      a.setAttribute('data-title', targetTitle)
    } else {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener')
    }
  })

  // Get all nodes in order
  const allNodes = Array.from(root.childNodes)
  
  // Find heading positions
  const headingPositions = []
  allNodes.forEach((node, index) => {
    if (isHeading(node)) {
      let level = 2
      if (node.classList.contains('mw-heading')) {
        for (let i = 2; i <= 6; i++) {
          if (node.classList.contains(`mw-heading${i}`)) {
            level = i
            break
          }
        }
      } else if (/^H[2-6]$/i.test(node.nodeName)) {
        level = parseInt(node.tagName.substring(1), 10)
      }
      
      headingPositions.push({
        index,
        node,
        title: node.textContent.trim(),
        level
      })
    }
  })

  const sections = []
  
  // Process intro content (before first heading)
  if (headingPositions.length === 0) {
    // No headings, everything is intro
    return [{
      title: 'Introducción',
      level: 1,
      content: root.innerHTML,
      children: []
    }]
  }

  // Create intro section if there's content before first heading
  if (headingPositions[0].index > 0) {
    const introNodes = allNodes.slice(0, headingPositions[0].index)
    const introWrapper = document.createElement('div')
    introNodes.forEach(node => {
      if (node.nodeType === 1 || (node.nodeType === 3 && node.textContent.trim())) {
        introWrapper.appendChild(node.cloneNode(true))
      }
    })
    
    if (introWrapper.innerHTML.trim()) {
      sections.push({
        title: 'Introducción',
        level: 1,
        content: introWrapper.innerHTML,
        children: []
      })
    }
  }

  // Process each heading section
  for (let i = 0; i < headingPositions.length; i++) {
    const currentHeading = headingPositions[i]
    const nextHeadingIndex = i + 1 < headingPositions.length 
      ? headingPositions[i + 1].index 
      : allNodes.length

    // Get content between current heading and next heading (excluding the heading itself)
    const contentNodes = allNodes.slice(currentHeading.index + 1, nextHeadingIndex)
    const contentWrapper = document.createElement('div')
    
    contentNodes.forEach(node => {
      if (node.nodeType === 1 || (node.nodeType === 3 && node.textContent.trim())) {
        contentWrapper.appendChild(node.cloneNode(true))
      }
    })

    const newSection = {
      title: currentHeading.title,
      level: currentHeading.level,
      content: contentWrapper.innerHTML,
      children: []
    }

    // Add to hierarchy
    addToHierarchy(sections, newSection)
  }

  return sections

  // Helper to check if node is a heading
  function isHeading(node) {
    return node.nodeType === 1 && 
           (node.classList?.contains('mw-heading') || 
            /^H[2-6]$/i.test(node.nodeName))
  }

  // Helper to add section to proper place in hierarchy
  function addToHierarchy(sections, newSection) {
    let added = false
    
    function findParent(sectionList) {
      if (sectionList.length > 0) {
        const lastSection = sectionList[sectionList.length - 1]
        
        if (lastSection.level < newSection.level) {
          lastSection.children.push(newSection)
          added = true
          return true
        }
        
        if (lastSection.children.length > 0) {
          const result = findParent(lastSection.children)
          if (result) return true
        }
      }
      return false
    }
    
    findParent(sections)
    
    if (!added) {
      sections.push(newSection)
    }
  }
}

// Build initial open map (intro open, others collapsed)
function buildInitialOpenMap(sections) {
  const map = {}
  function walk(list, prefix) {
    list.forEach((sec, i) => {
      const path = prefix ? `${prefix}.${i}` : `${i}`
      map[path] = sec.title === 'Introducción'
      if (sec.children?.length) walk(sec.children, path)
    })
  }
  walk(sections, '')
  return map
}

function Section({ node, path, openMap, toggle, onLinkClick }) {
  const open = !!openMap[path]
  const isIntro = node.title === 'Introducción'
  
  // Calculate heading style based on level
  const fontSize = Math.max(14, 22 - node.level * 2)
  const bgColor = node.level === 1 ? '#e9f7ff' : 
                 node.level === 2 ? '#f0f9ff' :
                 node.level === 3 ? '#f5fbff' : '#f8fdff'
  const borderColor = node.level === 1 ? '#c7e8f7' : 
                     node.level === 2 ? '#d5eefa' :
                     node.level === 3 ? '#e0f2fb' : '#ebf7fc'
  const paddingLeft = 8 + (node.level - 1) * 6

  return (
    <div className={`wiki-section level-${node.level}`} style={{ marginBottom: 6 }}>
      {/* Only show button if it's not the introduction */}
      {!isIntro && (
        <button
          type="button"
          onClick={() => toggle(path)}
          className="wiki-section-header"
          style={{
            cursor: 'pointer',
            fontWeight: 'bold',
            margin: '4px 0',
            fontSize: `${fontSize}px`,
            background: bgColor,
            borderRadius: 6,
            padding: `6px ${paddingLeft}px`,
            width: '100%',
            textAlign: 'left',
            border: `1px solid ${borderColor}`,
            display: 'flex',
            alignItems: 'center'
          }}
          aria-expanded={open}
        >
          <span style={{ marginRight: 8 }}>{open ? '▼' : '▶'}</span> {node.title}
        </button>
      )}
      {/* Show content if open OR if it's the intro (always visible) */}
      {(open || isIntro) && (
        <div className="wiki-section-content" style={{ marginLeft: node.level > 1 ? 12 : 0, paddingLeft: 8 }}>
          {node.content && (
            <div
              onClick={onLinkClick}
              dangerouslySetInnerHTML={{ __html: node.content }}
              style={{ lineHeight: 1.5 }}
            />
          )}
          {node.children?.length > 0 && (
            <div>
              {node.children.map((child, i) => {
                const childPath = `${path}.${i}`
                return (
                  <Section
                    key={childPath}
                    node={child}
                    path={childPath}
                    openMap={openMap}
                    toggle={toggle}
                    onLinkClick={onLinkClick}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function WikipediaRenderer({ title, onLinkClick }) {
  const [sections, setSections] = useState(null)
  const [openMap, setOpenMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setSections(null)
    setOpenMap({})
    setLoading(true)
    setError(null)
    
    const t = encodeURIComponent(title.replace(/ /g, '_'))
    fetch(WIKI_API + t)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError('Página no encontrada')
          const fallback = [{ title: 'Error', level: 1, content: '<p>Página no encontrada</p>', children: [] }]
          setSections(fallback)
          setOpenMap(buildInitialOpenMap(fallback))
          return
        }
        const txt = data.parse?.text?.['*'] || '<p>Sin contenido</p>'
        const parsed = parseSections(txt)
        setSections(parsed)
        setOpenMap(buildInitialOpenMap(parsed))
      })
      .catch(err => {
        setError('Error cargando')
        const errSecs = [{ title: 'Error', level: 1, content: '<p>Error cargando contenido</p>', children: [] }]
        setSections(errSecs)
        setOpenMap(buildInitialOpenMap(errSecs))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [title])

  const toggle = useCallback(path => {
    setOpenMap(m => ({ ...m, [path]: !m[path] }))
  }, [])

  const handleLinkClick = useCallback(
    e => {
      const a = e.target.closest('a[data-title]')
      if (a) {
        e.preventDefault()
        let t = a.getAttribute('data-title')
        onLinkClick(t)
      }
    },
    [onLinkClick]
  )

  if (loading) return <div className="wiki-content"><p>Cargando...</p></div>
  if (!sections) return <div className="wiki-content"><p>Sin contenido</p></div>

  return (
    <div className="wiki-content">
      {sections.map((sec, i) => {
        const path = `${i}`
        return (
          <Section
            key={path}
            node={sec}
            path={path}
            openMap={openMap}
            toggle={toggle}
            onLinkClick={handleLinkClick}
          />
        )
      })}
    </div>
  )
}