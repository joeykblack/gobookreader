import { useState, useEffect } from 'react'
import JSZip from 'jszip'
import './App.css'

function App() {
  const [bookData, setBookData] = useState(null)

  useEffect(() => {
    // Load book from localStorage on mount
    const savedBook = localStorage.getItem('gobookContent')
    if (savedBook) {
      const parsed = parseGobook(savedBook)
      setBookData(parsed)
    }
  }, [])

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
      } else if (line.startsWith('::h1') || line.startsWith('::h2') || line.startsWith('::h3')) {
        const level = line.substring(2, 3)
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

  return (
    <div className="App">
      <header className="App-header">
        <h1>GoBook Reader</h1>
        <p>A web-based Go book reader with interactive diagrams</p>
        <div style={{ marginTop: '20px' }}>
          <label htmlFor="gobk-file" style={{ marginRight: '10px' }}>
            Load GoBook (.gobk file):
          </label>
          <input
            id="gobk-file"
            type="file"
            accept=".gobk"
            onChange={handleFileLoad}
            style={{ padding: '5px' }}
          />
        </div>
        {bookData && (
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <h2>{bookData.title}</h2>
            <p><em>by {bookData.author}</em></p>
          </div>
        )}
      </header>
      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        {bookData ? (
          <div>
            {bookData.chapters.map((chapter, chapterIndex) => (
              <div key={chapterIndex} style={{ marginBottom: '40px' }}>
                <div style={{ borderBottom: '1px solid #ccc', margin: '20px 0' }}></div>
                {chapter.content.map((item, itemIndex) => {
                  if (item.type === 'heading') {
                    const HeadingTag = `h${parseInt(item.level) + 2}` // h1 -> h3, h2 -> h4, etc.
                    return <HeadingTag key={itemIndex} style={{ whiteSpace: 'pre-line' }}>{item.text}</HeadingTag>
                  } else if (item.type === 'paragraph') {
                    return <p key={itemIndex} style={{ lineHeight: '1.6', marginBottom: '1em', whiteSpace: 'pre-line' }}>{item.text}</p>
                  }
                  return null
                })}
              </div>
            ))}
          </div>
        ) : (
          <p>Load a .gobk file to start reading!</p>
        )}
      </main>
    </div>
  )
}

export default App