"use client"

import { useState, useEffect, useMemo } from "react"
import { EquityCurve } from "./EquityCurve"

const PROXY  = ""  // uses relative Next.js API routes (/api/lighter/...)
const GREEN  = "#32D695"
const RED    = "#FF4C61"
const PURPLE = "#a78bfa"
const GOLD   = "#f59e0b"

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

type AccountInfo = {
  account_index: number
  l1_address: string
  account_type: number  // 0=trading, 1=public pool LP
  available_balance: number
  collateral: number
  total_asset_value: number
  positions: any[]
  shares: any[]
}

type LighterTrade = {
  trade_id?: string | number
  market_id?: number
  side?: string
  is_ask?: boolean
  size?: number
  price?: number
  usd_amount?: number
  pnl?: number
  fee?: number
  timestamp?: number
  type?: string
}

const PERIODS = [
  { label: "7d",  ms: 604800_000 },
  { label: "30d", ms: 2592000_000 },
  { label: "90d", ms: 7776000_000 },
  { label: "All", ms: 9999999_000 },
]

const ACCOUNT_TYPE_LABEL: Record<number, string> = {
  0: "Trading",
  1: "Public Pool (LP)",
}

export function LighterTab() {
  const [token,   setToken]   = useState("")
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [trades,  setTrades]  = useState<LighterTrade[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [period,  setPeriod]  = useState(PERIODS[0])
  const [filter,  setFilter]  = useState("all")

  // Persist token in localStorage
  useEffect(() => {
    const saved = localStorage.getItem("lighter_ro_token")
    if (saved) setToken(saved)
  }, [])

  async function load(tkn = token, p = period) {
    if (!tkn.trim()) return
    localStorage.setItem("lighter_ro_token", tkn.trim())
    setLoading(true)
    setError(null)

    try {
      // Fetch balance + trades in parallel
      const [balRes, tradeRes] = await Promise.all([
        fetch(`/api/lighter/balance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read_only_token: tkn.trim() }),
        }),
        fetch(`/api/lighter/trades`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read_only_token: tkn.trim(), limit: 100, sort_dir: "desc" }),
        }),
      ])

      const balData   = await balRes.json()
      const tradeData = await tradeRes.json()

      if (balData.detail)   throw new Error(balData.detail)
      if (tradeData.detail) throw new Error(tradeData.detail)

      setAccount(balData)

      // Filter by period (Lighter timestamps are unix seconds)
      const cutoffSec = (Date.now() - p.ms) / 1000
      const list: LighterTrade[] = Array.isArray(tradeData?.trades) ? tradeData.trades : []
      setTrades(list.filter(t => Number(t.timestamp || 0) >= cutoffSec))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const symbols  = ["all", ...Array.from(new Set(trades.map(t => `M${t.market_id}`).filter(Boolean))).sort()]
  const filtered = trades.filter(t => filter === "all" || `M${t.market_id}` === filter)

  const totalPnl  = filtered.reduce((s, t) => s + Number(t.pnl || 0), 0)
  const totalFees = filtered.reduce((s, t) => s + Number(t.fee || 0), 0)
  const winners   = filtered.filter(t => Number(t.pnl || 0) > 0).length
  const winRate   = filtered.length ? (winners / filtered.length * 100).toFixed(1) : "—"

  const equityPoints = useMemo(() => {
    let cum = 0
    return [...filtered]
      .filter(t => t.pnl !== undefined)
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      .map(t => {
        cum += Number(t.pnl || 0)
        return { time: Number(t.timestamp) * 1000, value: Number(cum.toFixed(2)) }
      })
  }, [filtered])

  return (
    <div>
      {/* Token input */}
      <div className="mb-4 bg-white/3 border border-white/8 rounded-xl p-4">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-3">Read-Only Token</div>
        <div className="flex gap-2">
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            type="password"
            placeholder="ro:…  (from Lighter → Account → API Tokens)"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-white/25 font-mono"
          />
          <button
            onClick={() => load()}
            disabled={loading || !token.trim()}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-white/8 border border-white/10 hover:border-white/25 transition-all disabled:opacity-40"
          >
            {loading ? "…" : "Load"}
          </button>
        </div>
        <div className="text-[10px] text-zinc-600 mt-2">
          Token stored in localStorage only · never sent server-side
        </div>
      </div>

      {error && <div className="text-sm text-[#FF4C61] mb-4">{error}</div>}

      {/* Account balance card */}
      {account && (
        <div className="mb-4 bg-white/4 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">
                {ACCOUNT_TYPE_LABEL[account.account_type] ?? `Type ${account.account_type}`}
              </div>
              <div className="text-2xl font-black text-white">
                ${fmt(account.total_asset_value)}
                <span className="text-sm text-zinc-500 font-normal ml-1">USDC</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-zinc-600 mb-1">Available</div>
              <div className="text-sm font-bold text-[#32D695]">${fmt(account.available_balance)}</div>
            </div>
          </div>
          <div className="text-[10px] text-zinc-600 font-mono truncate">
            {account.l1_address}
          </div>
          {account.account_type === 1 && (
            <div className="mt-3 bg-[#f59e0b]/10 border border-[#f59e0b]/20 rounded-lg px-3 py-2 text-[11px] text-[#f59e0b]">
              💡 LP position — earning yield on the Lighter public pool
            </div>
          )}
        </div>
      )}

      {/* Trades section */}
      {account && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Trade History</div>
            <div className="flex gap-1.5">
              {PERIODS.map(p => (
                <button key={p.label}
                  onClick={() => { setPeriod(p); load(token, p) }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                    period.label === p.label ? "border-white/30 text-white bg-white/8" : "border-white/8 text-zinc-500"
                  }`}>{p.label}</button>
              ))}
            </div>
          </div>

          {filtered.length > 0 ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { label: "PnL",    value: `${totalPnl >= 0 ? "+" : ""}$${fmt(totalPnl)}`, color: totalPnl >= 0 ? GREEN : RED },
                  { label: "Fees",   value: `-$${fmt(totalFees)}`,                           color: "#888" },
                  { label: "Win %",  value: `${winRate}%`,                                  color: PURPLE },
                  { label: "Trades", value: `${filtered.length}`,                            color: "#888" },
                ].map(s => (
                  <div key={s.label} className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                    <div className="text-[10px] text-zinc-600 mb-1 uppercase tracking-wider">{s.label}</div>
                    <div className="text-sm font-black" style={{ color: s.color }}>{s.value}</div>
                  </div>
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

              {/* Symbol filter */}
              {symbols.length > 2 && (
                <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
                  {symbols.map(c => (
                    <button key={c} onClick={() => setFilter(c)}
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                        filter === c ? "border-white/30 text-white bg-white/8" : "border-white/8 text-zinc-500"
                      }`}>{c.toUpperCase()}</button>
                  ))}
                </div>
              )}

              {/* Trade list */}
              <div className="flex flex-col gap-1.5">
                {filtered.map((t, i) => {
                  const pnl = Number(t.pnl || 0)
                  const ms  = Number(t.timestamp || 0) * 1000
                  return (
                    <div key={t.trade_id ?? i} className="bg-white/3 border border-white/6 rounded-xl px-4 py-3 hover:border-white/12 transition-all">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black">M{t.market_id}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            t.side === "buy" ? "bg-[#32D695]/15 text-[#32D695]" : "bg-[#FF4C61]/15 text-[#FF4C61]"
                          }`}>{t.side?.toUpperCase()}</span>
                          {t.type && <span className="text-[10px] text-zinc-600">{t.type}</span>}
                        </div>
                        <div className={`text-sm font-black ${pnl > 0 ? "text-[#32D695]" : pnl < 0 ? "text-[#FF4C61]" : "text-zinc-500"}`}>
                          {pnl !== 0 ? `${pnl > 0 ? "+" : ""}$${fmt(Math.abs(pnl))}` : "—"}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <div className="flex gap-3">
                          <span><span className="text-zinc-600">px </span>${fmtPx(Number(t.price))}</span>
                          <span><span className="text-zinc-600">sz </span>{t.size}</span>
                          <span><span className="text-zinc-600">val </span>${fmt(Number(t.usd_amount || 0), 0)}</span>
                          {Number(t.fee) > 0 && <span><span className="text-zinc-600">fee </span>${fmt(Number(t.fee))}</span>}
                        </div>
                        <span className="text-zinc-600" title={utcDate(ms)}>{timeAgo(ms)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="text-center text-zinc-600 text-sm mt-8 py-8 bg-white/2 rounded-xl border border-white/6">
              {account.account_type === 1
                ? "LP accounts don't execute perp trades — your yield accumulates automatically 🌱"
                : "No trades found for this period"}
            </div>
          )}
        </>
      )}
    </div>
  )
}
