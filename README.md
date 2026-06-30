# Opptra Discount Engine

FDE Intern assignment.

## Live Demo

https://optraassignment.vercel.app/

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. Upload `sample-data/rules.csv` and `sample-data/cart.csv`, then click Calculate Discounts.

For natural language parsing, copy `.env.example` to `.env.local` and add `GROQ_API_KEY`. Use `npx vercel dev` if you want the `/api/parse-rule` route locally.

## Deploy

```bash
npm run build
```

Deploy `dist/` to Vercel. Set `GROQ_API_KEY` in environment variables.

## Sample results

| Item | Final Price |
|------|-------------|
| ITEM-01 | Rs.1,104 |
| ITEM-02 | Rs.629 |
| ITEM-03 | Rs.509 |
| ITEM-04 | Rs.2,499 |
| ITEM-05 | Rs.382 |
| ITEM-06 | Rs.809 |

Cart total before offer: Rs.5,932  
Cart offer (RULE-04): −Rs.593  
**Final cart total: Rs.5,339**

## What's included

- Item-level discounts (max non-stackable rule, stackable rules on top)
- Cart-level offer with minimum cart value
- Natural language rule input (Groq LLM + confirmation step)
- PDF cart upload