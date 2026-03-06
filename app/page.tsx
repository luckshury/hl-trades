"use client"

import { useState, useRef } from "react"

type Fill = {
  coin: string
  px: string
  sz: string
  side: "B" | "A"
  time: number
  dir: string
  closedPnl: string
  fee: string
  tid: number
  hash: string
  startPosition: string
  oid: number
}

const GREEN  = "#32D695"
const RED    = "#FF4C61"
const PURPLE = "#a78bfa"

function fmt(n: number, dp = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

function timeAgo(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60)   return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function utcDate(ms: number) {
  return new Date(ms).toUTCString().slice(5, 22)
}

export default function Home() {
  const [address, setAddress]   = useState("")
  const [trades, setTrades]     = useState<Fill[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [queried, setQueried]   = useState("")
  const [filter, setFilter]     = useState("all")
  const inputRef = useRef<HTMLInputElement>(null)

  const PERIODS = [
    { label: "24h",  ms: 86400_000 },
    { label: "7d",   ms: 604800_000 },
    { label: "30d",  ms: 2592000_000 },
    { label: "90d",  ms: 7776000_000 },
  ]
  const [period, setPeriod] = useState(PERIODS[1])

  async function fetchTrades(addr: string) {
    if (!addr.trim()) return
    setLoading(true)
    setError(null)
    setTrades([])

    try {
      const start = Date.now() - period.ms
      const res   = await fetch(`/api/trades?address=${addr.trim()}&startTime=${start}`)
      const data  = await res.json()

      if (!Array.isArray(data)) {
        setError(data?.error || "No trades found or invalid address")
        return
      }

      // Sort newest first
      setTrades(data.sort((a: Fill, b: Fill) => b.time - a.time))
      setQueried(addr.trim())
    } catch {
      setError("Request failed")
    } finally {
      setLoading(false)
    }
  }

  const coins = ["all", ...Array.from(new Set(trades.map(t => t.coin))).sort()]

  const filtered = trades.filter(t => {
    if (filter !== "all" && t.coin !== filter) return false
    return true
  })

  // Stats
  const totalPnl   = filtered.reduce((s, t) => s + Number(t.closedPnl), 0)
  const totalFees  = filtered.reduce((s, t) => s + Number(t.fee), 0)
  const longs      = filtered.filter(t => t.side === "B").length
  const shorts     = filtered.filter(t => t.side === "A").length
  const winners    = filtered.filter(t => Number(t.closedPnl) > 0).length
  const winRate    = filtered.length ? (winners / filtered.length * 100).toFixed(1) : "—"

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-4 max-w-2xl mx-auto">

      {/* Header */}
      <div className="mb-8 pt-6">
        <div className="text-xs tracking-[0.3em] text-zinc-500 mb-1 uppercase">Hyperliquid</div>
        <div className="text-2xl font-black tracking-tight">Trade History</div>
      </div>

      {/* Wallet input */}
      <div className="flex gap-2 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={address}
          onChange={e => setAddress(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fetchTrades(address)}
          placeholder="0x wallet address..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/25 transition-colors font-mono"
        />
        <button
          onClick={() => fetchTrades(address)}
          disabled={loading}
          className="px-5 py-3 rounded-xl text-sm font-bold bg-white/8 border border-white/10 hover:border-white/25 transition-all disabled:opacity-40"
        >
          {loading ? "…" : "Go"}
        </button>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-6">
        {PERIODS.map(p => (
          <button
            key={p.label}
            onClick={() => { setPeriod(p); if (queried) fetchTrades(queried) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              period.label === p.label
                ? "border-white/30 text-white bg-white/8"
                : "border-white/8 text-zinc-500"
            }`}
          >{p.label}</button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-[#FF4C61] mb-4 px-1">{error}</div>
      )}

      {/* Stats bar */}
      {trades.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: "PnL",     value: `${totalPnl >= 0 ? "+" : ""}$${fmt(totalPnl)}`, color: totalPnl >= 0 ? GREEN : RED },
              { label: "Fees",    value: `$${fmt(totalFees)}`,                            color: "#888" },
              { label: "Win %",   value: `${winRate}%`,                                  color: PURPLE },
              { label: "Trades",  value: `${filtered.length}`,                            color: "#888" },
            ].map(s => (
              <div key={s.label} className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                <div className="text-[10px] text-zinc-600 mb-1 uppercase tracking-wider">{s.label}</div>
                <div className="text-sm font-black" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Coin filter */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
            {coins.map(c => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                  filter === c ? "border-white/30 text-white bg-white/8" : "border-white/8 text-zinc-500"
                }`}
              >{c.toUpperCase()}</button>
            ))}
          </div>

          {/* L/S breakdown */}
          <div className="flex gap-2 mb-4 text-xs text-zinc-500">
            <span style={{ color: GREEN }}>↑ {longs} long</span>
            <span className="text-zinc-700">·</span>
            <span style={{ color: RED }}>↓ {shorts} short</span>
            <span className="text-zinc-700">·</span>
            <span>{queried.slice(0, 6)}…{queried.slice(-4)}</span>
          </div>
        </>
      )}

      {/* Trade list */}
      {filtered.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {filtered.map((t, i) => {
            const pnl    = Number(t.closedPnl)
            const isLong = t.side === "B"
            const isLiq  = t.hash === "0x0000000000000000000000000000000000000000000000000000000000000000"
            const px     = Number(t.px)
            const sz     = Number(t.sz)
            const notional = px * sz

            return (
              <div key={t.tid ?? i}
                className="bg-white/3 border border-white/6 rounded-xl px-4 py-3 hover:border-white/12 transition-all">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black">{t.coin}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isLong ? "bg-[#32D695]/15 text-[#32D695]" : "bg-[#FF4C61]/15 text-[#FF4C61]"
                    }`}>
                      {isLong ? "LONG" : "SHORT"}
                    </span>
                    {isLiq && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">LIQ</span>
                    )}
                    <span className="text-[10px] text-zinc-600">{t.dir}</span>
                  </div>
                  <div className={`text-sm font-black ${pnl > 0 ? "text-[#32D695]" : pnl < 0 ? "text-[#FF4C61]" : "text-zinc-500"}`}>
                    {pnl !== 0 ? `${pnl > 0 ? "+" : ""}$${fmt(Math.abs(pnl))}` : "—"}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <div className="flex gap-3">
                    <span><span className="text-zinc-600">px </span>${px >= 1000 ? fmt(px, 1) : fmt(px)}</span>
                    <span><span className="text-zinc-600">sz </span>{sz}</span>
                    <span><span className="text-zinc-600">val </span>${fmt(notional, 0)}</span>
                    <span><span className="text-zinc-600">fee </span>${fmt(Number(t.fee))}</span>
                  </div>
                  <span className="text-zinc-600" title={utcDate(t.time)}>{timeAgo(t.time)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && queried && filtered.length === 0 && !error && (
        <div className="text-center text-zinc-600 text-sm mt-12">No trades found for this period</div>
      )}

      {!queried && !loading && (
        <div className="text-center text-zinc-700 text-sm mt-16">Enter a wallet address to view trade history</div>
      )}

    </main>
  )
}
