import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const TOTAL_ROWS = 1000
const TOTAL_COLS = 1000
const DEFAULT_ROW_HEIGHT = 32
const DEFAULT_COL_WIDTH = 100
const MIN_ROW_HEIGHT = 24
const MIN_COL_WIDTH = 50
const HEADER_ROW = 0
const HEADER_COL = 0

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
  const [stickyRowsCount, setStickyRowsCount] = useState(1)
  const [stickyColsCount, setStickyColsCount] = useState(1)
  const [colWidths, setColWidths] = useState(() => Array(TOTAL_COLS + 1).fill(DEFAULT_COL_WIDTH))
  const [rowHeights, setRowHeights] = useState(() => Array(TOTAL_ROWS + 1).fill(DEFAULT_ROW_HEIGHT))
  const [resizing, setResizing] = useState(null)

  const getCellKey = (row, col) => `${row}-${col}`

  const totalCols = TOTAL_COLS + 1
  const totalRows = TOTAL_ROWS + 1

  const colOffsets = useMemo(() => {
    const offsets = [0]
    for (let i = 0; i < totalCols; i += 1) {
      offsets.push(offsets[offsets.length - 1] + colWidths[i])
    }
    return offsets
  }, [colWidths, totalCols])

  const rowOffsets = useMemo(() => {
    const offsets = [0]
    for (let i = 0; i < totalRows; i += 1) {
      offsets.push(offsets[offsets.length - 1] + rowHeights[i])
    }
    return offsets
  }, [rowHeights, totalRows])

  const findIndexByOffset = (offsets, value) => {
    let low = 0
    let high = offsets.length - 1
    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      if (offsets[mid] <= value) {
        low = mid + 1
      } else {
        high = mid
      }
    }
    return Math.max(0, low - 1)
  }

  const startCol = findIndexByOffset(colOffsets, scroll.left)
  const startRow = findIndexByOffset(rowOffsets, scroll.top)

  const stickyColsCountLimited = Math.min(Math.max(0, stickyColsCount), TOTAL_COLS)
  const stickyRowsCountLimited = Math.min(Math.max(0, stickyRowsCount), TOTAL_ROWS)

  const stickyCols = useMemo(() => {
    const list = []
    for (let col = HEADER_COL; col <= stickyColsCountLimited; col += 1) {
      list.push(col)
    }
    return list
  }, [stickyColsCountLimited])

  const stickyRows = useMemo(() => {
    const list = []
    for (let row = HEADER_ROW; row <= stickyRowsCountLimited; row += 1) {
      list.push(row)
    }
    return list
  }, [stickyRowsCountLimited])

  const stickyColOffsets = useMemo(() => {
    const offsets = {}
    let position = 0
    for (const col of stickyCols) {
      offsets[col] = position
      position += colWidths[col]
    }
    return offsets
  }, [stickyCols, colWidths])

  const stickyRowOffsets = useMemo(() => {
    const offsets = {}
    let position = 0
    for (const row of stickyRows) {
      offsets[row] = position
      position += rowHeights[row]
    }
    return offsets
  }, [stickyRows, rowHeights])

  const stickyColsSet = useMemo(() => new Set(stickyCols), [stickyCols])
  const stickyRowsSet = useMemo(() => new Set(stickyRows), [stickyRows])

  const findEndIndex = (startIndex, offsets, visibleSize) => {
    let endIndex = startIndex
    while (
      endIndex + 1 < offsets.length - 1 &&
      offsets[endIndex + 1] - offsets[startIndex] < visibleSize + 200
    ) {
      endIndex += 1
    }
    return endIndex
  }

  const endCol = findEndIndex(startCol, colOffsets, viewport.width || 800)
  const endRow = findEndIndex(startRow, rowOffsets, viewport.height || 500)

  const rows = useMemo(() => {
    const list = [...stickyRows]
    for (let row = startRow; row <= endRow; row += 1) {
      if (!stickyRowsSet.has(row)) {
        list.push(row)
      }
    }
    return list
  }, [startRow, endRow, stickyRows, stickyRowsSet])

  const cols = useMemo(() => {
    const list = [...stickyCols]
    for (let col = startCol; col <= endCol; col += 1) {
      if (!stickyColsSet.has(col)) {
        list.push(col)
      }
    }
    return list
  }, [startCol, endCol, stickyCols, stickyColsSet])

  const handleResizeStart = (type, index, startClient, initialSize) => {
    setResizing({ type, index, startClient, initialSize })
  }

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

  const evaluateCell = (row, col, visited = new Set(), cache = new Map()) => {
    const key = getCellKey(row, col)
    if (cache.has(key)) return cache.get(key)
    if (visited.has(key)) {
      cache.set(key, '#CYCLE')
      return '#CYCLE'
    }

    visited.add(key)
    const rawValue = currentSheetValues.get(key) || ''
    let result = rawValue
    if (typeof rawValue === 'string' && rawValue.startsWith('=')) {
      console.debug('[Formula] evaluateCell', key, rawValue)
      result = evaluateFormula(rawValue.slice(1), visited, cache)
    } else if (typeof rawValue === 'string' && rawValue !== '') {
      const numeric = Number(rawValue)
      if (!Number.isNaN(numeric)) {
        result = numeric
      }
    }
    visited.delete(key)
    cache.set(key, result)
    return result
  }

  const evaluateFormula = (formula, visited, cache = new Map()) => {
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
        if (refRow < 1 || refCol <= 0) return '#ERR'
        const value = evaluateCell(refRow, refCol, visited, cache)
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
      const value = evaluateCell(row, col, new Set(), new Map())
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

  useEffect(() => {
    if (!resizing) return undefined

    const handleMouseMove = (event) => {
      if (resizing.type === 'col') {
        const delta = event.clientX - resizing.startClient
        setColWidths((prev) => {
          const next = [...prev]
          next[resizing.index] = Math.max(MIN_COL_WIDTH, resizing.initialSize + delta)
          return next
        })
      } else {
        const delta = event.clientY - resizing.startClient
        setRowHeights((prev) => {
          const next = [...prev]
          next[resizing.index] = Math.max(MIN_ROW_HEIGHT, resizing.initialSize + delta)
          return next
        })
      }
    }

    const handleMouseUp = () => {
      setResizing(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizing])

  const handleScroll = (event) => {
    const target = event.currentTarget
    setScroll({ top: target.scrollTop, left: target.scrollLeft })
  }

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

  const contentWidth = colOffsets[totalCols]
  const contentHeight = rowOffsets[totalRows]

  return (
    <div className="App">
      <header className="app-header">
        <h1>Spreadsheet</h1>
        <p>1000 × 1000 grid, rendered efficiently with a scroll viewport and multiple sheets.</p>
      </header>

      <div className="sheet-tabs-row">
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

        <div className="sticky-control">
          <label>
            Sticky rows:
            <select
              value={stickyRowsCount}
              onChange={(event) => setStickyRowsCount(Number(event.target.value))}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                <option key={`r-${count}`} value={count}>
                  {count === 0 ? 'None' : `1-${count}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sticky columns:
            <select
              value={stickyColsCount}
              onChange={(event) => setStickyColsCount(Number(event.target.value))}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                <option key={`c-${count}`} value={count}>
                  {count === 0 ? 'None' : `A-${columnLabel(count)}`}
                </option>
              ))}
            </select>
          </label>
        </div>
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
              style={{ transform: `translate(${colOffsets[startCol]}px, ${rowOffsets[startRow]}px)` }}
            >
              {rows.map((row) => (
                <div className="sheet-row" key={row}>
                  {cols.map((col) => {
                    const key = getCellKey(row, col)
                    const isHeader = row === 0 || col === 0
                    const isEditing = editingCell === key
                    const rawValue = isHeader
                      ? row === 0
                        ? col === 0
                          ? ''
                          : columnLabel(col)
                        : String(row)
                      : currentSheetValues.get(key) || ''
                    const displayValue = isHeader ? rawValue : formatDisplayValue(row, col)

                    return (
                      <div
                        className="sheet-cell"
                        key={key}
                        onDoubleClick={() => {
                          if (!isHeader) setEditingCell(key)
                        }}
                        style={{
                          width: colWidths[col],
                          minWidth: colWidths[col],
                          height: rowHeights[row],
                          minHeight: rowHeights[row],
                          position: stickyColsSet.has(col) || stickyRowsSet.has(row) ? 'sticky' : 'static',
                          left: stickyColsSet.has(col) ? stickyColOffsets[col] : undefined,
                          top: stickyRowsSet.has(row) ? stickyRowOffsets[row] : undefined,
                          zIndex: stickyColsSet.has(col) && stickyRowsSet.has(row) ? 5 : stickyColsSet.has(col) || stickyRowsSet.has(row) ? 4 : 1,
                        }}
                      >
                        {row === HEADER_ROW && col > HEADER_COL && (
                          <div
                            className="resize-handle resize-handle-col"
                            onMouseDown={(event) => {
                              event.stopPropagation()
                              handleResizeStart('col', col, event.clientX, colWidths[col])
                            }}
                          />
                        )}
                        {col === HEADER_COL && row > HEADER_ROW && (
                          <div
                            className="resize-handle resize-handle-row"
                            onMouseDown={(event) => {
                              event.stopPropagation()
                              handleResizeStart('row', row, event.clientY, rowHeights[row])
                            }}
                          />
                        )}
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
