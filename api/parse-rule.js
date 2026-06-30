import {
  callGroqApi,
  DEFAULT_GROQ_MODEL,
} from '../lib/nlpCore.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const input = req.body?.input?.trim?.()
  if (!input) {
    return res.status(400).json({ ok: false, error: 'Please enter a discount rule description.' })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      error: 'LLM parsing is not configured. Set GROQ_API_KEY on the server.',
    })
  }

  const model = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL

  try {
    const result = await callGroqApi(input, apiKey, model)
    if (!result.ok) {
      return res.status(422).json(result)
    }
    return res.status(200).json({ ...result, source: 'groq' })
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: `LLM parsing failed: ${err.message}`,
    })
  }
}