"use client"

import { useState, useRef, useMemo } from "react"
import { EquityCurve } from "./components/EquityCurve"

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

type Position = {
  coin: string
  side: "long" | "short"
  openPx: number
  closePx: number | null   // null = still open
  openTime: number
  closeTime: number | null
  sz: number
  fees: number
  pnl: number
  open: boolean
}

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
function duration(ms: number) {
  const s = Math.floor(ms / 1000)
  if (s < 60)    return `${s}s`
  if (s < 3600)  return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

// Aggregate fills → positions using open/close dir fields
function aggregateFills(fills: Fill[]): Position[] {
  const sorted = [...fills].sort((a, b) => a.time - b.time)

  type OpenPos = {
    side: "long" | "short"
    openTime: number
    totalSz: number
    weightedPx: number  // VWAP of open fills
    fees: number
  }

  const openMap = new Map<string, OpenPos>()
  const positions: Position[] = []

  for (const f of sorted) {
    const isLong  = f.side === "B"
    const dirLow  = f.dir.toLowerCase()
    const isOpen  = dirLow.includes("open")
    const isClose = dirLow.includes("close")
    const sz      = Number(f.sz)
    const px      = Number(f.px)
    const fee     = Number(f.fee)
    const pnl     = Number(f.closedPnl)

    // Use coin + side as key so longs and shorts tracked separately
    const key = `${f.coin}::${isLong ? "long" : "short"}`

    if (isOpen) {
      if (!openMap.has(key)) {
        openMap.set(key, { side: isLong ? "long" : "short", openTime: f.time, totalSz: 0, weightedPx: 0, fees: 0 })
      }
      const pos = openMap.get(key)!
      const newSz   = pos.totalSz + sz
      pos.weightedPx = (pos.weightedPx * pos.totalSz + px * sz) / newSz
      pos.totalSz    = newSz
      pos.fees      += fee
    } else if (isClose) {
      // Determine which side is closing (opposite side from fill direction)
      const closeKey = `${f.coin}::${isLong ? "short" : "long"}` // closing a short uses Buy fills
      const pos = openMap.get(closeKey)

      positions.push({
        coin:      f.coin,
        side:      pos?.side ?? (isLong ? "short" : "long"),
        openPx:    pos?.weightedPx ?? 0,
        closePx:   px,
        openTime:  pos?.openTime ?? f.time,
        closeTime: f.time,
        sz,
        fees:      (pos?.fees ?? 0) + fee,
        pnl,
        open:      false,
      })

      if (pos) {
        pos.totalSz -= sz
        pos.fees     = 0
        if (pos.totalSz < 0.00001) openMap.delete(closeKey)
      }
    } else {
      // No dir info — treat as standalone fill (spot or unknown)
      positions.push({
        coin: f.coin, side: isLong ? "long" : "short",
        openPx: px, closePx: null,
        openTime: f.time, closeTime: null,
        sz, fees: fee, pnl,
        open: true,
      })
    }
  }

  // Remaining open positions
  for (const [key, pos] of openMap) {
    const coin = key.split("::")[0]
    positions.push({
      coin, side: pos.side,
      openPx: pos.weightedPx, closePx: null,
      openTime: pos.openTime, closeTime: null,
      sz: pos.totalSz, fees: pos.fees, pnl: 0,
      open: true,
    })
  }

  return positions.sort((a, b) => (b.closeTime ?? b.openTime) - (a.closeTime ?? a.openTime))
}

export default function Home() {
  const [address, setAddress] = useState("")
  const [trades, setTrades]   = useState<Fill[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [queried, setQueried] = useState("")
  const [filter, setFilter]   = useState("all")
  const [view, setView]       = useState<"fills" | "positions">("positions")
  const inputRef = useRef<HTMLInputElement>(null)

  const PERIODS = [
    { label: "24h", ms: 86400_000 },
    { label: "7d",  ms: 604800_000 },
    { label: "30d", ms: 2592000_000 },
    { label: "90d", ms: 7776000_000 },
  ]
  const [period, setPeriod] = useState(PERIODS[1])

  async function fetchTrades(addr: string, p = period) {
    if (!addr.trim()) return
    setLoading(true)
    setError(null)
    setTrades([])
    try {
      const start = Date.now() - p.ms
      const res   = await fetch(`/api/trades?address=${addr.trim()}&startTime=${start}`)
      const data  = await res.json()
      if (!Array.isArray(data)) { setError(data?.error || "No trades found or invalid address"); return }
      setTrades(data.sort((a: Fill, b: Fill) => b.time - a.time))
      setQueried(addr.trim())
    } catch { setError("Request failed") }
    finally   { setLoading(false) }
  }

  const positions = aggregateFills(trades)
  const coins     = ["all", ...Array.from(new Set(trades.map(t => t.coin))).sort()]

  const filteredFills = trades.filter(t => filter === "all" || t.coin === filter)
  const filteredPos   = positions.filter(p => filter === "all" || p.coin === filter)

  // Stats (from positions for accuracy, fills for count)
  const closedPos  = filteredPos.filter(p => !p.open)
  const totalPnl   = closedPos.reduce((s, p) => s + p.pnl, 0)
  const totalFees  = filteredPos.reduce((s, p) => s + p.fees, 0)
  const winners    = closedPos.filter(p => p.pnl > 0).length
  const winRate    = closedPos.length ? (winners / closedPos.length * 100).toFixed(1) : "—"
  const openCount  = filteredPos.filter(p => p.open).length

  // Equity curve: cumulative PnL over close time
  const equityPoints = useMemo(() => {
    const sorted = closedPos
      .filter(p => p.closeTime !== null)
      .sort((a, b) => a.closeTime! - b.closeTime!)
    let cum = 0
    return sorted.map(p => { cum += p.pnl; return { time: p.closeTime!, value: Number(cum.toFixed(2)) } })
  }, [closedPos])

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
        <button onClick={() => fetchTrades(address)} disabled={loading}
          className="px-5 py-3 rounded-xl text-sm font-bold bg-white/8 border border-white/10 hover:border-white/25 transition-all disabled:opacity-40">
          {loading ? "…" : "Go"}
        </button>
      </div>

      {/* Period + view toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button key={p.label}
              onClick={() => { setPeriod(p); if (queried) fetchTrades(queried, p) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                period.label === p.label ? "border-white/30 text-white bg-white/8" : "border-white/8 text-zinc-500"
              }`}>{p.label}</button>
          ))}
        </div>
        <div className="flex gap-1 bg-white/5 border border-white/8 rounded-lg p-0.5">
          {(["positions", "fills"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                view === v ? "bg-white/10 text-white" : "text-zinc-600"
              }`}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
      </div>

      {error && <div className="text-sm text-[#FF4C61] mb-4 px-1">{error}</div>}

      {/* Stats */}
      {trades.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: "PnL",    value: `${totalPnl >= 0 ? "+" : ""}$${fmt(totalPnl)}`, color: totalPnl >= 0 ? GREEN : RED },
              { label: "Fees",   value: `-$${fmt(totalFees)}`,                           color: "#888" },
              { label: "Win %",  value: `${winRate}%`,                                  color: PURPLE },
              { label: openCount ? `${openCount} Open` : "Trades",
                value: openCount ? `${closedPos.length} closed` : `${closedPos.length}`, color: "#888" },
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
              <button key={c} onClick={() => setFilter(c)}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                  filter === c ? "border-white/30 text-white bg-white/8" : "border-white/8 text-zinc-500"
                }`}>{c.toUpperCase()}</button>
            ))}
          </div>

          <div className="text-[11px] text-zinc-600 mb-3 px-1">
            {queried.slice(0, 6)}…{queried.slice(-4)} · {period.label}
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
              <div className="h-36">
                <EquityCurve points={equityPoints} />
              </div>
            </div>
          )}
        </>
      )}

      {/* POSITIONS VIEW */}
      {view === "positions" && filteredPos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {filteredPos.map((pos, i) => {
            const isLong = pos.side === "long"
            const pnlColor = pos.open ? "#888" : pos.pnl > 0 ? GREEN : pos.pnl < 0 ? RED : "#888"
            const dur = pos.closeTime ? duration(pos.closeTime - pos.openTime) : null

            return (
              <div key={i} className={`bg-white/3 border rounded-xl px-4 py-3 transition-all hover:border-white/12 ${
                pos.open ? "border-[#a78bfa]/20" : "border-white/6"
              }`}>
                {/* Top row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black">{pos.coin}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isLong ? "bg-[#32D695]/15 text-[#32D695]" : "bg-[#FF4C61]/15 text-[#FF4C61]"
                    }`}>{isLong ? "LONG" : "SHORT"}</span>
                    {pos.open && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#a78bfa]/15 text-[#a78bfa]">OPEN</span>
                    )}
                    {dur && <span className="text-[10px] text-zinc-600">{dur}</span>}
                  </div>
                  <div className="text-sm font-black" style={{ color: pnlColor }}>
                    {pos.open ? "—" : `${pos.pnl > 0 ? "+" : ""}$${fmt(Math.abs(pos.pnl))}`}
                  </div>
                </div>

                {/* Price row */}
                <div className="flex items-center gap-1 mb-2">
                  <div className="flex-1 bg-white/4 rounded-lg px-3 py-2">
                    <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Open</div>
                    <div className="text-xs font-bold text-white">${fmtPx(pos.openPx)}</div>
                    <div className="text-[9px] text-zinc-600 mt-0.5">{utcDate(pos.openTime)}</div>
                  </div>
                  <div className="text-zinc-700 text-xs px-1">→</div>
                  <div className="flex-1 bg-white/4 rounded-lg px-3 py-2">
                    <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Close</div>
                    {pos.closePx !== null ? (
                      <>
                        <div className="text-xs font-bold text-white">${fmtPx(pos.closePx)}</div>
                        <div className="text-[9px] text-zinc-600 mt-0.5">{utcDate(pos.closeTime!)}</div>
                      </>
                    ) : (
                      <div className="text-xs text-zinc-600">—</div>
                    )}
                  </div>
                </div>

                {/* Bottom row */}
                <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                  <span><span className="text-zinc-600">sz </span>{pos.sz}</span>
                  <span><span className="text-zinc-600">val </span>${fmt(pos.sz * pos.openPx, 0)}</span>
                  <span><span className="text-zinc-600">fee </span>-${fmt(pos.fees)}</span>
                  {pos.closePx && (
                    <span style={{ color: pnlColor }}>
                      net {pos.pnl - pos.fees >= 0 ? "+" : ""}${fmt(pos.pnl - pos.fees)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* FILLS VIEW */}
      {view === "fills" && filteredFills.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {filteredFills.map((t, i) => {
            const pnl    = Number(t.closedPnl)
            const isLong = t.side === "B"
            const isLiq  = t.hash === "0x0000000000000000000000000000000000000000000000000000000000000000"
            const px     = Number(t.px)
            const sz     = Number(t.sz)

            return (
              <div key={t.tid ?? i}
                className="bg-white/3 border border-white/6 rounded-xl px-4 py-3 hover:border-white/12 transition-all">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black">{t.coin}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isLong ? "bg-[#32D695]/15 text-[#32D695]" : "bg-[#FF4C61]/15 text-[#FF4C61]"
                    }`}>{isLong ? "BUY" : "SELL"}</span>
                    {isLiq && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">LIQ</span>}
                    <span className="text-[10px] text-zinc-600">{t.dir}</span>
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
                    <span><span className="text-zinc-600">fee </span>${fmt(Number(t.fee))}</span>
                  </div>
                  <span className="text-zinc-600" title={utcDate(t.time)}>{timeAgo(t.time)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && queried && filteredFills.length === 0 && !error && (
        <div className="text-center text-zinc-600 text-sm mt-12">No trades found for this period</div>
      )}
      {!queried && !loading && (
        <div className="text-center text-zinc-700 text-sm mt-16">Enter a wallet address to view trade history</div>
      )}
    </main>
  )
}
