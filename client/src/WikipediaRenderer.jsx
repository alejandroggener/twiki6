import React, {useEffect, useState, useCallback} from 'react'
import DOMPurify from 'dompurify'

const WIKI_API = 'https://es.wikipedia.org/w/api.php?action=parse&format=json&origin=*&redirects=true&page=';

export default function WikipediaRenderer({title, onLinkClick}){
  const [html, setHtml] = useState('<p>Cargando...</p>')
  const [resolvedTitle, setResolvedTitle] = useState(title)

  useEffect(()=>{
    setHtml('<p>Cargando...</p>')
    const t = encodeURIComponent(title.replace(/ /g,'_'))
    fetch(WIKI_API + t)
      .then(r=>r.json())
      .then(data=>{
        if(data.error) return setHtml('<p>Página no encontrada</p>')
        let txt = data.parse?.text?.['*'] || '<p>Sin contenido</p>'
        setResolvedTitle(data.parse?.title || title) // update to normalized/redirected title

        const wrapper = document.createElement('div')
        wrapper.innerHTML = txt

        // remove edit spans
        wrapper.querySelectorAll('.mw-editsection').forEach(n=>n.remove())

        // Rewrite links as # for now
        wrapper.querySelectorAll('a').forEach(a=>{
          const href = a.getAttribute('href') || ''
          if(href.startsWith('/wiki/')){
            let targetTitle = href.split('/wiki/')[1].split('#')[0]
            targetTitle = decodeURIComponent(targetTitle.replace(/_/g, ' '))
            a.setAttribute('href','#')
            a.setAttribute('data-title', targetTitle)
          } else {
            a.setAttribute('target','_blank')
            a.setAttribute('rel','noopener')
          }
        })

        const clean = DOMPurify.sanitize(wrapper.innerHTML, {ADD_TAGS:['iframe'], ADD_ATTR:['data-title']})
        setHtml(clean)
      }).catch(()=>setHtml('<p>Error cargando</p>'))
  },[title])

  // Event delegation: capture clicks on wiki links
  const handleClick = useCallback((e)=>{
    const a = e.target.closest('a[data-title]')
    if(a){
      e.preventDefault()
      let t = a.getAttribute('data-title')
      t = t.replace(/ /g, '_') // Wikipedia expects underscores
      onLinkClick(t)
    }
  },[onLinkClick])

  return (
    <div className="wiki-content" dangerouslySetInnerHTML={{__html: html}} onClick={handleClick}/>
  )
}
