/**
 * Shared NLP parsing logic used by the API route and client fallback.
 */

export const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Production model — llama-3.3-70b-versatile deprecates Aug 16, 2026 on free tier.
// See https://console.groq.com/docs/deprecations
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b'

export const SYSTEM_PROMPT = `You parse plain-English e-commerce discount rules into JSON.

Return ONLY valid JSON with this shape:
{
  "scope": "brand" | "platform" | "cart",
  "appliesTo": string,
  "type": "percentage" | "flat",
  "value": number,
  "stackable": boolean,
  "minCartValue": number | null,
  "error": string | null
}

Rules:
- scope "brand" → appliesTo is the brand name copied EXACTLY from the user's input (e.g. "Natura Casa") — never misspell
- scope "platform" → appliesTo is the marketplace copied EXACTLY from input (e.g. "Flipkart", "Amazon India") — never include "all"
- scope "cart" → appliesTo must be "" and minCartValue is required
- type "percentage" → value is the integer percent (20 for 20%)
- type "flat" → value is rupees (150 for Rs.150)
- stackable: true only if explicitly stackable; otherwise false
- If input is ambiguous or missing value/threshold, set error to a short user-facing message and leave other fields null

Examples:
Input: "20% off for Natura Casa brand, stackable with other offers"
Output: {"scope":"brand","appliesTo":"Natura Casa","type":"percentage","value":20,"stackable":true,"minCartValue":null,"error":null}

Input: "Rs.100 flat discount on all Flipkart items"
Output: {"scope":"platform","appliesTo":"Flipkart","type":"flat","value":100,"stackable":false,"minCartValue":null,"error":null}

Input: "10% off if cart value is more than Rs.5,000"
Output: {"scope":"cart","appliesTo":"","type":"percentage","value":10,"stackable":false,"minCartValue":5000,"error":null}

Input: "Give a discount for big orders"
Output: {"scope":null,"appliesTo":null,"type":null,"value":null,"stackable":false,"minCartValue":null,"error":"Could not resolve rule — please specify discount value and scope (e.g. 10% off if cart value is more than Rs.5,000)."}`

export function parseNumber(str) {
  return parseInt(String(str).replace(/,/g, ''), 10)
}

export function normaliseAppliesTo(scope, appliesTo) {
  if (!appliesTo) return appliesTo
  const trimmed = String(appliesTo).replace(/^all\s+/i, '').trim()
  if (scope !== 'platform') return trimmed
  return trimmed
}

/** Pull brand/platform name from the user's original text (more reliable than LLM spelling). */
export function extractAppliesToFromInput(input, scope) {
  const trimmed = input.trim()
  if (scope === 'brand') {
    const forBrand = trimmed.match(/for\s+(.+?)\s+brand/i)
    if (forBrand) return forBrand[1].trim()
    const forProducts = trimmed.match(/for\s+(.+?)\s+products?/i)
    if (forProducts) return forProducts[1].trim()
  }
  if (scope === 'platform') {
    const onItems = trimmed.match(/(?:on|for|all)\s+(?:all\s+)?(.+?)\s+(?:items|platform)/i)
    if (onItems) return normaliseAppliesTo('platform', onItems[1])
    const onEverything = trimmed.match(/(?:on|for)\s+everything\s+on\s+(.+?)(?:\s+items)?$/i)
    if (onEverything) return onEverything[1].trim()
    for (const p of ['Amazon India', 'Flipkart', 'Myntra', 'Ajio', 'Noon', 'Meesho']) {
      if (new RegExp(`\\b${p.replace(/\s+/g, '\\s+')}\\b`, 'i').test(trimmed)) return p
    }
  }
  return null
}

/** Prefer the name from user input when the LLM misspells appliesTo. */
export function reconcileAppliesTo(scope, llmAppliesTo, originalInput) {
  const fromInput = extractAppliesToFromInput(originalInput, scope)
  if (fromInput) return fromInput
  return normaliseAppliesTo(scope, llmAppliesTo ?? '')
}

export function ruleMatchesAnyCartItem(rule, cartItems) {
  if (!cartItems?.length || rule.scope === 'cart') return true
  const norm = (s) => String(s).trim().toLowerCase()
  return cartItems.some((item) => {
    if (rule.scope === 'brand') return norm(item.brand) === norm(rule.appliesTo)
    if (rule.scope === 'platform') return norm(item.platform) === norm(rule.appliesTo)
    return false
  })
}

export function validateRuleFields({ scope, appliesTo, type, value, stackable, minCartValue }) {
  if (!scope || !['brand', 'platform', 'cart'].includes(scope)) {
    return 'Invalid scope — must be brand, platform, or cart.'
  }
  if (!type || !['percentage', 'flat'].includes(type)) {
    return 'Invalid discount type — must be percentage or flat.'
  }
  if (typeof value !== 'number' || isNaN(value) || value <= 0) {
    return 'Discount value must be a positive number.'
  }
  if (typeof stackable !== 'boolean') {
    return 'Stackable must be true or false.'
  }
  if (scope === 'cart') {
    if (typeof minCartValue !== 'number' || isNaN(minCartValue) || minCartValue <= 0) {
      return "Cart-level rule needs a minimum cart value (e.g. 'if cart value is more than Rs.5,000')."
    }
    return null
  }
  if (!appliesTo || !String(appliesTo).trim()) {
    return `Could not determine which ${scope === 'brand' ? 'brand' : 'platform'} this rule applies to. Be more specific.`
  }
  return null
}

export function buildRule({ scope, appliesTo, type, value, stackable, minCartValue }) {
  return {
    ruleId: `RULE-${Date.now()}`,
    scope,
    appliesTo: scope === 'cart' ? '' : String(appliesTo).trim(),
    type,
    value,
    stackable,
    ...(scope === 'cart' && minCartValue != null && { minCartValue }),
  }
}

export function extractJsonFromResponse(content) {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = fenced ? fenced[1].trim() : trimmed
  return JSON.parse(jsonStr)
}

export function llmPayloadToRule(parsed, originalInput = '') {
  if (parsed?.error) {
    return { ok: false, error: parsed.error }
  }

  const scope = parsed?.scope?.toLowerCase?.()
  const type = parsed?.type?.toLowerCase?.()
  const appliesTo = reconcileAppliesTo(scope, parsed?.appliesTo ?? '', originalInput)
  const value = typeof parsed?.value === 'number' ? parsed.value : parseNumber(parsed?.value)
  const stackable = Boolean(parsed?.stackable)
  const minCartValue =
    parsed?.minCartValue != null ? parseNumber(parsed.minCartValue) : null

  const validationError = validateRuleFields({
    scope,
    appliesTo,
    type,
    value,
    stackable,
    minCartValue,
  })

  if (validationError) {
    return { ok: false, error: validationError }
  }

  return {
    ok: true,
    rule: buildRule({ scope, appliesTo, type, value, stackable, minCartValue }),
  }
}

export async function callGroqApi(input, apiKey, model = DEFAULT_GROQ_MODEL) {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Groq API error (${response.status}): ${errBody.slice(0, 200)}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Groq returned an empty response.')
  }

  const parsed = extractJsonFromResponse(content)
  return llmPayloadToRule(parsed, input)
}