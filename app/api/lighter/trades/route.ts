import { NextRequest, NextResponse } from "next/server"

const BASE = "https://mainnet.zklighter.elliot.ai/api/v1"

export async function POST(req: NextRequest) {
  try {
    const { read_only_token, limit = 100, sort_dir = "desc", market_id, cursor } = await req.json()
    if (!read_only_token) return NextResponse.json({ detail: "Missing token" }, { status: 400 })

    const parts = read_only_token.split(":")
    if (parts.length < 2 || parts[0] !== "ro") {
      return NextResponse.json({ detail: "Invalid token format (expected ro:...)" }, { status: 400 })
    }
    const accountIndex = parseInt(parts[1])

    const params = new URLSearchParams({
      sort_by:       "timestamp",
      limit:         String(Math.min(limit, 100)),
      sort_dir:      sort_dir,
      account_index: String(accountIndex),
    })
    if (market_id != null) params.set("market_id", String(market_id))
    if (cursor)            params.set("cursor", cursor)

    const res = await fetch(`${BASE}/trades?${params}`, {
      headers: { Authorization: read_only_token },
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    if (data.code !== 200) return NextResponse.json({ detail: data.message }, { status: 400 })

    const rawTrades = data.trades ?? []

    // Enrich: determine user's side + correct PnL
    const enriched = rawTrades.map((t: any) => {
      const isAsk   = t.ask_account_id === accountIndex
      const side    = isAsk ? "sell" : "buy"
      const pnl     = isAsk ? parseFloat(t.ask_account_pnl ?? 0) : parseFloat(t.bid_account_pnl ?? 0)
      const isMaker = isAsk ? !!t.is_maker_ask : !t.is_maker_ask
      const fee     = parseFloat(isMaker ? (t.maker_fee ?? 0) : (t.taker_fee ?? 0))

      return {
        trade_id:   t.trade_id,
        market_id:  t.market_id,
        side,
        is_ask:     isAsk,
        price:      parseFloat(t.price ?? 0),
        size:       parseFloat(t.size ?? 0),
        usd_amount: parseFloat(t.usd_amount ?? 0),
        pnl,
        fee,
        timestamp:  t.timestamp,   // unix seconds
        type:       t.type,
      }
    })

    return NextResponse.json({ trades: enriched, next_cursor: data.next_cursor ?? null })
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 500 })
  }
}
