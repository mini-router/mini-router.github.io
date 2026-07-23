// Score-by-model chart (grouped bar, faceted by benchmark) plus an
// admin-only cost-vs-score scatter. Hand-rolled SVG, no charting library --
// see dataviz skill notes in the PR description for the palette/mark specs
// this follows.

export interface ProviderBenchmarkPoint {
  id: number
  route: string
  benchmark: string
  score: number | null
  cost_usd: number | null
  duration_seconds: number | null
}

// Validated dark-mode categorical palette (8 slots, fixed order -- never
// reassigned by rank/filter). Passes CVD + contrast checks against both
// admin (#020617) and web (#060b14) dark surfaces.
const ROUTE_PALETTE = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
]

function buildRouteColors(points: ProviderBenchmarkPoint[]): Map<string, string> {
  const routes = Array.from(new Set(points.map((p) => p.route))).sort()
  const map = new Map<string, string>()
  routes.forEach((route, idx) => {
    map.set(route, ROUTE_PALETTE[idx % ROUTE_PALETTE.length])
  })
  return map
}

function fmtPercent(value: number | null): string {
  return value == null || Number.isNaN(value) ? '—' : `${(value * 100).toFixed(1)}%`
}

function fmtCost(value: number | null): string {
  return value == null || Number.isNaN(value) ? '—' : `$${value.toFixed(3)}`
}

const FACET_WIDTH = 420
const FACET_HEIGHT = 220
const PLOT_TOP = 16
const PLOT_BOTTOM = 36
const BAR_GAP = 6

export function ScoreByModelChart({ points }: { points: ProviderBenchmarkPoint[] }) {
  const scored = points.filter((p) => p.score != null)
  if (!scored.length) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-slate-400">
        No scored provider evaluations yet.
      </div>
    )
  }

  const routeColors = buildRouteColors(scored)
  const benchmarks = Array.from(new Set(scored.map((p) => p.benchmark))).sort()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {Array.from(routeColors.entries()).map(([route, color]) => (
          <div key={route} className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {route}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {benchmarks.map((benchmark) => {
          const rows = scored
            .filter((p) => p.benchmark === benchmark)
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          const plotHeight = FACET_HEIGHT - PLOT_TOP - PLOT_BOTTOM
          const barWidth = Math.max(28, (FACET_WIDTH - BAR_GAP * (rows.length - 1)) / rows.length - 4)

          return (
            <div key={benchmark} className="rounded-lg border border-white/8 bg-white/3 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                {benchmark}
              </div>
              <svg
                viewBox={`0 0 ${FACET_WIDTH} ${FACET_HEIGHT}`}
                width={FACET_WIDTH}
                height={FACET_HEIGHT}
                role="img"
                aria-label={`Score by model for ${benchmark}`}
              >
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                  const y = PLOT_TOP + plotHeight * (1 - frac)
                  return (
                    <line
                      key={frac}
                      x1={0}
                      x2={FACET_WIDTH}
                      y1={y}
                      y2={y}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth={1}
                    />
                  )
                })}
                {rows.map((row, idx) => {
                  const score = row.score ?? 0
                  const barHeight = plotHeight * Math.max(0, Math.min(1, score))
                  const x = idx * (barWidth + BAR_GAP)
                  const y = PLOT_TOP + (plotHeight - barHeight)
                  const color = routeColors.get(row.route) ?? ROUTE_PALETTE[0]
                  return (
                    <g key={`${row.id}-${row.route}`}>
                      <title>
                        {row.route} — {benchmark}: {fmtPercent(row.score)} (eval #{row.id})
                      </title>
                      <rect x={x} y={y} width={barWidth} height={Math.max(1, barHeight)} rx={4} fill={color} />
                      <text
                        x={x + barWidth / 2}
                        y={y - 6}
                        textAnchor="middle"
                        fontSize={11}
                        fill="#e2e8f0"
                      >
                        {fmtPercent(row.score)}
                      </text>
                      <text
                        x={x + barWidth / 2}
                        y={FACET_HEIGHT - PLOT_BOTTOM + 16}
                        textAnchor="middle"
                        fontSize={9}
                        fill="#94a3b8"
                      >
                        {row.route.length > 12 ? `${row.route.slice(0, 11)}…` : row.route}
                      </text>
                    </g>
                  )
                })}
                <line
                  x1={0}
                  x2={FACET_WIDTH}
                  y1={PLOT_TOP + plotHeight}
                  y2={PLOT_TOP + plotHeight}
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth={1}
                />
              </svg>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const SCATTER_WIDTH = 640
const SCATTER_HEIGHT = 320
const SCATTER_PAD_LEFT = 48
const SCATTER_PAD_BOTTOM = 32
const SCATTER_PAD_TOP = 16
const SCATTER_PAD_RIGHT = 16

// Cost-vs-score is a scatter (an all-pairs form), which caps categorical
// color at 3 series -- with up to 7+ models this would blow that cap, so
// identity here comes from direct text labels + marker shape (per
// benchmark), not from a per-model hue.
export function CostVsScoreChart({ points }: { points: ProviderBenchmarkPoint[] }) {
  const rows = points.filter((p) => p.score != null && p.cost_usd != null)
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-slate-400">
        No cost/score data yet.
      </div>
    )
  }

  const benchmarks = Array.from(new Set(rows.map((p) => p.benchmark))).sort()
  // Cost typically spans multiple orders of magnitude (a cheap model at
  // $0.01 next to an expensive one at $0.78), which crushes everything
  // cheap into one unreadable cluster on a linear axis -- log scale spreads
  // it out. Floor at a small epsilon so a $0 run still has a position.
  const costs = rows.map((p) => Math.max(p.cost_usd ?? 0, 0.001))
  const minLog = Math.log10(Math.min(...costs))
  const maxLog = Math.log10(Math.max(...costs, 0.01))
  const logSpan = Math.max(maxLog - minLog, 0.5)
  const plotWidth = SCATTER_WIDTH - SCATTER_PAD_LEFT - SCATTER_PAD_RIGHT
  const plotHeight = SCATTER_HEIGHT - SCATTER_PAD_TOP - SCATTER_PAD_BOTTOM

  const xFor = (cost: number) => {
    const frac = (Math.log10(Math.max(cost, 0.001)) - minLog) / logSpan
    return SCATTER_PAD_LEFT + Math.max(0, Math.min(1, frac)) * plotWidth
  }
  const yFor = (score: number) => SCATTER_PAD_TOP + plotHeight * (1 - Math.max(0, Math.min(1, score)))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-300">
        {benchmarks.map((benchmark, idx) => (
          <div key={benchmark} className="flex items-center gap-1.5">
            {idx % 2 === 0 ? (
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
            ) : (
              <span className="h-2.5 w-2.5 bg-sky-400" />
            )}
            {benchmark}
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-white/8 bg-white/3 p-3">
        <svg
          viewBox={`0 0 ${SCATTER_WIDTH} ${SCATTER_HEIGHT}`}
          width="100%"
          height={SCATTER_HEIGHT}
          role="img"
          aria-label="Cost vs score by provider route"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = SCATTER_PAD_TOP + plotHeight * (1 - frac)
            return (
              <g key={frac}>
                <line
                  x1={SCATTER_PAD_LEFT}
                  x2={SCATTER_WIDTH - SCATTER_PAD_RIGHT}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={1}
                />
                <text x={SCATTER_PAD_LEFT - 8} y={y + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
                  {Math.round(frac * 100)}%
                </text>
              </g>
            )
          })}
          <line
            x1={SCATTER_PAD_LEFT}
            x2={SCATTER_WIDTH - SCATTER_PAD_RIGHT}
            y1={SCATTER_PAD_TOP + plotHeight}
            y2={SCATTER_PAD_TOP + plotHeight}
            stroke="rgba(255,255,255,0.16)"
            strokeWidth={1}
          />
          {[0, 1 / 3, 2 / 3, 1].map((frac) => {
            const cost = 10 ** (minLog + frac * logSpan)
            const x = SCATTER_PAD_LEFT + frac * plotWidth
            return (
              <text
                key={frac}
                x={x}
                y={SCATTER_PAD_TOP + plotHeight + 16}
                textAnchor="middle"
                fontSize={9}
                fill="#94a3b8"
              >
                {fmtCost(cost)}
              </text>
            )
          })}
          {[...rows]
            .sort((a, b) => (a.cost_usd ?? 0) - (b.cost_usd ?? 0))
            .map((row, idx) => {
              const cx = xFor(row.cost_usd ?? 0)
              const cy = yFor(row.score ?? 0)
              const benchmarkIdx = benchmarks.indexOf(row.benchmark)
              const labelY = idx % 2 === 0 ? cy - 9 : cy + 15
              return (
                <g key={`${row.id}-${row.route}`}>
                  <title>
                    {row.route} — {row.benchmark}: {fmtPercent(row.score)} at {fmtCost(row.cost_usd)}
                    {row.duration_seconds != null ? `, ${row.duration_seconds.toFixed(0)}s` : ''}
                  </title>
                  {benchmarkIdx % 2 === 0 ? (
                    <circle cx={cx} cy={cy} r={6} fill="#38bdf8" fillOpacity={0.85} />
                  ) : (
                    <rect x={cx - 5} y={cy - 5} width={10} height={10} fill="#38bdf8" fillOpacity={0.85} />
                  )}
                  <text x={cx + 9} y={labelY} fontSize={9} fill="#cbd5e1">
                    {row.route}
                  </text>
                </g>
              )
            })}
          <text
            x={SCATTER_PAD_LEFT + plotWidth / 2}
            y={SCATTER_HEIGHT - 6}
            textAnchor="middle"
            fontSize={10}
            fill="#94a3b8"
          >
            Cost (USD, log scale)
          </text>
        </svg>
      </div>
    </div>
  )
}
