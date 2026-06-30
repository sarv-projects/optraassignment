import { useRef, useState } from 'react'

const S = {
  wrap: {
    border: '2px dashed #CECECE',
    borderRadius: 6,
    padding: '1rem 1.2rem',
    background: '#fafafa',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
    marginBottom: '1.2rem',
  },
  wrapLoaded: {
    border: '2px dashed #1e5c2c',
    borderRadius: 6,
    padding: '1rem 1.2rem',
    background: '#f0faf2',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
    marginBottom: '1.2rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
  },
  label: {
    fontWeight: 700,
    fontSize: 13,
    color: '#131A48',
  },
  desc: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  uploadText: {
    fontSize: 11,
    fontWeight: 700,
    color: '#FF5800',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginLeft: 'auto',
  },
  uploadTextLoaded: {
    fontSize: 11,
    fontWeight: 700,
    color: '#1e5c2c',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginLeft: 'auto',
  },
  error: {
    background: '#fce8e8',
    border: '1px solid #e57373',
    borderLeft: '3px solid #c0392b',
    borderRadius: 4,
    padding: '0.5rem 0.8rem',
    marginTop: '0.5rem',
    fontSize: 12,
    color: '#5a1010',
  },
  loading: {
    fontSize: 12,
    color: '#888',
    marginTop: '0.5rem',
    fontStyle: 'italic',
  },
}

export default function PdfUploader({ onCartLoad, cartItemCount }) {
  const inputRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    setLoading(true)
    setFileName(file.name)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const { parseCartPDF } = await import('../engine/pdfParser.js')
      const { data, errors } = await parseCartPDF(arrayBuffer)

      if (errors.length > 0) {
        setError(errors.join('; '))
      }
      if (data.length > 0) {
        onCartLoad(data)
      }
    } catch (err) {
      setError(`Failed to read PDF: ${err.message}`)
    } finally {
      setLoading(false)
    }

    e.target.value = ''
  }

  const isLoaded = cartItemCount > 0
  const wrapStyle = isLoaded ? S.wrapLoaded : S.wrap

  return (
    <div>
      <div style={wrapStyle} onClick={() => inputRef.current?.click()}>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        <div style={S.row}>
          <span style={{ fontSize: 12, fontWeight: 700, color: isLoaded ? '#1e5c2c' : '#888' }}>
            {isLoaded ? 'OK' : 'PDF'}
          </span>
          <div>
            <div style={S.label}>Upload Cart PDF</div>
            <div style={S.desc}>
              {isLoaded ? fileName : 'Upload a cart PDF to extract items'}
            </div>
          </div>
          <span style={isLoaded ? S.uploadTextLoaded : S.uploadText}>
            {isLoaded ? `${cartItemCount} items loaded` : 'Upload'}
          </span>
        </div>
      </div>
      {loading && <div style={S.loading}>Parsing PDF...</div>}
      {error && <div style={S.error}>{error}</div>}
    </div>
  )
}
