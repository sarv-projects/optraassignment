/**
 * pdfParser.js
 *
 * Extracts cart items from a PDF containing a simple table with columns:
 *   Product, Brand, Platform, Base Price
 *
 * Uses pdfjs-dist to read the PDF text content, then parses the table rows.
 *
 * Returns { data: CartItem[], errors: string[] }
 */

import * as pdfjs from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

/**
 * Cluster same-row text items into columns using horizontal gaps.
 */
function clusterIntoColumns(rowItems, gapThreshold = 12) {
  const sorted = rowItems
    .filter((i) => i.str?.trim())
    .sort((a, b) => a.transform[4] - b.transform[4])

  if (!sorted.length) return []

  const columns = [[]]
  let lastEndX = sorted[0].transform[4]

  for (const item of sorted) {
    const x = item.transform[4]
    if (x - lastEndX > gapThreshold && columns[columns.length - 1].length > 0) {
      columns.push([])
    }
    columns[columns.length - 1].push(item.str.trim())
    lastEndX = x + (item.width || item.str.length * 5)
  }

  return columns.map((col) => col.join(' ').trim()).filter(Boolean)
}

/**
 * Group pdf.js text items into visual lines using Y position,
 * with columns separated by " | " for reliable parsing.
 */
function groupTextItemsIntoLines(items) {
  const byY = new Map()

  for (const item of items) {
    if (!item.str?.trim()) continue
    const y = Math.round(item.transform[5])
    const key = [...byY.keys()].find((k) => Math.abs(k - y) <= 2) ?? y
    if (!byY.has(key)) byY.set(key, [])
    byY.get(key).push(item)
  }

  const lines = []
  for (const y of [...byY.keys()].sort((a, b) => b - a)) {
    const columns = clusterIntoColumns(byY.get(y))
    if (columns.length > 0) {
      lines.push(columns.join(' | '))
    }
  }
  return lines
}

async function readPdfText(arrayBuffer) {
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const pageLines = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pageLines.push(...groupTextItemsIntoLines(content.items))
  }
  return pageLines.join('\n')
}

function parsePrice(priceField) {
  const priceNum = parseFloat(String(priceField).replace(/rs\.?/i, '').replace(/,/g, '').trim())
  return isNaN(priceNum) || priceNum <= 0 ? null : Math.round(priceNum)
}

function parseRowColumns(columns, itemCounter) {
  if (columns.length < 4) return null

  const product = columns[0]
  const brand = columns[1]
  const platform = columns[2]
  const basePrice = parsePrice(columns[3])

  if (!product || !brand || !platform || basePrice == null) return null

  return {
    itemId: `ITEM-${String(itemCounter).padStart(2, '0')}`,
    product,
    brand,
    platform,
    basePrice,
  }
}

function parseDataLine(trimmed, itemCounter) {
  // Pipe-separated columns from PDF column clustering
  if (trimmed.includes(' | ')) {
    const columns = trimmed.split(' | ').map((s) => s.trim()).filter(Boolean)
    const row = parseRowColumns(columns, itemCounter)
    if (row) return row
  }

  // 4+ columns separated by 2+ spaces
  const spacedParts = trimmed.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean)
  if (spacedParts.length >= 4) {
    const row = parseRowColumns(spacedParts, itemCounter)
    if (row) return row
  }

  // Single-space row: price at end, then platform / brand / product from the right
  const priceMatch = trimmed.match(/rs\.?\s*([\d,]+)\s*$/i)
  if (!priceMatch) return null

  const basePrice = parsePrice(priceMatch[0])
  if (basePrice == null) return null

  let rest = trimmed.slice(0, priceMatch.index).trim()
  const tokens = rest.split(/\s+/).filter(Boolean)

  if (tokens.length < 3) return null

  // Platform is usually the last 1–2 tokens before price
  let platform = tokens.pop()
  if (tokens.length >= 2 && /^(India|Pro|Basics)$/i.test(platform)) {
    platform = `${tokens.pop()} ${platform}`
  }

  // Brand is usually the last 1–2 tokens remaining
  let brand = tokens.pop()
  if (tokens.length >= 1 && /^(Casa|Pro|Basics)$/i.test(brand)) {
    brand = `${tokens.pop()} ${brand}`
  }

  const product = tokens.join(' ')
  if (!product || !brand || !platform) return null

  return {
    itemId: `ITEM-${String(itemCounter).padStart(2, '0')}`,
    product,
    brand,
    platform,
    basePrice,
  }
}

function parseTableText(text) {
  const lines = text.split('\n').filter((l) => l.trim())

  const headerIdx = lines.findIndex(
    (l) => /product/i.test(l) && /brand/i.test(l) && /price/i.test(l)
  )
  if (headerIdx === -1) {
    return { data: [], errors: ['Could not find a product table in the PDF.'] }
  }

  const data = []
  const errors = []
  const dataLines = lines.slice(headerIdx + 1)
  let itemCounter = 0

  for (const line of dataLines) {
    const trimmed = line.trim()

    if (!trimmed || /^[─\-=|]{3,}$/.test(trimmed) || /^order\s+#/i.test(trimmed) || /^date:/i.test(trimmed)) {
      continue
    }

    const row = parseDataLine(trimmed, itemCounter + 1)
    if (row) {
      itemCounter++
      data.push(row)
    } else {
      errors.push(`Skipped unparseable line: "${trimmed.slice(0, 60)}…"`)
    }
  }

  if (data.length === 0 && errors.length === 0) {
    errors.push('No cart items found in the PDF. Expected a table with columns: Product, Brand, Platform, Base Price.')
  }

  return { data, errors }
}

export async function parseCartPDF(arrayBuffer) {
  try {
    const text = await readPdfText(arrayBuffer)
    return parseTableText(text)
  } catch (err) {
    return { data: [], errors: [`Failed to read PDF: ${err.message}`] }
  }
}