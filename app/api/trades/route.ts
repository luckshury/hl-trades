import { NextRequest, NextResponse } from "next/server"

const HL_API = "https://api.hyperliquid.xyz/info"

export async function GET(req: NextRequest) {
  const address   = req.nextUrl.searchParams.get("address")
  const startTime = req.nextUrl.searchParams.get("startTime")

  if (!address) return NextResponse.json({ error: "No address" }, { status: 400 })

  const body = {
    type: "userFillsByTime",
    user: address,
    startTime: startTime ? Number(startTime) : Date.now() - 30 * 24 * 60 * 60 * 1000, // default 30d
    aggregateByTime: false,
  }

  try {
    const res  = await fetch(HL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 })
  }
}
