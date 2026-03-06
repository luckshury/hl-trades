"use client"

import { useState, useEffect, useMemo } from "react"
import { EquityCurve } from "./EquityCurve"

const PROXY = "https://lighter-proxy-production.up.railway.app"
const GREEN  = "#32D695"
const RED    = "#FF4C61"
const PURPLE = "#a78bfa"

function fmt(n: number, dp = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
}
function fmtPx(n: number) {
  return n >= 1000 ? fmt(n, 1) : n >= 1 ? fmt(n, 2) : fmt(n, 4)
}
function timeAgo(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
function utcDate(ms: number) {
  return new Date(ms).toUTCString().slice(5, 22)
}
function durationStr(ms: number) {
  const s = Math.floor(ms / 1000)
  if (s < 60)    return `${s}s`
  if (s < 3600)  return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

type LighterTrade = {
  id?: string | number
  market_id?: number
  symbol?: string
  side?: string
  is_ask?: boolean
  base_amount?: string | number
  quote_amount?: string | number
  price?: string | number
  timestamp?: number
  created_at?: number
  fee?: string | number
  pnl?: string | number
  role?: string
  type?: string
  [key: string]: any
}

const PERIODS = [
  { label: "24h",  ms: 86400_000 },
  { label: "7d",   ms: 604800_000 },
  { label: "30d",  ms: 2592000_000 },
  { label: "90d",  ms: 7776000_000 },
]

export function LighterTab() {
  const [l1Address,    setL1Address]    = useState("")
  const [apiKeyIndex,  setApiKeyIndex]  = useState("2")
  const [privateKey,   setPrivateKey]   = useState("")
  const [accountIndex, setAccountIndex] = useState<number | null>(null)
  const [resolving,    setResolving]    = useState(false)

  const [trades,   setTrades]   = useState<LighterTrade[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [period,   setPeriod]   = useState(PERIODS[1])
  const [filter,   setFilter]   = useState("all")

  // Persist credentials in localStorage
  useEffect(() => {
    const saved = localStorage.getItem("lighter_creds")
    if (saved) {
      try {
        const c = JSON.parse(saved)
        if (c.l1Address)   setL1Address(c.l1Address)
        if (c.apiKeyIndex) setApiKeyIndex(c.apiKeyIndex)
        if (c.privateKey)  setPrivateKey(c.privateKey)
        if (c.accountIndex != null) setAccountIndex(c.accountIndex)
      } catch {}
    }
  }, [])

  function saveCreds(patch: Record<string, any>) {
    const existing = JSON.parse(localStorage.getItem("lighter_creds") || "{}")
    localStorage.setItem("lighter_creds", JSON.stringify({ ...existing, ...patch }))
  }

  async function resolveAccount() {
    if (!l1Address.trim()) return
    setResolving(true)
    setError(null)
    try {
      const res  = await fetch(`${PROXY}/account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ l1_address: l1Address.trim() }),
      })
      const data = await res.json()
      if (data.detail) throw new Error(data.detail)
      const idx = data.sub_accounts?.[0]?.index
      if (idx == null) throw new Error("No account found for this address")
      setAccountIndex(idx)
      saveCreds({ l1Address: l1Address.trim(), accountIndex: idx })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setResolving(false)
    }
  }

  async function fetchTrades(p = period) {
    if (!privateKey.trim() || accountIndex == null) {
      setError("Need private key and account index (resolve L1 address first)")
      return
    }
    setLoading(true)
    setError(null)
    try {
      saveCreds({ apiKeyIndex, privateKey: privateKey.trim() })
      const res  = await fetch(`${PROXY}/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          private_key:   privateKey.trim(),
          api_key_index: Number(apiKeyIndex),
          account_index: accountIndex,
          limit: 100,
          sort_dir: "desc",
        }),
      })
      const data = await res.json()
      if (data.detail) throw new Error(data.detail)
      const list: LighterTrade[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.trades)
          ? data.trades
          : data?.items || data?.data || []
      // Filter by time period (timestamp is unix seconds from Lighter)
      const cutoffSec = (Date.now() - p.ms) / 1000
      setTrades(list.filter(t => {
        const ts = Number(t.timestamp || t.created_at || 0)
        return ts >= cutoffSec
      }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const symbols  = ["all", ...Array.from(new Set(trades.map(t => t.symbol || `M${t.market_id}`).filter(Boolean))).sort()]
  const filtered = trades.filter(t => filter === "all" || (t.symbol || `M${t.market_id}`) === filter)

  const totalPnl  = filtered.reduce((s, t) => s + Number(t.pnl || 0), 0)
  const totalFees = filtered.reduce((s, t) => s + Number(t.fee || 0), 0)
  const winners   = filtered.filter(t => Number(t.pnl || 0) > 0).length
  const winRate   = filtered.length ? (winners / filtered.length * 100).toFixed(1) : "—"

  const equityPoints = useMemo(() => {
    let cum = 0
    return [...filtered]
      .filter(t => t.pnl !== undefined)
      .sort((a, b) => (a.timestamp ?? a.created_at ?? 0) - (b.timestamp ?? b.created_at ?? 0))
      .map(t => {
        cum += Number(t.pnl || 0)
        const ts = Number(t.timestamp || t.created_at || 0)
        const ms = ts * 1000  // Lighter timestamps are unix seconds
        return { time: ms, value: Number(cum.toFixed(2)) }
      })
  }, [filtered])

  return (
    <div>
      {/* Credentials */}
      <div className="mb-4 bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-2">Lighter Credentials</div>

        <div className="flex gap-2">
          <input value={l1Address} onChange={e => setL1Address(e.target.value)}
            placeholder="L1 Ethereum address (0x...)"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-white/25 font-mono"/>
          <button onClick={resolveAccount} disabled={resolving || !l1Address}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-white/5 border border-white/10 hover:border-white/25 transition-all disabled:opacity-40">
            {resolving ? "…" : "Resolve"}
          </button>
        </div>

        {accountIndex != null && (
          <div className="text-[11px] text-[#32D695]">✓ Account index: {accountIndex}</div>
        )}

        <div className="flex gap-2">
          <input value={apiKeyIndex} onChange={e => setApiKeyIndex(e.target.value)}
            placeholder="API key index (e.g. 2)"
            className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-white/25 font-mono"/>
          <input value={privateKey} onChange={e => setPrivateKey(e.target.value)}
            type="password"
            placeholder="Read-only API private key (40 bytes hex)"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-white/25 font-mono"/>
        </div>

        <div className="text-[10px] text-zinc-600">
          Key stored in localStorage only · sent per-request over HTTPS · never stored server-side
        </div>
      </div>

      {/* Period + fetch */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button key={p.label}
              onClick={() => { setPeriod(p); if (accountIndex != null && privateKey) fetchTrades(p) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                period.label === p.label ? "border-white/30 text-white bg-white/8" : "border-white/8 text-zinc-500"
              }`}>{p.label}</button>
          ))}
        </div>
        <button onClick={() => fetchTrades()} disabled={loading || !privateKey || accountIndex == null}
          className="px-4 py-1.5 rounded-lg text-xs font-bold bg-white/8 border border-white/10 hover:border-white/25 transition-all disabled:opacity-40">
          {loading ? "…" : "Fetch trades"}
        </button>
      </div>

      {error && <div className="text-sm text-[#FF4C61] mb-4">{error}</div>}

      {/* Stats */}
      {filtered.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: "PnL",   value: `${totalPnl >= 0 ? "+" : ""}$${fmt(totalPnl)}`, color: totalPnl >= 0 ? GREEN : RED },
              { label: "Fees",  value: `-$${fmt(totalFees)}`,                           color: "#888" },
              { label: "Win %", value: `${winRate}%`,                                  color: PURPLE },
              { label: "Trades",value: `${filtered.length}`,                            color: "#888" },
            ].map(s => (
              <div key={s.label} className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                <div className="text-[10px] text-zinc-600 mb-1 uppercase tracking-wider">{s.label}</div>
                <div className="text-sm font-black" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Symbol filter */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
            {symbols.map(c => (
              <button key={c} onClick={() => setFilter(c)}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                  filter === c ? "border-white/30 text-white bg-white/8" : "border-white/8 text-zinc-500"
                }`}>{c.toUpperCase()}</button>
            ))}
          </div>

          {/* Equity curve */}
          {equityPoints.length >= 2 && (
            <div className="mb-4 rounded-xl border border-white/8 bg-white/2 overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">Equity Curve</span>
                <span className={`text-xs font-black ${totalPnl >= 0 ? "text-[#32D695]" : "text-[#FF4C61]"}`}>
                  {totalPnl >= 0 ? "+" : ""}${fmt(totalPnl)}
                </span>
              </div>
              <div className="h-36"><EquityCurve points={equityPoints} /></div>
            </div>
          )}

          {/* Trade list */}
          <div className="flex flex-col gap-1.5">
            {filtered.map((t, i) => {
              const isAsk   = t.is_ask ?? t.side === "sell"
              const pnl     = Number(t.pnl || 0)
              const px      = Number(t.price || 0)
              const sz      = Number(t.base_amount || 0)
                      const ts      = Number(t.timestamp || t.created_at || 0)
              const ms      = ts * 1000  // Lighter timestamps are unix seconds

              return (
                <div key={t.id ?? i} className="bg-white/3 border border-white/6 rounded-xl px-4 py-3 hover:border-white/12 transition-all">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black">{t.symbol || `M${t.market_id}`}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        !isAsk ? "bg-[#32D695]/15 text-[#32D695]" : "bg-[#FF4C61]/15 text-[#FF4C61]"
                      }`}>{!isAsk ? "BUY" : "SELL"}</span>
                      {t.role && <span className="text-[10px] text-zinc-600">{t.role}</span>}
                    </div>
                    <div className={`text-sm font-black ${pnl > 0 ? "text-[#32D695]" : pnl < 0 ? "text-[#FF4C61]" : "text-zinc-500"}`}>
                      {pnl !== 0 ? `${pnl > 0 ? "+" : ""}$${fmt(Math.abs(pnl))}` : "—"}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <div className="flex gap-3">
                      <span><span className="text-zinc-600">px </span>${fmtPx(px)}</span>
                      <span><span className="text-zinc-600">sz </span>{sz}</span>
                      <span><span className="text-zinc-600">val </span>${fmt(px * sz, 0)}</span>
                      {Number(t.fee) > 0 && <span><span className="text-zinc-600">fee </span>${fmt(Number(t.fee))}</span>}
                    </div>
                    <span className="text-zinc-600" title={utcDate(ms)}>{timeAgo(ms)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {!loading && trades.length === 0 && privateKey && accountIndex != null && !error && (
        <div className="text-center text-zinc-600 text-sm mt-12">No trades found for this period</div>
      )}
    </div>
  )
}
