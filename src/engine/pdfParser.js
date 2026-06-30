/**
 * pdfParser.js
 *
 * Extracts cart items from a PDF containing a simple table with columns:
 *   Product, Brand, Platform, Base Price
 *
 * Uses pdfjs-dist to read the PDF text content, then parses the table rows.
 *
 * Expected PDF table format (from assignment):
 *   Product            Brand          Platform      Base Price
 *   Cushion Cover      Natura Casa    Amazon India   Rs.1,299
 *   ...
 *
 * Returns { data: CartItem[], errors: string[] }
 */

import * as pdfjs from 'pdfjs-dist'

// Configure the worker path for pdfjs
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

/**
 * Read raw text from all pages of a PDF.
 */
async function readPdfText(arrayBuffer) {
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    fullText += content.items.map((item) => item.str).join(' ') + '\n'
  }
  return fullText
}

/**
 * Parse a text block that contains a table of cart items into CartItem objects.
 * Handles the format from the assignment PDF and similar table layouts.
 */
function parseTableText(text) {
  const lines = text.split('\n').filter((l) => l.trim())

  // Find the table start — look for a header row containing product/brand keywords
  const headerIdx = lines.findIndex(
    (l) => /product/i.test(l) && /brand/i.test(l) && /price/i.test(l)
  )
  if (headerIdx === -1) {
    return { data: [], errors: ['Could not find a product table in the PDF.'] }
  }

  const data = []
  const errors = []
  const dataLines = lines.slice(headerIdx + 1)

  // The table separator line (dashes like ─────) or order info lines should be skipped
  // Expected columns: Product, Brand, Platform, Base Price
  // Price format: Rs.1,299 or 1299

  let itemCounter = 0

  for (const line of dataLines) {
    const trimmed = line.trim()

    // Skip separator lines, order info, empty lines
    if (!trimmed || /^[─\-=]{3,}$/.test(trimmed) || /^order\s+#/i.test(trimmed) || /^date:/i.test(trimmed)) {
      continue
    }

    // Try to parse: we expect 4 columns separated by 2+ spaces
    // The format from the assignment uses multiple spaces as separator
    const parts = trimmed.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean)

    if (parts.length < 4) {
      // Might be a single line with mixed content — try space-split heuristic
      // Pattern: "ProductName  BrandName  PlatformName  Rs.1,299"
      const priceMatch = trimmed.match(/rs\.?\s*([\d,]+)/i)
      if (!priceMatch) {
        errors.push(`Skipped unparseable line: "${trimmed.slice(0, 50)}…"`)
        continue
      }

      // Extract price, then work backwards
      const priceStr = priceMatch[1]
      const priceEndIdx = priceMatch.index + priceMatch[0].length
      const beforePrice = trimmed.slice(0, priceMatch.index).trim()
      const afterPrice = trimmed.slice(priceEndIdx).trim()

      // Split beforePrice by 2+ spaces to get product/brand/platform
      const beforeParts = beforePrice.split(/\s{2,}/).filter(Boolean)
      if (beforeParts.length >= 3) {
        itemCounter++
        const basePrice = parseFloat(priceStr.replace(/,/g, ''))
        if (isNaN(basePrice) || basePrice <= 0) {
          errors.push(`Invalid price "${priceStr}" in line: "${trimmed.slice(0, 50)}…"`)
          continue
        }
        data.push({
          itemId: `ITEM-${String(itemCounter).padStart(2, '0')}`,
          product: beforeParts[0],
          brand: beforeParts[1],
          platform: beforeParts[2],
          basePrice: Math.round(basePrice),
        })
        continue
      }

      // Last resort: try splitting by any whitespace and hoping columns align
      const allParts = trimmed.split(/\s+/).filter(Boolean)
      // Attempt to find the price token
      const priceTokenIdx = allParts.findIndex((p) => /^rs\.?/i.test(p))
      if (priceTokenIdx >= 3) {
        itemCounter++
        const basePrice = parseFloat(allParts[priceTokenIdx].replace(/rs\.?/i, '').replace(/,/g, ''))
        if (isNaN(basePrice) || basePrice <= 0) {
          errors.push(`Invalid price in line: "${trimmed.slice(0, 50)}…"`)
          continue
        }
        data.push({
          itemId: `ITEM-${String(itemCounter).padStart(2, '0')}`,
          product: allParts[0],
          brand: allParts[1],
          platform: allParts.slice(2, priceTokenIdx).join(' '),
          basePrice: Math.round(basePrice),
        })
        continue
      }

      errors.push(`Skipped unparseable line: "${trimmed.slice(0, 50)}…"`)
      continue
    }

    // Standard case: 4+ parts separated by 2+ spaces
    itemCounter++
    const product = parts[0]
    const brand = parts[1]
    const platform = parts[2]

    // Price is in the last part — extract number
    const priceField = parts[parts.length - 1]
    const priceNum = parseFloat(priceField.replace(/rs\.?/i, '').replace(/,/g, '').trim())
    if (isNaN(priceNum) || priceNum <= 0) {
      errors.push(`Invalid price "${priceField}" for product "${product}"`)
      continue
    }

    data.push({
      itemId: `ITEM-${String(itemCounter).padStart(2, '0')}`,
      product,
      brand,
      platform,
      basePrice: Math.round(priceNum),
    })
  }

  if (data.length === 0 && errors.length === 0) {
    errors.push('No cart items found in the PDF. Expected a table with columns: Product, Brand, Platform, Base Price.')
  }

  return { data, errors }
}

/**
 * Parse a PDF file (as ArrayBuffer) into CartItem objects.
 * Returns { data, errors }.
 */
export async function parseCartPDF(arrayBuffer) {
  try {
    const text = await readPdfText(arrayBuffer)
    return parseTableText(text)
  } catch (err) {
    return { data: [], errors: [`Failed to read PDF: ${err.message}`] }
  }
}
