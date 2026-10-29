import { useRef, useState } from 'react'

const API = 'http://127.0.0.1:5001/api/enrich'

type Src = { id: string; status: string; summary: string; rationale: string; delta: number }
type Result = {
  ioc: string; type: string; risk: string; score: number; confidence: string
  sources: Src[]; freshness: string
}

function parse(lines: string[]): Result | null {
  let ioc = '', type = '', risk = 'Unknown', score = 0, confidence = '', freshness = ''
  let section = ''
  const rows: Record<string, { status: string; summary: string }> = {}
  const rat: Record<string, { text: string; delta: number }> = {}
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (line.startsWith('IOC:')) { ioc = line.slice(4).trim(); section = ''; continue }
    if (line.startsWith('Type:')) { type = line.slice(5).trim(); continue }
    if (line.startsWith('Risk:')) {
      const m = line.slice(5).trim().match(/([A-Za-z]+)\s*\((\d+)\)/)
      if (m) { risk = m[1]; score = parseInt(m[2], 10) }
      continue
    }
    if (line.startsWith('Confidence:')) { confidence = line.slice(11).trim(); continue }
    if (line.startsWith('Sources:')) { section = 'sources'; continue }
    if (line.startsWith('Freshness:')) { freshness = line.slice(10).trim(); section = ''; continue }
    if (line.startsWith('Rationale:')) { section = 'rationale'; continue }
    if (!line.trim()) { if (section === 'sources') section = ''; continue }
    if (section === 'sources') {
      const m = line.match(/^\s+(\w+)\s+(ok|not_found|not_applicable|error)\s*(.*)$/)
      if (m) rows[m[1].toLowerCase()] = { status: m[2], summary: m[3] }
    } else if (section === 'rationale') {
      const i = line.indexOf(':')
      if (i > -1) {
        const key = line.slice(0, i).trim().toLowerCase().replace(/\s+/g, '')
        const text = line.slice(i + 1).trim()
        const d = text.match(/\+(\d+)\s*$/)
        if (key !== 'total') rat[key] = { text, delta: d ? parseInt(d[1], 10) : 0 }
      }
    }
  }
  if (!ioc) return null
  const sources = Object.entries(rows).map(([id, r]) => ({
    id, status: r.status, summary: r.summary,
    rationale: rat[id]?.text ?? '', delta: rat[id]?.delta ?? 0,
  })).sort((a, b) => b.delta - a.delta)
  return { ioc, type, risk, score, confidence, sources, freshness }
}

const riskColor = (s: number) =>
  s >= 70 ? 'text-rose-400' : s >= 40 ? 'text-amber-400' : s >= 20 ? 'text-yellow-400' : 'text-emerald-400'

export default function App() {
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [tab, setTab] = useState<'dashboard' | 'terminal'>('dashboard')
  const [error, setError] = useState('')
  const esRef = useRef<EventSource | null>(null)

  const run = () => {
    const t = target.trim()
    if (!t || busy) return
    esRef.current?.close()
    setBusy(true); setError(''); setResult(null); setLogs([])
    const buf: string[] = []
    const es = new EventSource(`${API}?target=${encodeURIComponent(t)}`)
    esRef.current = es
    es.onmessage = (ev) => {
      if (ev.data.startsWith('__DONE__')) {
        es.close(); setBusy(false)
        const code = parseInt(ev.data.split(':')[1], 10)
        if (code !== 0) setError(`make exited with code ${code}`)
        const parsed = parse(buf)
        if (parsed) setResult(parsed)
        else if (code === 0) setError('Could not parse enrichment output')
        return
      }
      buf.push(ev.data)
      setLogs([...buf])
    }
    es.onerror = () => {
      es.close(); setBusy(false)
      setError('Lost connection to backend (is server.py running on :5001?)')
    }
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 p-6">
      <h1 className="text-2xl font-bold text-cyan-300 mb-4">3nricher</h1>
      <div className="flex gap-3 mb-4">
        <input
          value={target} onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="IP, domain or hash"
          className="flex-1 px-4 py-3 rounded-xl bg-[#0b1120] border border-slate-700 font-mono text-sm"
        />
        <button onClick={run} disabled={busy}
          className="px-6 py-3 rounded-xl bg-cyan-500 text-slate-950 font-semibold disabled:opacity-50">
          {busy ? 'Enriching…' : 'Run Enrichment'}
        </button>
      </div>

      {busy && <p className="mb-3 text-amber-300 font-mono text-sm">
        ⏳ {target.trim()} is being enriched, please wait…</p>}
      {error && <p className="mb-3 text-rose-400 font-mono text-sm">{error}</p>}

      <div className="flex gap-2 mb-4 text-sm">
        {(['dashboard', 'terminal'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-lg border ${tab === k
              ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
              : 'border-slate-700 text-slate-400'}`}>
            {k === 'dashboard' ? 'Overview' : 'Terminal logs'}
          </button>
        ))}
      </div>

      {tab === 'terminal' && (
        <pre className="p-4 rounded-xl bg-black border border-slate-800 text-xs text-slate-300 max-h-[70vh] overflow-auto whitespace-pre-wrap">
          {logs.join('\n') || 'No logs yet.'}
        </pre>
      )}

      {tab === 'dashboard' && result && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-wrap gap-8 items-center">
            <div>
              <div className="text-xs text-slate-400 uppercase">IOC ({result.type})</div>
              <div className="font-mono text-lg break-all">{result.ioc}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase">Risk</div>
              <div className={`text-3xl font-bold ${riskColor(result.score)}`}>
                {result.score} <span className="text-base">{result.risk}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase">Confidence</div>
              <div>{result.confidence}</div>
            </div>
          </div>

          {result.freshness && (
            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 font-mono text-sm">
              <span className="text-slate-400">Freshness / Geo: </span>{result.freshness}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {result.sources.map((s) => (
              <div key={s.id}
                className={`p-4 rounded-2xl border ${s.delta > 0
                  ? 'border-amber-500/40 bg-slate-900' : 'border-slate-800 bg-slate-900/50'}`}>
                <div className="flex justify-between">
                  <span className="font-bold">{s.id}</span>
                  {s.delta > 0 && <span className="text-rose-300 font-mono">+{s.delta}</span>}
                </div>
                <div className="text-[11px] uppercase text-slate-400">{s.status}</div>
                <div className="mt-2 text-xs font-mono text-slate-300">{s.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'dashboard' && !result && !busy && (
        <p className="text-slate-500">Enter a target and click Run Enrichment.</p>
      )}
    </div>
  )
}
