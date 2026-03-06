"use client"

import { useEffect, useRef } from "react"
import { createChart, ColorType, LineSeries, AreaSeries, CrosshairMode } from "lightweight-charts"

type Props = {
  points: { time: number; value: number }[]  // time = unix ms, value = cumulative pnl
}

export function EquityCurve({ points }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || points.length < 2) return
    ref.current.innerHTML = ""

    const isPositive = points[points.length - 1].value >= 0
    const lineColor  = isPositive ? "#32D695" : "#FF4C61"
    const topColor   = isPositive ? "rgba(50,214,149,0.15)" : "rgba(255,76,97,0.15)"

    const chart = createChart(ref.current, {
      width:  ref.current.clientWidth,
      height: ref.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#555",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: { mode: CrosshairMode.Magnet },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        minimumWidth: 60,
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    })

    // Convert ms → seconds for lightweight-charts
    const data = points.map(p => ({ time: Math.floor(p.time / 1000) as any, value: p.value }))

    const area = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor: "rgba(0,0,0,0)",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    })
    area.setData(data)

    // Zero line
    const zero = chart.addSeries(LineSeries, {
      color: "rgba(255,255,255,0.12)",
      lineWidth: 1,
      lineStyle: 2, // dashed
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    zero.setData(data.map(d => ({ time: d.time, value: 0 })))

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight })
    })
    ro.observe(ref.current)

    return () => { chart.remove(); ro.disconnect() }
  }, [points])

  if (points.length < 2) return null

  return <div ref={ref} className="w-full h-full" />
}
