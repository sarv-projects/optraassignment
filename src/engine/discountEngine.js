/**
 * discountEngine.js
 *
 * Pure discount calculation logic. No UI, no side effects.
 * All functions take plain objects and return plain objects.
 *
 * Data shapes:
 *
 * DiscountRule {
 *   ruleId:       string   — e.g. "RULE-01"
 *   scope:        "brand" | "platform" | "cart"
 *   appliesTo:    string   — e.g. "Natura Casa", "Amazon India" (empty for cart)
 *   type:         "percentage" | "flat"
 *   value:        number   — percentage as integer (15 = 15%), flat in rupees
 *   stackable:    boolean
 *   minCartValue: number?  — minimum cart subtotal for cart-scope rules
 * }
 *
 * CartItem {
 *   itemId:    string       — e.g. "ITEM-01"
 *   product:   string
 *   brand:     string
 *   platform:  string
 *   basePrice: number       — in rupees
 * }
 *
 * DiscountResult {
 *   itemId:        string
 *   product:       string
 *   brand:         string
 *   platform:      string
 *   basePrice:     number
 *   finalPrice:    number
 *   totalDiscount: number
 *   appliedRules:  string[]
 *   skippedRules:  string[]
 *   reasoning:     string   — customer-readable explanation
 * }
 *
 * CartOffer {
 *   applied:       boolean  — whether the cart offer was triggered
 *   ruleId:        string?
 *   discountLabel: string?  — e.g. "Cart offer: 10% off"
 *   discountAmount: number? — rupee saving
 *   thresholdMet:  boolean?
 * }
 */

/**
 * Returns true if the rule applies to this cart item.
 * Cart-scope rules never match individual items.
 */
export function ruleMatchesItem(item, rule) {
  if (rule.scope === 'cart') return false
  const normalise = (s) => s.trim().toLowerCase()
  if (rule.scope === 'brand') {
    return normalise(item.brand) === normalise(rule.appliesTo)
  }
  if (rule.scope === 'platform') {
    return normalise(item.platform) === normalise(rule.appliesTo)
  }
  return false
}

/**
 * Calculates the rupee discount a rule gives on a given price.
 * Uses the provided price, not the original base price — important for stacking.
 */
export function calculateDiscountAmount(price, rule) {
  if (rule.type === 'percentage') {
    return Math.round(price * rule.value / 100)
  }
  if (rule.type === 'flat') {
    return rule.value
  }
  return 0
}

/**
 * Builds the customer-facing reasoning string for an applied rule.
 */
function ruleToReasoning(rule) {
  const scopeLabel = rule.scope === 'brand' ? 'Brand' : 'Platform'
  if (rule.type === 'percentage') {
    return `${scopeLabel} offer: ${rule.value}% off`
  }
  if (rule.type === 'flat') {
    return `${scopeLabel} offer: Rs.${rule.value} off`
  }
  return `${scopeLabel} offer applied`
}

/**
 * Applies the active discount rules to a single cart item.
 * Returns a DiscountResult.
 *
 * Logic:
 *   1. Find all rules that match this item.
 *   2. Among non-stackable rules, pick the one giving the largest discount.
 *   3. Apply any stackable rules on top of that price.
 *   4. Build the reasoning string from what was applied.
 */
export function applyDiscounts(item, rules) {
  const matchingRules = rules.filter((r) => ruleMatchesItem(item, r))

  // No rules match — return base price with explanation
  if (matchingRules.length === 0) {
    return {
      itemId: item.itemId,
      product: item.product,
      brand: item.brand,
      platform: item.platform,
      basePrice: item.basePrice,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      reasoning: 'No offers available',
    }
  }

  const nonStackable = matchingRules.filter((r) => !r.stackable)
  const stackable = matchingRules.filter((r) => r.stackable)

  // Pick the non-stackable rule that gives the largest saving
  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(item.basePrice, b) -
        calculateDiscountAmount(item.basePrice, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  // Apply winner first, then stack on top
  let price = item.basePrice
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    price -= calculateDiscountAmount(price, winner)
    appliedRules.push(winner.ruleId)
    reasoningParts.push(ruleToReasoning(winner))
  }

  for (const rule of stackable) {
    price -= calculateDiscountAmount(price, rule)
    appliedRules.push(rule.ruleId)
    reasoningParts.push(ruleToReasoning(rule))
  }

  const finalPrice = Math.round(price)

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules,
    skippedRules: skipped.map((r) => r.ruleId),
    reasoning: reasoningParts.join(' + '),
  }
}

/**
 * Runs applyDiscounts across every item in the cart, then evaluates
 * any cart-scope rules against the item subtotal.
 *
 * Returns { items: DiscountResult[], cartOffer: CartOffer | null, cartSubtotal: number, finalTotal: number }
 */
export function processCart(cartItems, rules) {
  const items = cartItems.map((item) => applyDiscounts(item, rules))
  const cartSubtotal = items.reduce((sum, r) => sum + r.finalPrice, 0)

  // Find cart-scope rules
  const cartRules = rules.filter((r) => r.scope === 'cart')

  let cartOffer = null

  for (const rule of cartRules) {
    const minVal = rule.minCartValue ?? 0
    if (cartSubtotal >= minVal) {
      const discountAmount = rule.type === 'percentage'
        ? Math.round(cartSubtotal * rule.value / 100)
        : rule.value

      const conditionStr = rule.minCartValue
        ? `Rs.${cartSubtotal.toLocaleString('en-IN')} ≥ Rs.${rule.minCartValue.toLocaleString('en-IN')}`
        : ''

      const description = rule.type === 'percentage'
        ? `${rule.value}% off entire cart`
        : `Rs.${rule.value} off entire cart`

      const discountLabel = conditionStr
        ? `${conditionStr} → ${description}`
        : description

      cartOffer = {
        applied: true,
        ruleId: rule.ruleId,
        discountLabel,
        discountAmount,
        thresholdMet: true,
        description,
      }
      break // only one cart offer applies
    } else {
      cartOffer = {
        applied: false,
        ruleId: rule.ruleId,
        discountLabel: null,
        discountAmount: null,
        thresholdMet: false,
      }
    }
  }

  const finalTotal = cartOffer?.applied
    ? cartSubtotal - cartOffer.discountAmount
    : cartSubtotal

  return { items, cartOffer, cartSubtotal, finalTotal }
}

/**
 * Sums the final prices across all results (item-level only).
 */
export function cartTotal(results) {
  return results.reduce((sum, r) => sum + r.finalPrice, 0)
}
