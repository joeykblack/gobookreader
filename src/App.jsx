import { useState, useEffect } from 'react'
import JSZip from 'jszip'
import './App.css'

function App() {
  const [bookContent, setBookContent] = useState('')

  useEffect(() => {
    // Load book from localStorage on mount
    const savedBook = localStorage.getItem('gobookContent')
    if (savedBook) {
      setBookContent(savedBook)
    }
  }, [])

  const handleFileLoad = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    try {
      const zip = await JSZip.loadAsync(file)
      
      // Find the .gobook file (should be the only .gobook in the zip)
      const gobookFile = Object.keys(zip.files).find(name => name.endsWith('.gobook'))
      
      if (!gobookFile) {
        alert('No .gobook file found in the archive')
        return
      }

      const content = await zip.files[gobookFile].async('text')
      
      // Store in localStorage
      localStorage.setItem('gobookContent', content)
      
      // Update state
      setBookContent(content)
      
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
      </header>
      <main style={{ padding: '20px', textAlign: 'left' }}>
        {bookContent ? (
          <div>
            <h2>Book Content</h2>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
              {bookContent}
            </pre>
          </div>
        ) : (
          <p>Load a .gobk file to start reading!</p>
        )}
      </main>
    </div>
  )
}

export default App