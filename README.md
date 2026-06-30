# Opptra Discount Engine

FDE Intern assignment — customer-facing cart pricing engine with item-level discounts, cart-level offers, natural-language rule input (Groq LLM), and PDF cart upload.

## Live Demo

https://optraassignment.vercel.app/

## Run locally

```bash
npm install
cp .env.example .env.local   # add your Groq API key
npm run dev
```

Open http://localhost:5173

For the serverless LLM route locally, use:

```bash
npx vercel dev
```

## Deploy (Vercel)

1. Fork this repo on GitHub
2. Import the fork into [Vercel](https://vercel.com)
3. Add environment variable: `GROQ_API_KEY` (from https://console.groq.com/keys)
4. Deploy — Vercel runs `npm run build` and serves `dist/` plus `/api/parse-rule`
5. Paste the live URL above

## Features

| Feature | Description |
|---------|-------------|
| **CSV rules & cart** | Upload `sample-data/rules.csv` and `cart.csv` |
| **Item discounts** | Max non-stackable rule wins; stackable rules layer on top |
| **Cart-level offer** | RULE-04 style threshold + % off entire cart subtotal |
| **Natural language rules** | Groq LLM parses plain English → confirmation step → auto re-run |
| **PDF cart upload** | Extract Product / Brand / Platform / Base Price table → replace cart |

## Natural language rule input (Groq LLM)

1. Type a rule, e.g. `20% off for Natura Casa brand, stackable`
2. Click **Parse** — calls `/api/parse-rule` (Groq on the server)
3. Review parsed fields in the confirmation box
4. **Confirm & Add** — rule joins active rules and cart recalculates

**Parsing order:** API route (production) → client-side Groq if `VITE_GROQ_API_KEY` is set → regex fallback (offline dev only).

**Ambiguous input** (e.g. `Give a discount for big orders`) returns a clear error instead of crashing.

### Groq model

Default: **`openai/gpt-oss-20b`** (production, fast, free tier).

Override with `GROQ_MODEL` (server) or `VITE_GROQ_MODEL` (client dev).

#### Currently available Groq production models (Jun 2026)

| Model ID | Best for |
|----------|----------|
| `openai/gpt-oss-20b` | Fast structured parsing (**default**) |
| `openai/gpt-oss-120b` | Higher quality reasoning |
| `llama-3.1-8b-instant` | Lightweight / high throughput |

See [Groq models](https://console.groq.com/docs/models).

## How to use

1. Upload `sample-data/rules.csv`
2. Upload `sample-data/cart.csv` **or** `sample-data/cart.pdf`
3. Click **Calculate Discounts** (PDF upload auto-calculates)
4. Optionally add rules via natural language

## Project structure

```
api/
  parse-rule.js         ← Vercel serverless Groq LLM endpoint
lib/
  nlpCore.js            ← shared prompt, validation, Groq call
src/
  engine/
    discountEngine.js   ← pure discount logic
    csvParser.js        ← CSV → typed objects
    nlpParser.js        ← NL input orchestration
    pdfParser.js        ← PDF → cart items
  components/
    CsvUploader.jsx
    PdfUploader.jsx
    NaturalLanguageInput.jsx
    DataTable.jsx
    ErrorBanner.jsx
  App.jsx
sample-data/
  rules.csv
  cart.csv
  cart.pdf              ← sample cart for PDF upload demo
```

## Expected results (sample data)

| Item | Base Price | Final Price | Offer Applied |
|------|-----------|-------------|---------------|
| ITEM-01 | Rs.1,299 | Rs.1,104 | Platform 15% off (beats Rs.150 flat) |
| ITEM-02 | Rs.849 | Rs.629 | Brand Rs.150 off + Platform 10% stacked |
| ITEM-03 | Rs.599 | Rs.509 | Platform 15% off |
| ITEM-04 | Rs.2,499 | Rs.2,499 | No offers available |
| ITEM-05 | Rs.449 | Rs.382 | Platform 15% off |
| ITEM-06 | Rs.899 | Rs.809 | Platform 10% off |

| | Amount |
|--|--------|
| Cart total before offer | Rs.5,932 |
| Cart offer (RULE-04, 10% off) | −Rs.593 |
| **Final cart total** | **Rs.5,339** |

## Discount logic

- Multiple non-stackable rules on one item → largest rupee saving wins
- `stackable: true` rules apply on top of the winning non-stackable rule
- Cart-scope rules run after item discounts against the item subtotal
- No matching rules → base price + "No offers available"

## Design decisions

- **LLM behind API route** — `GROQ_API_KEY` stays server-side on Vercel; regex fallback for offline dev
- **Inputs adapt to engine** — parsers produce `DiscountRule` / `CartItem`; calculator unchanged
- **Malformed PDF rows** — skipped with a warning; valid rows still load
- **Invalid LLM output** — validated before confirmation; user never sees a broken rule