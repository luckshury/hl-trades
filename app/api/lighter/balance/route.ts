import { NextRequest, NextResponse } from "next/server"

const BASE = "https://mainnet.zklighter.elliot.ai/api/v1"

export async function POST(req: NextRequest) {
  try {
    const { read_only_token } = await req.json()
    if (!read_only_token) return NextResponse.json({ detail: "Missing token" }, { status: 400 })

    const parts = read_only_token.split(":")
    if (parts.length < 2 || parts[0] !== "ro") {
      return NextResponse.json({ detail: "Invalid token format (expected ro:...)" }, { status: 400 })
    }
    const accountIndex = parts[1]

    const res = await fetch(`${BASE}/account?by=index&value=${accountIndex}`, {
      headers: { Authorization: read_only_token },
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    if (data.code !== 200) return NextResponse.json({ detail: data.message }, { status: 400 })

    const a = data.accounts?.[0]
    if (!a) return NextResponse.json({ detail: "Account not found" }, { status: 404 })

    return NextResponse.json({
      account_index:     a.account_index,
      l1_address:        a.l1_address,
      account_type:      a.account_type,
      available_balance: parseFloat(a.available_balance || "0"),
      collateral:        parseFloat(a.collateral || "0"),
      total_asset_value: parseFloat(a.total_asset_value || "0"),
      positions:         a.positions ?? [],
      shares:            a.shares ?? [],
    })
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 500 })
  }
}
