import { useState, useEffect, useLayoutEffect } from 'react'
import JSZip from 'jszip'
import { Goban } from '@sabaki/shudan'
import '@sabaki/shudan/css/goban.css'
import './App.css'

function App() {
  const [bookData, setBookData] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [nightMode, setNightMode] = useState(() => {
    const savedNightMode = localStorage.getItem('gobookNightMode')
    return savedNightMode === null ? false : savedNightMode === 'true'
  })

  useEffect(() => {
    // Load book from localStorage on mount
    const savedBook = localStorage.getItem('gobookContent')
    if (savedBook) {
      const parsed = parseGobook(savedBook)
      setBookData(parsed)
    }
  }, [])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    localStorage.setItem('gobookNightMode', nightMode)
  }, [nightMode])

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('night-mode', nightMode)
    document.documentElement.style.removeProperty('background-color')
    document.documentElement.style.removeProperty('color')
    document.body.style.removeProperty('background-color')
    document.body.style.removeProperty('color')
  }, [nightMode])

  const parseGobook = (content) => {
    const lines = content.split('\n')
    const bookInfo = { title: '', author: '', chapters: [] }
    let currentChapter = null
    let i = 0

    while (i < lines.length) {
      const line = lines[i].trim()

      if (line.startsWith('::book(')) {
        // Extract title and author
        const match = line.match(/title="([^"]*)" author="([^"]*)"/)
        if (match) {
          bookInfo.title = match[1]
          bookInfo.author = match[2]
        }
        i++
      } else if (line.startsWith('::chapter(')) {
        currentChapter = { id: line, title: '', content: [] }
        bookInfo.chapters.push(currentChapter)
        i++
      } else if (line.startsWith('::dia(')) {
        const szMatch = line.match(/\bsz=(\d+)/)
        const size = szMatch ? Number(szMatch[1]) : 19
        if (currentChapter) {
          currentChapter.content.push({ type: 'diagram', size: Number.isNaN(size) ? 19 : size })
        }
        i++
      } else if (line.startsWith('::h1') || line.startsWith('::h2') || line.startsWith('::h3')) {
        const level = Number(line.charAt(3)) || 1
        i++ // Skip the ::h marker
        // Collect heading text until blank line or ::
        let headingLines = []
        while (i < lines.length) {
          const nextLine = lines[i].trim()
          if (nextLine === '' || nextLine.startsWith('::')) break
          headingLines.push(lines[i]) // Keep original formatting
          i++
        }
        const headingText = headingLines.join('\n').trim()
        if (currentChapter && headingText) {
          currentChapter.content.push({ type: 'heading', level, text: headingText })
        }
      } else if (line && !line.startsWith('::')) {
        // Start of paragraph - collect until blank line or ::
        let paraLines = []
        while (i < lines.length) {
          const nextLine = lines[i].trim()
          if (nextLine.startsWith('::')) break
          if (nextLine === '') {
            i++
            break
          }
          paraLines.push(lines[i]) // Keep original formatting
          i++
        }
        const paraText = paraLines.join('\n').trim()
        if (currentChapter && paraText) {
          currentChapter.content.push({ type: 'paragraph', text: paraText })
        }
      } else {
        i++
      }
    }

    return bookInfo
  }

  const formatInlineText = (text) => {
    if (!text) return ''
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    const withItalic = withBold.replace(/__([^\n]+?)__/g, '<em>$1</em>')
    return withItalic.replace(/\n/g, '<br/>')
  }

  const handleFileLoad = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    try {
      const zip = await JSZip.loadAsync(file)
      
      // Find the .gobook file
      const gobookFile = Object.keys(zip.files).find(name => name.endsWith('.gobook'))
      
      if (!gobookFile) {
        alert('No .gobook file found in the archive')
        return
      }

      const content = await zip.files[gobookFile].async('text')
      
      // Parse the content
      const parsed = parseGobook(content)
      
      // Store in localStorage
      localStorage.setItem('gobookContent', content)
      
      // Update state
      setBookData(parsed)
      
      alert('Book loaded successfully!')
    } catch (error) {
      console.error('Error loading book:', error)
      alert('Error loading book: ' + error.message)
    }
  }

  const contentWidth = 'min(800px, calc(100% - 40px))'

  const createEmptySignMap = (size) => {
    const boardSize = Number.isInteger(size) && size > 0 ? size : 19
    return Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => 0))
  }

  return (
    <div
      className="App"
      style={{
        background: nightMode ? '#000' : '#fff',
        color: nightMode ? '#fff' : '#222',
        minHeight: '100vh',
        width: '100%',
        transition: mounted ? 'background 0.2s, color 0.2s' : 'none',
      }}
    >
      <header
        className="App-header"
        style={{
          background: nightMode ? '#000' : undefined,
          color: nightMode ? '#fff' : undefined,
          transition: mounted ? 'background 0.2s, color 0.2s' : 'none',
        }}
      >
        <div style={{ width: contentWidth, margin: '0 auto' }}>
          <h1 style={{ color: nightMode ? '#fff' : undefined }}>GoBook Reader</h1>
          <p style={{ color: nightMode ? '#fff' : undefined }}>A web-based Go book reader with interactive diagrams</p>
          <div style={{ marginTop: '20px' }}>
            <label htmlFor="gobk-file" style={{ marginRight: '10px' }}>
              Load GoBook (.gobk file):
            </label>
            <input
              id="gobk-file"
              type="file"
              accept=".gobk"
              onChange={handleFileLoad}
              style={{ padding: '5px', background: nightMode ? '#222' : undefined, color: nightMode ? '#fff' : undefined, border: nightMode ? '1px solid #444' : undefined }}
            />
          </div>
          <div style={{ marginTop: '10px' }}>
            <label htmlFor="night-mode-toggle" style={{ marginRight: '10px', color: nightMode ? '#fff' : undefined }}>
              <input
                id="night-mode-toggle"
                type="checkbox"
                checked={nightMode}
                onChange={e => setNightMode(e.target.checked)}
                style={{ marginRight: '6px' }}
              />
              Night mode
            </label>
          </div>
          {bookData && (
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <h2 style={{ color: nightMode ? '#fff' : undefined }}>{bookData.title}</h2>
              <p><em style={{ color: nightMode ? '#fff' : undefined }}>by {bookData.author}</em></p>
            </div>
          )}
        </div>
      </header>
      <main
        style={{
          padding: '20px 0',
          width: contentWidth,
          margin: '0 auto',
          background: nightMode ? '#000' : undefined,
          color: nightMode ? '#fff' : undefined,
          transition: mounted ? 'background 0.2s, color 0.2s' : 'none',
        }}
      >
        {bookData ? (
          <div>
            {bookData.chapters.map((chapter, chapterIndex) => (
              <div key={chapterIndex} style={{ marginBottom: '40px' }}>
                <div style={{ borderBottom: nightMode ? '1px solid #444' : '1px solid #ccc', margin: '20px 0' }}></div>
                {chapter.content.map((item, itemIndex) => {
                  if (item.type === 'heading') {
                    const headingNum = Math.min(6, Number(item.level) + 1)
                    const HeadingTag = `h${headingNum}`
                    return (
                      <HeadingTag
                        key={itemIndex}
                        style={{ whiteSpace: 'pre-wrap', marginTop: '1em', color: nightMode ? '#fff' : undefined }}
                        dangerouslySetInnerHTML={{ __html: formatInlineText(item.text) }}
                      />
                    )
                  } else if (item.type === 'paragraph') {
                    return (
                      <p
                        key={itemIndex}
                        style={{ lineHeight: '1.6', marginBottom: '1em', whiteSpace: 'pre-wrap', color: nightMode ? '#fff' : undefined }}
                        dangerouslySetInnerHTML={{ __html: formatInlineText(item.text) }}
                      />
                    )
                  } else if (item.type === 'diagram') {
                    return (
                      <div key={itemIndex} style={{ margin: '1em 0', display: 'flex', justifyContent: 'center' }}>
                        <Goban
                          signMap={createEmptySignMap(item.size)}
                          showCoordinates={true}
                          vertexSize={24}
                        />
                      </div>
                    )
                  }
                  return null
                })}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: nightMode ? '#fff' : undefined }}>Load a .gobk file to start reading!</p>
        )}
      </main>
    </div>
  )
}

export default App