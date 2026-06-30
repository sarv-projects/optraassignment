import {
  callGroqApi,
  DEFAULT_GROQ_MODEL,
  buildRule,
  normaliseAppliesTo,
  parseNumber,
  validateRuleFields,
} from '../../lib/nlpCore.js'

const SCOPE_PATTERNS = [
  { re: /(?:for|on|all)\s+(.+?)\s+brand/i, scope: 'brand', idx: 1 },
  { re: /(?:on|for|all)\s+(?:all\s+)?(.+?)\s+(?:items|platform)/i, scope: 'platform', idx: 1 },
  { re: /(?:on|for)\s+everything\s+on\s+(.+)/i, scope: 'platform', idx: 1 },
  { re: /(?:on|for)\s+(Amazon\s*\w+|Flipkart|Myntra|Ajio|Noon|Meesho)\b/i, scope: 'platform', idx: 1 },
  { re: /(?:for|on)\s+(.+?)\s+(?:products?|items?)/i, scope: 'brand', idx: 1 },
  { re: /cart\s+(?:value|total)/i, scope: 'cart', idx: null },
]

const PERCENTAGE_RE = /(\d+)\s*%\s*off/i
const FLAT_RE = /rs\.?\s*([\d,]+)\s+(?:flat\s+)?(?:discount|off)/i
const FLAT_ALT_RE = /(?:rs\.?|₹)\s*([\d,]+)\s+off/i
const STACKABLE_RE = /stackable/i
const CART_MIN_RE = /(?:more\s+than|greater\s+than|>=?|at\s+least|minimum)\s+rs\.?\s*([\d,]+)/i

function extractAppliesTo(input, scope) {
  for (const p of SCOPE_PATTERNS) {
    if (p.scope !== scope) continue
    const m = input.match(p.re)
    if (m) return normaliseAppliesTo(scope, m[p.idx])
  }
  if (scope === 'brand') {
    const m = input.match(/(?:for|on)\s+(.+?)\s+(?:brand|products?|items?)/i)
    if (m) return m[1]
  }
  return ''
}

function parseNaturalLanguageRegex(input) {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, error: 'Please enter a discount rule description.' }
  }

  let scope = 'brand'
  for (const p of SCOPE_PATTERNS) {
    if (p.re.test(trimmed)) {
      scope = p.scope
      break
    }
  }

  let type = null
  let value = null

  const pctMatch = trimmed.match(PERCENTAGE_RE)
  if (pctMatch) {
    type = 'percentage'
    value = parseInt(pctMatch[1], 10)
  }

  if (!type) {
    const flatMatch = trimmed.match(FLAT_RE) || trimmed.match(FLAT_ALT_RE)
    if (flatMatch) {
      type = 'flat'
      value = parseNumber(flatMatch[1])
    }
  }

  if (!type || !value || isNaN(value)) {
    return {
      ok: false,
      error: "Could not determine a discount value. Use a format like '20% off' or 'Rs.150 off'.",
    }
  }

  const stackable = STACKABLE_RE.test(trimmed)
  const appliesTo = extractAppliesTo(trimmed, scope)

  let minCartValue = null
  if (scope === 'cart') {
    const cartMatch = trimmed.match(CART_MIN_RE)
    if (cartMatch) {
      minCartValue = parseNumber(cartMatch[1])
    } else {
      return {
        ok: false,
        error: "Cart-level rule needs a minimum cart value. Add something like 'if cart value is more than Rs.5,000'.",
      }
    }
  }

  const validationError = validateRuleFields({ scope, appliesTo, type, value, stackable, minCartValue })
  if (validationError) {
    return { ok: false, error: validationError }
  }

  return {
    ok: true,
    rule: buildRule({ scope, appliesTo, type, value, stackable, minCartValue }),
    source: 'regex',
  }
}

async function parseViaApiRoute(input) {
  const response = await fetch('/api/parse-rule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })

  const data = await response.json()
  if (!response.ok) {
    return { ok: false, error: data.error || 'LLM parsing failed.', status: response.status }
  }
  return data
}

async function parseViaClientGroq(input) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY
  if (!apiKey) return null

  const model = import.meta.env.VITE_GROQ_MODEL || DEFAULT_GROQ_MODEL
  const result = await callGroqApi(input, apiKey, model)
  if (!result.ok) return result
  return { ...result, source: 'groq' }
}

export async function parseNaturalLanguage(input) {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, error: 'Please enter a discount rule description.' }
  }

  try {
    const apiResult = await parseViaApiRoute(trimmed)
    if (apiResult.ok) return apiResult
    if (apiResult.status !== 503) return apiResult
  } catch {
    // fall through to client Groq or regex
  }

  try {
    const clientResult = await parseViaClientGroq(trimmed)
    if (clientResult) return clientResult
  } catch (err) {
    return {
      ok: false,
      error: `LLM parsing failed: ${err.message}. Check your Groq API key or try again.`,
    }
  }

  return parseNaturalLanguageRegex(trimmed)
}