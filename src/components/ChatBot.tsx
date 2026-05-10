import { useEffect, useRef, useState } from 'react'
import type { NodeDraft } from '../types/network'
import { createAvatarUrl, normalizeRelationship } from '../types/network'

// ─── Types ───────────────────────────────────────────────────────────────────

type Role = 'bot' | 'user'

interface Message {
  id: number
  role: Role
  text: string
}

interface ParsedContact {
  name?: string
  email?: string
  linkedin?: string
  instagram?: string
  github?: string
  groups?: string[]
  notes?: string
}

// Gemini conversation turn shape
interface GeminiTurn {
  role: 'user' | 'model'
  parts: { text: string }[]
}

interface Props {
  allGroups: string[]
  onAddNode: (draft: NodeDraft) => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

const INTRO_WITH_AI =
  "Hi! I'm powered by Gemini. Paste a contact in plain text and I'll parse it for you — ask any clarifying questions needed."

const INTRO_LOCAL =
  "Hi! Paste a contact in plain text and I'll add them to your network. E.g. \"John Smith, john@email.com, linkedin.com/in/john, friend\""

const SYSTEM_PROMPT = (knownGroups: string[]) => `
You are a contact parser assistant embedded in a relationship network app called Knotty.

Your job:
1. Parse plain-text contact info the user pastes and extract structured data.
2. If a name is missing or ambiguous, ask one clear clarifying question.
3. If groups/relationship context is missing, ask which group(s) the person belongs to.
4. Once you have enough info, respond ONLY with a valid JSON block wrapped in \`\`\`json ... \`\`\` — nothing else.

JSON schema:
{
  "name": "Full Name",           // required
  "email": "...",                // optional
  "linkedin": "https://...",     // optional
  "instagram": "https://...",    // optional
  "github": "https://...",       // optional
  "groups": ["friend", "work"],  // array, use lowercase, pick from known groups if possible
  "notes": "raw text summary"    // optional
}

Known groups in the user's network: ${knownGroups.length ? knownGroups.join(', ') : '(none yet — suggest common ones like friend, family, work)'}

Rules:
- Never make up information not present in the user's text.
- Extract URLs as-is.
- For groups, try to match against the known groups list; otherwise infer from context (family, friend, colleague → work, etc.).
- Keep asking questions until you can produce complete JSON. Only ONE question at a time.
- When ready, output the JSON block and nothing else.
`.trim()

// ─── Local fallback parser ────────────────────────────────────────────────────

function extractEmail(text: string) {
  return text.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i)?.[0]
}

function extractUrl(text: string, token: string) {
  return text.match(new RegExp(`https?:\\/\\/[^\\s]*${token}[^\\s]*`, 'i'))?.[0]
}

function extractName(text: string) {
  const patterns = [
    /name[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/i,
    /add\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/i,
    /^([A-Z][a-z]+(?: [A-Z][a-z]+)+)/m,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return m[1].trim()
  }
}

function extractGroups(text: string, knownGroups: string[]) {
  const lower = text.toLowerCase()
  const found = knownGroups.filter((g) => lower.includes(g.toLowerCase()))
  const rMap: Record<string, string> = {
    friend: 'friend', family: 'family', colleague: 'work',
    coworker: 'work', work: 'work', mentor: 'mentor', professional: 'work',
  }
  for (const [kw, grp] of Object.entries(rMap)) {
    if (lower.includes(kw) && !found.includes(grp)) found.push(grp)
  }
  return [...new Set(found)]
}

function localParse(text: string, knownGroups: string[]): ParsedContact {
  return {
    name: extractName(text),
    email: extractEmail(text),
    linkedin: extractUrl(text, 'linkedin'),
    instagram: extractUrl(text, 'instagram'),
    github: extractUrl(text, 'github'),
    groups: extractGroups(text, knownGroups),
    notes: text.trim(),
  }
}

// ─── Gemini API call ─────────────────────────────────────────────────────────

async function callGemini(history: GeminiTurn[], systemInstruction: string): Promise<string> {
  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: history,
    generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
  }

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`)
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

function tryExtractJson(text: string): ParsedContact | null {
  const m = text.match(/```json\s*([\s\S]*?)```/)
  if (!m) return null
  try {
    return JSON.parse(m[1]) as ParsedContact
  } catch {
    return null
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildContactString(p: ParsedContact): string {
  return [p.email, p.linkedin, p.instagram, p.github].filter(Boolean).join('  ')
}

function summaryText(p: ParsedContact): string {
  const lines = [`Name: ${p.name}`]
  if (p.email) lines.push(`Email: ${p.email}`)
  if (p.linkedin) lines.push(`LinkedIn: ${p.linkedin}`)
  if (p.instagram) lines.push(`Instagram: ${p.instagram}`)
  if (p.github) lines.push(`GitHub: ${p.github}`)
  if (p.groups?.length) lines.push(`Groups: ${p.groups.join(', ')}`)
  return lines.join('\n')
}

// ─── Component ───────────────────────────────────────────────────────────────

let msgId = 0
const nextId = () => ++msgId

export function ChatBot({ allGroups, onAddNode }: Props) {
  const hasGemini = Boolean(GEMINI_API_KEY && GEMINI_API_KEY !== 'paste_your_key_here')

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { id: nextId(), role: 'bot', text: hasGemini ? INTRO_WITH_AI : INTRO_LOCAL },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // Gemini conversation history (parallel to messages, only for AI path)
  const geminiHistory = useRef<GeminiTurn[]>([])

  // Pending parsed contact (local path)
  const [pendingLocal, setPendingLocal] = useState<ParsedContact | null>(null)
  // Local state machine stage
  type LocalStage = 'idle' | 'ask-name' | 'ask-groups' | 'confirm'
  const [localStage, setLocalStage] = useState<LocalStage>('idle')

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const push = (role: Role, text: string) =>
    setMessages((m) => [...m, { id: nextId(), role, text }])
  const bot = (text: string) => push('bot', text)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  const commitNode = (parsed: ParsedContact) => {
    const groups = parsed.groups?.length ? parsed.groups : ['other']
    const relationship = (() => {
      if (groups.includes('family')) return 'Family'
      if (groups.includes('mentor')) return 'Mentor'
      if (groups.some((g) => ['work', 'software engineer', 'professional', 'linkedin'].includes(g)))
        return 'Professional'
      if (groups.includes('friend')) return 'Friend'
      return 'Other'
    })()
    const rel = normalizeRelationship(relationship)

    onAddNode({
      name: parsed.name!,
      photo: createAvatarUrl(parsed.name!),
      contact: buildContactString(parsed),
      relationship: rel,
      groups,
      notes: parsed.notes ?? '',
    })

    bot(`Done! ${parsed.name} has been added to your network. Paste another contact anytime.`)
    setPendingLocal(null)
    setLocalStage('idle')
  }

  // ── Gemini path ────────────────────────────────────────────────────────────

  const handleGeminiTurn = async (userText: string) => {
    geminiHistory.current.push({ role: 'user', parts: [{ text: userText }] })
    setLoading(true)

    try {
      const reply = await callGemini(geminiHistory.current, SYSTEM_PROMPT(allGroups))
      geminiHistory.current.push({ role: 'model', parts: [{ text: reply }] })

      const parsed = tryExtractJson(reply)
      if (parsed && parsed.name) {
        bot(`Here's what I found:\n\n${summaryText(parsed)}\n\nType "yes" to add, "no" to cancel, or correct anything.`)
        setPendingLocal(parsed)
        setLocalStage('confirm')
      } else {
        // Gemini asked a clarifying question
        bot(reply.trim())
      }
    } catch (err) {
      bot(`Gemini error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  // ── Local path ─────────────────────────────────────────────────────────────

  const handleLocalTurn = (userText: string) => {
    if (localStage === 'idle') {
      const parsed = localParse(userText, allGroups)

      if (!parsed.name) {
        setPendingLocal(parsed)
        setLocalStage('ask-name')
        bot("I couldn't find a name. What's this person's full name?")
        return
      }
      if (!parsed.groups?.length) {
        setPendingLocal(parsed)
        setLocalStage('ask-groups')
        bot(`Got it — ${parsed.name}. What group(s) should they be in? (e.g. friend, family, work) Or type "skip".`)
        return
      }

      setPendingLocal(parsed)
      setLocalStage('confirm')
      bot(`Here's what I found:\n\n${summaryText(parsed)}\n\nType "yes" to add, "no" to cancel, or correct a field.`)
      return
    }

    if (localStage === 'ask-name') {
      const updated = { ...pendingLocal, name: userText.trim() }
      setPendingLocal(updated)
      if (!updated.groups?.length) {
        setLocalStage('ask-groups')
        bot(`Got it — ${updated.name}. What group(s) should they be in? Or "skip".`)
      } else {
        setLocalStage('confirm')
        bot(`Here's what I found:\n\n${summaryText(updated)}\n\nType "yes" to add or "no" to cancel.`)
      }
      return
    }

    if (localStage === 'ask-groups') {
      if (userText.toLowerCase() === 'skip') {
        const updated = { ...pendingLocal, groups: [] }
        setPendingLocal(updated)
        setLocalStage('confirm')
        bot(`Alright, no groups.\n\n${summaryText(updated)}\n\nType "yes" to add or "no" to cancel.`)
        return
      }
      const groups = extractGroups(userText, allGroups)
      const rawGroups = groups.length
        ? groups
        : userText.split(/[,\s]+/).filter(Boolean).map((s) => s.toLowerCase())
      const updated = { ...pendingLocal, groups: rawGroups }
      setPendingLocal(updated)
      setLocalStage('confirm')
      bot(`Here's what I'll create:\n\n${summaryText(updated)}\n\nType "yes" to add or "no" to cancel.`)
      return
    }

    if (localStage === 'confirm') {
      const lower = userText.toLowerCase()
      if (['yes', 'y', 'yep', 'sure', 'ok'].includes(lower)) {
        commitNode(pendingLocal!)
        return
      }
      if (['no', 'n', 'cancel', 'nope'].includes(lower)) {
        setPendingLocal(null)
        setLocalStage('idle')
        bot('Cancelled. Feel free to paste another contact.')
        return
      }
      // Inline field corrections
      const nameM = userText.match(/^name[:\s]+(.+)/i)
      const emailM = userText.match(/^email[:\s]+(.+)/i)
      const groupM = userText.match(/^groups?[:\s]+(.+)/i)
      const notesM = userText.match(/^notes?[:\s]+(.+)/i)
      let updated = pendingLocal!
      if (nameM) updated = { ...updated, name: nameM[1].trim() }
      else if (emailM) updated = { ...updated, email: emailM[1].trim() }
      else if (groupM) updated = { ...updated, groups: groupM[1].split(/[,\s]+/).filter(Boolean).map((s) => s.toLowerCase()) }
      else if (notesM) updated = { ...updated, notes: notesM[1].trim() }
      else {
        bot('Type "yes" to confirm, "no" to cancel, or correct a field:\nname: …\nemail: …\ngroups: …')
        return
      }
      setPendingLocal(updated)
      bot(`Updated:\n\n${summaryText(updated)}\n\nType "yes" to add or keep correcting.`)
    }
  }

  // ── Unified send ───────────────────────────────────────────────────────────

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    push('user', text)
    setInput('')

    if (hasGemini && localStage !== 'confirm') {
      // Gemini handles everything except the final confirm step (which is local)
      void handleGeminiTurn(text)
    } else {
      handleLocalTurn(text)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend()
  }

  const reset = () => {
    setMessages([{ id: nextId(), role: 'bot', text: hasGemini ? INTRO_WITH_AI : INTRO_LOCAL }])
    setPendingLocal(null)
    setLocalStage('idle')
    setInput('')
    geminiHistory.current = []
  }

  return (
    <>
      <button
        className="chatbot-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chatbot' : 'Open contact chatbot'}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {open && (
        <div className="chatbot-panel">
          <div className="chatbot-header">
            <div className="chatbot-header-left">
              <span className="chatbot-title">Contact Import</span>
              {hasGemini && <span className="chatbot-badge">Gemini</span>}
            </div>
            <button className="chatbot-reset" onClick={reset} title="Start over">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 .49-3.54" />
              </svg>
            </button>
          </div>

          <div className="chatbot-messages" ref={scrollRef}>
            {messages.map((msg) => (
              <div key={msg.id} className={`chatbot-msg chatbot-msg-${msg.role}`}>
                <pre className="chatbot-text">{msg.text}</pre>
              </div>
            ))}
            {loading && (
              <div className="chatbot-msg chatbot-msg-bot">
                <span className="chatbot-typing">
                  <span /><span /><span />
                </span>
              </div>
            )}
          </div>

          <div className="chatbot-input-row">
            <input
              ref={inputRef}
              className="chatbot-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={loading ? 'Waiting for Gemini…' : 'Paste contact or reply…'}
              disabled={loading}
            />
            <button className="chatbot-send" onClick={handleSend} disabled={loading} aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
