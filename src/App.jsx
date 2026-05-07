import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const TOTAL_ROWS = 1000
const TOTAL_COLS = 1000
const ROW_HEIGHT = 32
const COL_WIDTH = 100
const BUFFER = 6

const columnLabel = (index) => {
  let label = ''
  while (index > 0) {
    index -= 1
    label = String.fromCharCode(65 + (index % 26)) + label
    index = Math.floor(index / 26)
  }
  return label
}

function App() {
  const containerRef = useRef(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [scroll, setScroll] = useState({ top: 0, left: 0 })
  const [sheetNames, setSheetNames] = useState(['Sheet1', 'Sheet2'])
  const [activeSheet, setActiveSheet] = useState('Sheet1')
  const [sheetValues, setSheetValues] = useState(() => {
    const initial = new Map()
    initial.set('Sheet1', new Map())
    initial.set('Sheet2', new Map())
    return initial
  })
  const [editingCell, setEditingCell] = useState(null)
  const [renamingSheet, setRenamingSheet] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  const getCellKey = (row, col) => `${row}-${col}`

  const lettersToColumnIndex = (letters) => {
    let index = 0
    for (const char of letters.toUpperCase()) {
      index = index * 26 + (char.charCodeAt(0) - 64)
    }
    return index
  }

  const tokenizeFormula = (formula) => {
    const tokens = []
    const normalized = formula.replace(/\s+/g, '')
    const regex = /([A-Za-z]+\d+|\d*\.\d+|\d+|[()+\-*/^])/g
    let match
    while ((match = regex.exec(normalized))) {
      tokens.push(match[0])
    }
    return tokens
  }

  const evaluationCache = new Map()

  const evaluateCell = (row, col, visited = new Set()) => {
    const key = getCellKey(row, col)
    if (evaluationCache.has(key)) return evaluationCache.get(key)
    if (visited.has(key)) {
      evaluationCache.set(key, '#CYCLE')
      return '#CYCLE'
    }

    visited.add(key)
    const rawValue = currentSheetValues.get(key) || ''
    let result = rawValue
    if (typeof rawValue === 'string' && rawValue.startsWith('=')) {
      result = evaluateFormula(rawValue.slice(1), visited)
    }
    visited.delete(key)
    evaluationCache.set(key, result)
    return result
  }

  const evaluateFormula = (formula, visited) => {
    const tokens = tokenizeFormula(formula)
    let index = 0

    const parsePrimary = () => {
      const token = tokens[index]
      if (!token) return '#ERR'

      if (token === '+') {
        index += 1
        return parsePrimary()
      }
      if (token === '-') {
        index += 1
        const value = parsePrimary()
        return typeof value === 'number' ? -value : value
      }
      if (token === '(') {
        index += 1
        const value = parseExpression()
        if (tokens[index] !== ')') return '#ERR'
        index += 1
        return value
      }

      index += 1
      const refMatch = token.match(/^([A-Za-z]+)(\d+)$/)
      if (refMatch) {
        const refCol = lettersToColumnIndex(refMatch[1])
        const refRow = Number(refMatch[2])
        if (refRow <= 0 || refCol <= 0) return '#ERR'
        const value = evaluateCell(refRow, refCol, visited)
        if (typeof value === 'string') return value
        return value
      }

      const number = Number(token)
      if (!Number.isNaN(number)) {
        return number
      }

      return '#ERR'
    }

    const parseFactor = () => {
      let value = parsePrimary()
      while (tokens[index] === '^') {
        index += 1
        const nextValue = parsePrimary()
        if (typeof value === 'string') return value
        if (typeof nextValue === 'string') return nextValue
        value = Math.pow(value, nextValue)
      }
      return value
    }

    const parseTerm = () => {
      let value = parseFactor()
      while (tokens[index] === '*' || tokens[index] === '/') {
        const operator = tokens[index]
        index += 1
        const nextValue = parseFactor()
        if (typeof value === 'string') return value
        if (typeof nextValue === 'string') return nextValue
        if (operator === '*') {
          value *= nextValue
        } else {
          if (nextValue === 0) return '#ERR'
          value /= nextValue
        }
      }
      return value
    }

    const parseExpression = () => {
      let value = parseTerm()
      while (tokens[index] === '+' || tokens[index] === '-') {
        const operator = tokens[index]
        index += 1
        const nextValue = parseTerm()
        if (typeof value === 'string') return value
        if (typeof nextValue === 'string') return nextValue
        value = operator === '+' ? value + nextValue : value - nextValue
      }
      return value
    }

    const result = parseExpression()
    if (index < tokens.length) return '#ERR'
    return typeof result === 'number' && Number.isFinite(result) ? result : result
  }

  const formatDisplayValue = (row, col) => {
    const key = getCellKey(row, col)
    const raw = currentSheetValues.get(key) || ''
    if (typeof raw === 'string' && raw.startsWith('=')) {
      const value = evaluateCell(row, col)
      if (value === '#CYCLE' || value === '#ERR') return value
      return value.toString()
    }
    return raw
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateViewport = () => {
      setViewport({ width: container.clientWidth, height: container.clientHeight })
    }

    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  const handleScroll = (event) => {
    const target = event.currentTarget
    setScroll({ top: target.scrollTop, left: target.scrollLeft })
  }

  const visibleCols = Math.min(
    TOTAL_COLS,
    Math.ceil((viewport.width || 800) / COL_WIDTH) + BUFFER,
  )
  const visibleRows = Math.min(
    TOTAL_ROWS,
    Math.ceil((viewport.height || 500) / ROW_HEIGHT) + BUFFER,
  )

  const startCol = Math.max(0, Math.floor(scroll.left / COL_WIDTH))
  const startRow = Math.max(0, Math.floor(scroll.top / ROW_HEIGHT))
  const endCol = Math.min(TOTAL_COLS, startCol + visibleCols)
  const endRow = Math.min(TOTAL_ROWS, startRow + visibleRows)

  const rows = useMemo(() => {
    const list = []
    for (let row = startRow; row < endRow; row += 1) {
      list.push(row)
    }
    return list
  }, [startRow, endRow])

  const cols = useMemo(() => {
    const list = []
    for (let col = startCol; col < endCol; col += 1) {
      list.push(col)
    }
    return list
  }, [startCol, endCol])

  const currentSheetValues = sheetValues.get(activeSheet) ?? new Map()

  const saveCellValue = (row, col, value) => {
    setSheetValues((prev) => {
      const next = new Map(prev)
      const sheetMap = new Map(next.get(activeSheet) || [])
      const key = getCellKey(row, col)
      const trimmed = value.trim()
      if (trimmed) {
        sheetMap.set(key, trimmed)
      } else {
        sheetMap.delete(key)
      }
      next.set(activeSheet, sheetMap)
      return next
    })
  }

  const addSheet = () => {
    const baseName = `Sheet${sheetNames.length + 1}`
    let name = baseName
    let suffix = 2
    while (sheetValues.has(name)) {
      name = `${baseName}-${suffix}`
      suffix += 1
    }

    setSheetNames((prev) => [...prev, name])
    setSheetValues((prev) => {
      const next = new Map(prev)
      next.set(name, new Map())
      return next
    })
    setActiveSheet(name)
    setEditingCell(null)
  }

  const switchSheet = (name) => {
    setActiveSheet(name)
    setEditingCell(null)
    setRenamingSheet(null)
  }

  const startRename = (name) => {
    setRenamingSheet(name)
    setRenameValue(name)
  }

  const commitRename = (oldName, newName) => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName || sheetValues.has(trimmed)) {
      setRenamingSheet(null)
      return
    }

    setSheetNames((prev) => prev.map((sheet) => (sheet === oldName ? trimmed : sheet)))

    setSheetValues((prev) => {
      const next = new Map()
      for (const [sheet, valuesMap] of prev.entries()) {
        next.set(sheet === oldName ? trimmed : sheet, valuesMap)
      }
      return next
    })

    if (activeSheet === oldName) {
      setActiveSheet(trimmed)
    }
    setRenamingSheet(null)
  }

  const cancelRename = () => {
    setRenamingSheet(null)
  }

  const deleteSheet = (name) => {
    if (sheetNames.length <= 1) return

    const nextNames = sheetNames.filter((sheet) => sheet !== name)
    setSheetNames(nextNames)

    setSheetValues((prev) => {
      const next = new Map(prev)
      next.delete(name)
      return next
    })

    if (activeSheet === name) {
      setActiveSheet(nextNames[0])
    }
    if (renamingSheet === name) {
      setRenamingSheet(null)
    }
    setEditingCell(null)
  }

  const contentWidth = TOTAL_COLS * COL_WIDTH
  const contentHeight = TOTAL_ROWS * ROW_HEIGHT

  return (
    <div className="App">
      <header className="app-header">
        <h1>Spreadsheet</h1>
        <p>1000 × 1000 grid, rendered efficiently with a scroll viewport and multiple sheets.</p>
      </header>

      <div className="sheet-tabs">
        {sheetNames.map((name) => {
          const isActive = name === activeSheet
          const isRenaming = name === renamingSheet
          return (
            <div className="sheet-tab-wrapper" key={name}>
              {isRenaming ? (
                <input
                  className="sheet-tab-input"
                  value={renameValue}
                  autoFocus
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => commitRename(name, renameValue)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitRename(name, renameValue)
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelRename()
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={`sheet-tab ${isActive ? 'active' : ''}`}
                  onClick={() => switchSheet(name)}
                >
                  {name}
                </button>
              )}

              {!isRenaming && (
                <div className="sheet-tab-actions">
                  <button
                    type="button"
                    className="sheet-tab-icon"
                    onClick={() => startRename(name)}
                    aria-label={`Rename ${name}`}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="sheet-tab-icon sheet-tab-delete"
                    onClick={() => deleteSheet(name)}
                    aria-label={`Delete ${name}`}
                    disabled={sheetNames.length <= 1}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          )
        })}
        <button type="button" className="sheet-tab-add" onClick={addSheet}>
          +
        </button>
      </div>

      <div className="sheet-frame">
        <div
          className="sheet-scroll-wrapper"
          ref={containerRef}
          onScroll={handleScroll}
        >
          <div
            className="sheet-phantom"
            style={{ width: contentWidth, height: contentHeight }}
          >
            <div
              className="sheet-visible"
              style={{ transform: `translate(${startCol * COL_WIDTH}px, ${startRow * ROW_HEIGHT}px)` }}
            >
              {rows.map((row) => (
                <div className="sheet-row" key={row}>
                  {cols.map((col) => {
                    const key = getCellKey(row, col)
                    const isHeader = row === 0 || col === 0
                    const isEditing = editingCell === key
                    const rawValue = isHeader
                      ? row === 0
                        ? columnLabel(col + 1)
                        : String(row + 1)
                      : currentSheetValues.get(key) || ''
                    const displayValue = isHeader ? rawValue : formatDisplayValue(row, col)

                    return (
                      <div
                        className="sheet-cell"
                        key={key}
                        onDoubleClick={() => {
                          if (!isHeader) setEditingCell(key)
                        }}
                      >
                        {isEditing ? (
                          <input
                            className="sheet-input"
                            autoFocus
                            value={rawValue}
                            onChange={(event) => saveCellValue(row, col, event.target.value)}
                            onBlur={() => setEditingCell(null)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                event.currentTarget.blur()
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                event.currentTarget.blur()
                              }
                            }}
                          />
                        ) : (
                          <div className={`sheet-cell-content ${isHeader ? 'sheet-cell-header' : 'sheet-cell-data'}`}>
                            {displayValue}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
