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

export function calculateDiscountAmount(price, rule) {
  if (rule.type === 'percentage') {
    return Math.round(price * rule.value / 100)
  }
  if (rule.type === 'flat') {
    return rule.value
  }
  return 0
}

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

export function applyDiscounts(item, rules) {
  const matchingRules = rules.filter((r) => ruleMatchesItem(item, r))

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

export function processCart(cartItems, rules) {
  const items = cartItems.map((item) => applyDiscounts(item, rules))
  const cartSubtotal = items.reduce((sum, r) => sum + r.finalPrice, 0)

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
      break
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

export function cartTotal(results) {
  return results.reduce((sum, r) => sum + r.finalPrice, 0)
}
