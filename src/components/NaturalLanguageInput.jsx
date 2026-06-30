import { useState } from 'react'
import { parseNaturalLanguage } from '../engine/nlpParser.js'

const S = {
  wrap: {
    border: '1px solid #CECECE',
    borderRadius: 6,
    padding: '1.2rem 1.4rem',
    marginBottom: '1.2rem',
    background: '#fff',
  },
  title: {
    fontFamily: 'Georgia, serif',
    fontWeight: 700,
    fontSize: 14,
    color: '#131A48',
    marginBottom: '0.7rem',
    paddingBottom: 6,
    borderBottom: '2px solid #FF5800',
    display: 'inline-block',
  },
  inputRow: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  input: {
    flex: 1,
    padding: '0.55rem 0.8rem',
    border: '1px solid #CECECE',
    borderRadius: 4,
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
  },
  btn: {
    background: '#FF5800',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '0.55rem 1.2rem',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnDisabled: {
    background: '#CECECE',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '0.55rem 1.2rem',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'not-allowed',
    whiteSpace: 'nowrap',
  },
  confirmBox: {
    marginTop: '0.7rem',
    border: '1px solid #FF5800',
    borderRadius: 4,
    padding: '1rem',
    background: '#fff8f0',
  },
  fieldRow: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
    marginBottom: '0.6rem',
  },
  field: {
    fontSize: 12,
    color: '#131A48',
  },
  fieldLabel: {
    fontSize: 10,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontWeight: 700,
    marginRight: 4,
  },
  tag: (color, bg) => ({
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 20,
    background: bg,
    color,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }),
  actions: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  confirmBtn: {
    background: '#1e5c2c',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '0.45rem 1rem',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  discardBtn: {
    background: '#fff',
    color: '#888',
    border: '1px solid #CECECE',
    borderRadius: 4,
    padding: '0.45rem 1rem',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  examples: {
    fontSize: 11,
    color: '#888',
    marginTop: '0.4rem',
    lineHeight: 1.6,
  },
  error: {
    background: '#fce8e8',
    border: '1px solid #e57373',
    borderLeft: '3px solid #c0392b',
    borderRadius: 4,
    padding: '0.5rem 0.8rem',
    marginTop: '0.5rem',
    fontSize: 12,
    color: '#5a1010',
  },
  success: {
    background: '#e8f5e9',
    border: '1px solid #81c784',
    borderLeft: '3px solid #1e5c2c',
    borderRadius: 4,
    padding: '0.6rem 0.9rem',
    marginTop: '0.5rem',
    fontSize: 12,
    color: '#1e5c2c',
  },
}

export default function NaturalLanguageInput({ onRuleAdd, lastAddedRule }) {
  const [text, setText] = useState('')
  const [pendingRule, setPendingRule] = useState(null)
  const [parseError, setParseError] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseSource, setParseSource] = useState('')

  async function handleParse() {
    setParseError('')
    setPendingRule(null)
    setParseSource('')
    setParsing(true)

    try {
      const result = await parseNaturalLanguage(text)
      if (!result.ok) {
        setParseError(result.error)
        return
      }
      setPendingRule(result.rule)
      setParseSource(result.source ?? '')
    } finally {
      setParsing(false)
    }
  }

  function handleConfirm() {
    onRuleAdd(pendingRule)
    setPendingRule(null)
    setText('')
  }

  function handleDiscard() {
    setPendingRule(null)
  }

  return (
    <div style={S.wrap}>
      <div style={S.title}>Add Rule (Natural Language)</div>
      <div style={S.inputRow}>
        <input
          style={S.input}
          type="text"
          placeholder='e.g. "20% off for Natura Casa brand, stackable"'
          value={text}
          onChange={(e) => { setText(e.target.value); setParseError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && !parsing && handleParse()}
        />
        <button
          style={text.trim() && !parsing ? S.btn : S.btnDisabled}
          disabled={!text.trim() || parsing}
          onClick={handleParse}
        >
          {parsing ? 'Parsing…' : 'Parse'}
        </button>
      </div>

      <div style={S.examples}>
        Try: "20% off for Natura Casa brand, stackable" | "Rs.150 off all Natura Casa products" | "10% off if cart value is more than Rs.5,000"
      </div>

      {parseError && <div style={S.error}>{parseError}</div>}

      {lastAddedRule && !pendingRule && (
        <div style={S.success}>
          Rule added to this session — <strong>{lastAddedRule.ruleId}</strong> ({lastAddedRule.scope} ·{' '}
          {lastAddedRule.appliesTo || 'entire cart'} ·{' '}
          {lastAddedRule.type === 'percentage' ? `${lastAddedRule.value}%` : `Rs.${lastAddedRule.value}`}
          ). See the rules table above and updated cart summary below.
        </div>
      )}

      {pendingRule && (
        <div style={S.confirmBox}>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#131A48', marginBottom: '0.5rem' }}>
            Confirm parsed rule
            {parseSource && (
              <span style={{ fontWeight: 400, fontSize: 10, color: '#888', marginLeft: 8 }}>
                via {parseSource === 'groq' ? 'Groq LLM (API)' : 'regex fallback'}
              </span>
            )}
          </div>
          <div style={S.fieldRow}>
            <span style={S.field}>
              <span style={S.fieldLabel}>Scope</span>
              <span style={S.tag('#FF5800', '#fff0e0')}>{pendingRule.scope}</span>
            </span>
            <span style={S.field}>
              <span style={S.fieldLabel}>Applies To</span>
              {pendingRule.appliesTo || <span style={{ color: '#888', fontStyle: 'italic' }}>entire cart</span>}
            </span>
            <span style={S.field}>
              <span style={S.fieldLabel}>Type</span>
              <span style={S.tag('#1e5c2c', '#e0f0e0')}>{pendingRule.type}</span>
            </span>
            <span style={S.field}>
              <span style={S.fieldLabel}>Value</span>
              {pendingRule.type === 'percentage' ? `${pendingRule.value}%` : `Rs.${pendingRule.value}`}
            </span>
            <span style={S.field}>
              <span style={S.fieldLabel}>Stackable</span>
              <span style={S.tag(pendingRule.stackable ? '#1e5c2c' : '#888', pendingRule.stackable ? '#e0f0e0' : '#f0f0f0')}>
                {pendingRule.stackable ? 'Yes' : 'No'}
              </span>
            </span>
            {pendingRule.minCartValue !== undefined && (
              <span style={S.field}>
                <span style={S.fieldLabel}>Min Cart Value</span>
                Rs.{pendingRule.minCartValue}
              </span>
            )}
          </div>
          <div style={S.actions}>
            <button style={S.confirmBtn} onClick={handleConfirm}>Confirm & Add</button>
            <button style={S.discardBtn} onClick={handleDiscard}>Discard</button>
          </div>
        </div>
      )}
    </div>
  )
}
