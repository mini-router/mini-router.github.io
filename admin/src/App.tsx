import {
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CircleAlert,
  ClipboardList,
  Database,
  FileUp,
  Gauge,
  LoaderCircle,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Wrench,
} from 'lucide-react'
import {
  API_BASE_URL,
  createTrainJob,
  fetchEvaluation,
  fetchHealth,
  fetchLeaderboard,
  fetchSubmission,
  resetApiBaseUrl,
  setApiBaseUrl,
  submitCheckpoint,
} from './lib/api'
import type { BackendEvaluationOut, BackendSubmissionOut, BackendTrainOut } from './lib/api'
import type { LeaderboardEntry } from './types'

type StatusTone = 'ok' | 'warn' | 'bad' | 'idle'

const BENCHMARK_OPTIONS = ['math500', 'mmlu', 'gsm8k', 'humaneval', 'bbh', 'livecodebench']

const STORAGE_KEYS = {
  apiBase: 'minirouter.admin.apiBase',
  submissionId: 'minirouter.admin.submissionId',
  evaluationId: 'minirouter.admin.evaluationId',
  trainSubmissionId: 'minirouter.admin.trainSubmissionId',
  benchmarkNames: 'minirouter.admin.trainBenchmarks',
}

function fmtNum(value: number | null | undefined, digits = 2): string {
  return value == null || Number.isNaN(value) ? '—' : value.toFixed(digits)
}

function fmtPct(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '—' : `${(value * 100).toFixed(1)}%`
}

function fmtSeconds(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '—' : `${value.toFixed(1)}s`
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt)
}

function toneForStatus(status?: string | null): StatusTone {
  const normalized = (status || '').toLowerCase()
  if (['completed', 'ready', 'healthy', 'ok'].includes(normalized)) return 'ok'
  if (['queued', 'running', 'pending', 'awaiting_ci'].includes(normalized)) return 'warn'
  if (['failed', 'error', 'rejected'].includes(normalized)) return 'bad'
  return 'idle'
}

function statusClass(status?: string | null): string {
  const tone = toneForStatus(status)
  if (tone === 'ok') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
  if (tone === 'warn') return 'border-amber-400/30 bg-amber-400/10 text-amber-200'
  if (tone === 'bad') return 'border-rose-400/30 bg-rose-400/10 text-rose-200'
  return 'border-white/10 bg-white/5 text-slate-300'
}

function Section({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="page-band">
      <div className="section-shell">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="section-kicker">{eyebrow}</div>
            <h2 className="section-title mt-1">{title}</h2>
            {description ? <p className="section-copy mt-2">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {children}
      </div>
    </section>
  )
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'idle',
}: {
  label: string
  value: string
  hint?: string
  icon: ReactNode
  tone?: StatusTone
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="meta-label">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{value}</div>
          {hint ? <div className="mt-1 text-sm text-slate-400">{hint}</div> : null}
        </div>
        <div
          className={[
            'flex h-10 w-10 items-center justify-center rounded-lg border',
            tone === 'ok'
              ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
              : tone === 'warn'
                ? 'border-amber-400/20 bg-amber-400/10 text-amber-200'
                : tone === 'bad'
                  ? 'border-rose-400/20 bg-rose-400/10 text-rose-200'
                  : 'border-white/10 bg-white/5 text-slate-300',
          ].join(' ')}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  help,
}: {
  label: string
  children: ReactNode
  help?: string
}) {
  return (
    <label className="block">
      <div className="meta-label mb-2">{label}</div>
      {children}
      {help ? <div className="mt-2 text-xs text-slate-400">{help}</div> : null}
    </label>
  )
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        'w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none',
        'placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10',
        props.className || '',
      ].join(' ')}
    />
  )
}

function Button({
  children,
  variant = 'primary',
  icon,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet'
  icon?: ReactNode
}) {
  const cls =
    variant === 'primary'
      ? 'button-primary'
      : variant === 'secondary'
        ? 'button-secondary'
        : 'button-quiet'
  return (
    <button type={type} {...props} className={[cls, props.className || ''].join(' ')}>
      {icon ? <span className="mr-2">{icon}</span> : null}
      {children}
    </button>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="button-quiet text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      }}
      type="button"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function RunTable({
  label,
  runs,
}: {
  label: string
  runs: Array<BackendEvaluationOut | BackendTrainOut>
}) {
  if (!runs.length) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-slate-400">
        No {label.toLowerCase()} recorded yet.
      </div>
    )
  }

  return (
    <div className="table-shell">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3 font-medium">{label}</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Phase</th>
              <th className="px-4 py-3 font-medium">Progress</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={`${label}-${run.id}`} className="border-t border-white/8 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-mono text-xs text-slate-200">{run.id}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(run.status)}`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300">{run.phase || '—'}</td>
                <td className="px-4 py-3 text-slate-300">
                  {run.progress_current != null && run.progress_total != null
                    ? `${run.progress_current}/${run.progress_total}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {'score' in run ? fmtPct(run.score) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-300">{fmtNum(run.cost_usd)}</td>
                <td className="px-4 py-3 text-slate-300">{fmtSeconds(run.duration_seconds)}</td>
                <td className="px-4 py-3 text-slate-300">{fmtDate(run.started_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function App() {
  const initialBase =
    localStorage.getItem(STORAGE_KEYS.apiBase)?.trim() ||
    import.meta.env.VITE_API_BASE_URL?.trim() ||
    API_BASE_URL()
  const [apiBaseInput, setApiBaseInput] = useState(initialBase)
  const [healthStatus, setHealthStatus] = useState<string>('loading')
  const [healthError, setHealthError] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [submissionId, setSubmissionId] = useState(
    localStorage.getItem(STORAGE_KEYS.submissionId) || '',
  )
  const [submission, setSubmission] = useState<BackendSubmissionOut | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [submissionLoading, setSubmissionLoading] = useState(false)
  const [evaluationId, setEvaluationId] = useState(
    localStorage.getItem(STORAGE_KEYS.evaluationId) || '',
  )
  const [evaluation, setEvaluation] = useState<BackendEvaluationOut | null>(null)
  const [evaluationError, setEvaluationError] = useState<string | null>(null)
  const [evaluationLoading, setEvaluationLoading] = useState(false)
  const [trainSubmissionId, setTrainSubmissionId] = useState(
    localStorage.getItem(STORAGE_KEYS.trainSubmissionId) || '',
  )
  const [trainBenchmarks, setTrainBenchmarks] = useState(
    localStorage.getItem(STORAGE_KEYS.benchmarkNames) || 'math500',
  )
  const [warmstartArtifactId, setWarmstartArtifactId] = useState('')
  const [trainNote, setTrainNote] = useState<string | null>(null)
  const [trainLoading, setTrainLoading] = useState(false)
  const [checkpointFile, setCheckpointFile] = useState<File | null>(null)
  const [teamName, setTeamName] = useState('')
  const [submissionNote, setSubmissionNote] = useState<string | null>(null)
  const [submissionUploadLoading, setSubmissionUploadLoading] = useState(false)

  useEffect(() => {
    setApiBaseUrl(apiBaseInput)
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.submissionId, submissionId)
  }, [submissionId])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.evaluationId, evaluationId)
  }, [evaluationId])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.trainSubmissionId, trainSubmissionId)
  }, [trainSubmissionId])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.benchmarkNames, trainBenchmarks)
  }, [trainBenchmarks])

  const refreshDashboard = async () => {
    setLeaderboardLoading(true)
    setHealthError(null)
    setLeaderboardError(null)
    try {
      const [health, board] = await Promise.all([fetchHealth(), fetchLeaderboard(50)])
      setHealthStatus(health.status)
      setLeaderboard(board)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setHealthError(message)
      setHealthStatus('error')
      setLeaderboardError(message)
    } finally {
      setLeaderboardLoading(false)
    }
  }

  useEffect(() => {
    void refreshDashboard()
  }, [])

  const loadSubmission = async () => {
    const id = submissionId.trim()
    if (!id) return
    setSubmissionLoading(true)
    setSubmissionError(null)
    try {
      const data = await fetchSubmission(id)
      setSubmission(data)
    } catch (error) {
      setSubmission(null)
      setSubmissionError(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmissionLoading(false)
    }
  }

  const loadEvaluation = async () => {
    const id = evaluationId.trim()
    if (!id) return
    setEvaluationLoading(true)
    setEvaluationError(null)
    try {
      const data = await fetchEvaluation(id)
      setEvaluation(data)
    } catch (error) {
      setEvaluation(null)
      setEvaluationError(error instanceof Error ? error.message : String(error))
    } finally {
      setEvaluationLoading(false)
    }
  }

  const submitTrain = async () => {
    setTrainLoading(true)
    setTrainNote(null)
    try {
      const benchmark_names = trainBenchmarks
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      const result = await createTrainJob({
        benchmark_names,
        submission_id: trainSubmissionId.trim() || null,
        warmstart_artifact_id: warmstartArtifactId.trim() || null,
      })
      setTrainNote(`Queued train job #${result.train.id} (${result.train.status}).`)
      await refreshDashboard()
    } catch (error) {
      setTrainNote(error instanceof Error ? error.message : String(error))
    } finally {
      setTrainLoading(false)
    }
  }

  const uploadSubmission = async () => {
    if (!checkpointFile) {
      setSubmissionNote('Choose a checkpoint file first.')
      return
    }
    setSubmissionUploadLoading(true)
    setSubmissionNote(null)
    try {
      const result = await submitCheckpoint({
        file: checkpointFile,
        team_name: teamName.trim() || undefined,
      })
      setSubmissionNote(`Queued submission ${result.submission.id} (${result.submission.status}).`)
      setSubmissionId(result.submission.id)
      setSubmission(result.submission)
      await refreshDashboard()
    } catch (error) {
      setSubmissionNote(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmissionUploadLoading(false)
    }
  }

  const summary = useMemo(() => {
    const completed = leaderboard.filter((entry) => (entry.status || '').toLowerCase() === 'completed')
    const top = leaderboard[0]
    return {
      submissions: leaderboard.length,
      completed: completed.length,
      topTeam: top?.team || '—',
      topScore: fmtPct(top?.accuracy ?? null),
    }
  }, [leaderboard])

  return (
    <div className="min-h-screen text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-slate-950/75 backdrop-blur-xl">
        <div className="section-shell py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/mini-router.jpg"
                alt="MiniRouter"
                className="h-11 w-11 rounded-lg border border-white/10 object-cover"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight">
                    {import.meta.env.VITE_ADMIN_TITLE?.trim() || 'MiniRouter Admin'}
                  </h1>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(healthStatus)}`}>
                    {healthStatus}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  Operate training, submission checks, evaluation runs, and database-backed status flow.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                API: <span className="font-mono text-slate-100">{API_BASE_URL()}</span>
              </div>
              <Button
                variant="secondary"
                onClick={() => void refreshDashboard()}
                icon={leaderboardLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              >
                Refresh
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  resetApiBaseUrl()
                  setApiBaseInput(import.meta.env.VITE_API_BASE_URL?.trim() || API_BASE_URL())
                }}
                icon={<Wrench className="h-4 w-4" />}
              >
                Reset API
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="page-band">
          <div className="section-shell">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Backend"
                value={healthStatus}
                hint={healthError || 'validator / API health'}
                icon={<ShieldCheck className="h-5 w-5" />}
                tone={toneForStatus(healthStatus)}
              />
              <StatCard
                label="Leaderboard rows"
                value={`${summary.submissions}`}
                hint={`${summary.completed} completed submissions`}
                icon={<ClipboardList className="h-5 w-5" />}
              />
              <StatCard
                label="Top score"
                value={summary.topScore}
                hint={summary.topTeam}
                icon={<Gauge className="h-5 w-5" />}
                tone="ok"
              />
              <StatCard
                label="API base"
                value={API_BASE_URL()}
                hint="saved locally for this browser"
                icon={<Server className="h-5 w-5" />}
              />
            </div>
          </div>
        </section>

        <Section
          eyebrow="Control plane"
          title="Training and submission controls"
          description="Launch jobs directly against the validator backend, upload checkpoints, and refresh the current database-backed state."
          actions={
            <Button variant="quiet" onClick={() => void loadSubmission()} icon={<Activity className="h-4 w-4" />}>
              Load submission
            </Button>
          }
        >
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="section-kicker">Train job</div>
                  <h3 className="mt-1 text-lg font-semibold text-slate-50">Queue a train run</h3>
                </div>
                <Sparkles className="h-5 w-5 text-cyan-300" />
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Submission ID" help="Optional. Links the train run to an existing submission row.">
                  <Input
                    value={trainSubmissionId}
                    onChange={(event) => setTrainSubmissionId(event.target.value)}
                    placeholder="sub-..."
                  />
                </Field>
                <Field label="Warmstart artifact ID" help="Optional artifact to bootstrap from.">
                  <Input
                    value={warmstartArtifactId}
                    onChange={(event) => setWarmstartArtifactId(event.target.value)}
                    placeholder="artifact-..."
                  />
                </Field>
              </div>
              <div className="mt-4">
                <Field
                  label="Benchmark names"
                  help="Comma-separated benchmark IDs. The backend uses this list for training."
                >
                  <Input
                    value={trainBenchmarks}
                    onChange={(event) => setTrainBenchmarks(event.target.value)}
                    placeholder="math500, mmlu"
                  />
                </Field>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BENCHMARK_OPTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setTrainBenchmarks(item)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-100"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void submitTrain()}
                  disabled={trainLoading}
                  icon={trainLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                >
                  Queue train
                </Button>
                <span className="text-sm text-slate-400">Creates a `trains` row and pushes the worker queue.</span>
              </div>
              {trainNote ? (
                <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${statusClass(trainNote.includes('Queued') ? 'running' : 'failed')}`}>
                  {trainNote}
                </div>
              ) : null}
            </div>

            <div className="panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="section-kicker">Submission check</div>
                  <h3 className="mt-1 text-lg font-semibold text-slate-50">Upload a checkpoint bundle</h3>
                </div>
                <FileUp className="h-5 w-5 text-amber-300" />
              </div>
              <div className="mt-5 grid gap-4">
                <Field label="Checkpoint file" help="The `.npy` or bundle file to submit.">
                  <Input
                    type="file"
                    accept=".npy,.tar.gz,.zip,.json"
                    onChange={(event) => setCheckpointFile(event.target.files?.[0] ?? null)}
                  />
                </Field>
                <Field label="Team / miner name">
                  <Input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="tmimmanuel" />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void uploadSubmission()}
                  disabled={submissionUploadLoading}
                  icon={submissionUploadLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                >
                  Submit checkpoint
                </Button>
                <span className="text-sm text-slate-400">
                  Manual uploads are file + team only. GitHub PR submissions arrive through the webhook path.
                </span>
              </div>
              {submissionNote ? (
                <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${statusClass(submissionNote.includes('Queued') ? 'queued' : 'failed')}`}>
                  {submissionNote}
                </div>
              ) : null}
            </div>
          </div>
        </Section>

        <Section
          eyebrow="Database view"
          title="Submission inspector"
          description="Look up a submission row, its evaluation history, its train history, and current cost / duration values."
          actions={
            <div className="flex items-center gap-2">
              <Input
                value={submissionId}
                onChange={(event) => setSubmissionId(event.target.value)}
                placeholder="submission id"
                className="min-w-72"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void loadSubmission()
                  }
                }}
              />
              <Button
                onClick={() => void loadSubmission()}
                disabled={submissionLoading}
                icon={
                  submissionLoading ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="h-4 w-4" />
                  )
                }
              >
                Fetch
              </Button>
            </div>
          }
        >
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="meta-label">Submission</div>
                  <h3 className="mt-1 text-lg font-semibold text-slate-50">
                    {submission ? submission.id : 'No submission loaded'}
                  </h3>
                </div>
                {submission ? <CopyButton value={submission.id} /> : null}
              </div>
              {submissionError ? (
                <div className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {submissionError}
                </div>
              ) : null}

              {submission ? (
                <>
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Status" value={submission.status} icon={<Bot className="h-5 w-5" />} tone={toneForStatus(submission.status)} />
                    <StatCard label="Latest score" value={fmtPct(submission.latest_score)} icon={<Gauge className="h-5 w-5" />} />
                    <StatCard label="Cost" value={fmtNum(submission.cost_usd)} icon={<ArrowUpRight className="h-5 w-5" />} />
                    <StatCard label="Duration" value={fmtSeconds(submission.duration_seconds)} icon={<ArrowDownRight className="h-5 w-5" />} />
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <div className="meta-label">Metadata</div>
                      <dl className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-400">Source</dt>
                          <dd className="text-slate-200">{submission.source}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-400">Miner</dt>
                          <dd className="text-slate-200">{submission.miner_id || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-400">Benchmarks</dt>
                          <dd className="text-slate-200">{submission.benchmarks.join(', ') || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-400">Created</dt>
                          <dd className="text-slate-200">{fmtDate(submission.created_at)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-400">Updated</dt>
                          <dd className="text-slate-200">{fmtDate(submission.updated_at)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-400">Current phase</dt>
                          <dd className="text-slate-200">{submission.current_phase || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-400">Current message</dt>
                          <dd className="max-w-[24rem] text-right text-slate-200">
                            {submission.current_message || '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <div className="meta-label">Artifacts</div>
                      <dl className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-400">Artifact ID</dt>
                          <dd className="text-right text-slate-200">{submission.submission_artifact_id || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-400">Latest train</dt>
                          <dd className="text-slate-200">{submission.latest_train_id ?? '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-400">Latest eval</dt>
                          <dd className="text-slate-200">{submission.latest_eval_id ?? '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-400">Best eval</dt>
                          <dd className="text-slate-200">{submission.best_eval_id ?? '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-400">Finished at</dt>
                          <dd className="text-slate-200">{fmtDate(submission.finished_at)}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-slate-200">Train runs</h4>
                        <span className="text-xs text-slate-400">{submission.trains.length} rows</span>
                      </div>
                      <RunTable label="Train" runs={submission.trains} />
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-slate-200">Evaluation runs</h4>
                        <span className="text-xs text-slate-400">{submission.evaluations.length} rows</span>
                      </div>
                      <RunTable label="Eval" runs={submission.evaluations} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-5 rounded-lg border border-dashed border-white/10 bg-white/3 px-4 py-6 text-sm text-slate-400">
                  Fetch a submission id to inspect the database record.
                </div>
              )}
            </div>

            <div className="panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="section-kicker">Evaluation lookup</div>
                  <h3 className="mt-1 text-lg font-semibold text-slate-50">Open a single evaluation run</h3>
                </div>
                <SquareTerminal className="h-5 w-5 text-lime-300" />
              </div>
              <div className="mt-4 flex gap-2">
                <Input
                  value={evaluationId}
                  onChange={(event) => setEvaluationId(event.target.value)}
                  placeholder="evaluation id"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void loadEvaluation()
                    }
                  }}
                />
                <Button
                  onClick={() => void loadEvaluation()}
                  disabled={evaluationLoading}
                  icon={
                    evaluationLoading ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4" />
                    )
                  }
                >
                  Fetch
                </Button>
              </div>
              {evaluationError ? (
                <div className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {evaluationError}
                </div>
              ) : null}
              {evaluation ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <StatCard label="Status" value={evaluation.status} icon={<Bot className="h-5 w-5" />} tone={toneForStatus(evaluation.status)} />
                    <StatCard label="Score" value={fmtPct(evaluation.score)} icon={<Gauge className="h-5 w-5" />} />
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Benchmarks</dt>
                        <dd className="text-right text-slate-200">{evaluation.benchmark_names.join(', ') || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Provider</dt>
                        <dd className="text-slate-200">{evaluation.provider || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Model config</dt>
                        <dd className="text-right text-slate-200">{evaluation.models_config || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Batch size</dt>
                        <dd className="text-slate-200">{evaluation.batch_size ?? '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Items</dt>
                        <dd className="text-slate-200">{evaluation.max_items ?? '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Cost</dt>
                        <dd className="text-slate-200">{fmtNum(evaluation.cost_usd)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Duration</dt>
                        <dd className="text-slate-200">{fmtSeconds(evaluation.duration_seconds)}</dd>
                      </div>
                    </dl>
                  </div>
                  <details className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-200">Run command</summary>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-300">
                      {evaluation.command || '—'}
                    </pre>
                  </details>
                  <details className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-200">Logs and metrics</summary>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-300">
                      {JSON.stringify(evaluation.metrics, null, 2)}
                    </pre>
                    {evaluation.error ? (
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-100">
                        {evaluation.error}
                      </pre>
                    ) : null}
                  </details>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-white/10 bg-white/3 px-4 py-6 text-sm text-slate-400">
                  Fetch an evaluation id to inspect its status and logs.
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section
          eyebrow="Leaderboard"
          title="Current standings"
          description="This view pulls the public leaderboard endpoint so you can verify completed submissions and their benchmark scores."
          actions={
            <Button variant="quiet" onClick={() => void refreshDashboard()} icon={<RefreshCw className="h-4 w-4" />}>
              Reload board
            </Button>
          }
        >
          {leaderboardError ? (
            <div className="mb-4 rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {leaderboardError}
            </div>
          ) : null}
          <div className="table-shell">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/5 text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-medium">Rank</th>
                    <th className="px-4 py-3 font-medium">Team</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Accuracy</th>
                    <th className="px-4 py-3 font-medium">Math</th>
                    <th className="px-4 py-3 font-medium">MMLU</th>
                    <th className="px-4 py-3 font-medium">GSM8K</th>
                    <th className="px-4 py-3 font-medium">HumanEval</th>
                    <th className="px-4 py-3 font-medium">BBH</th>
                    <th className="px-4 py-3 font-medium">Submitted</th>
                    <th className="px-4 py-3 font-medium">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardLoading && !leaderboard.length ? (
                    <tr>
                      <td className="px-4 py-6 text-slate-400" colSpan={11}>
                        Loading leaderboard…
                      </td>
                    </tr>
                  ) : leaderboard.length ? (
                    leaderboard.map((entry) => (
                      <tr key={entry.submission_id} className="border-t border-white/8 hover:bg-white/[0.03]">
                        <td className="px-4 py-3">
                          <span className="rank-badge bg-white/10 text-slate-200">{entry.rank}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-100">{entry.team}</div>
                          <div className="text-xs text-slate-400">{entry.submission_id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(entry.status)}`}>
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-200">{fmtPct(entry.accuracy)}</td>
                        <td className="px-4 py-3 text-slate-300">{fmtPct(entry.math)}</td>
                        <td className="px-4 py-3 text-slate-300">{fmtPct(entry.mmlu)}</td>
                        <td className="px-4 py-3 text-slate-300">{fmtPct(entry.gsm8k)}</td>
                        <td className="px-4 py-3 text-slate-300">{fmtPct(entry.humaneval)}</td>
                        <td className="px-4 py-3 text-slate-300">{fmtPct(entry.bbh)}</td>
                        <td className="px-4 py-3 text-slate-300">{fmtDate(entry.submitted)}</td>
                        <td className="px-4 py-3">
                          <a
                            className="button-quiet text-xs"
                            href={entry.report}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open
                          </a>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-slate-400" colSpan={11}>
                        No completed submissions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        <Section
          eyebrow="API"
          title="Runtime configuration"
          description="The frontend can point at a different backend without rebuilding. Use this when the validator or SSH host changes."
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="panel p-5">
              <div className="section-kicker">Backend URL</div>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <Input value={apiBaseInput} onChange={(event) => setApiBaseInput(event.target.value)} />
                <Button
                  variant="secondary"
                  onClick={() => {
                    setApiBaseUrl(apiBaseInput)
                    localStorage.setItem(STORAGE_KEYS.apiBase, apiBaseInput)
                    void refreshDashboard()
                  }}
                  icon={<Save className="h-4 w-4" />}
                >
                  Save
                </Button>
              </div>
              <p className="mt-3 text-sm text-slate-400">
                The current browser value overrides the build-time `VITE_API_BASE_URL` value.
              </p>
            </div>
            <div className="panel p-5">
              <div className="section-kicker">Notes</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li className="flex gap-2">
                  <CircleAlert className="mt-0.5 h-4 w-4 text-amber-300" />
                  Train and submission actions still rely on backend env vars for provider, pipeline mode, and remote GPU settings.
                </li>
                <li className="flex gap-2">
                  <Database className="mt-0.5 h-4 w-4 text-cyan-300" />
                  The inspector uses the live PostgreSQL-backed API responses, not mocked data.
                </li>
                <li className="flex gap-2">
                  <Activity className="mt-0.5 h-4 w-4 text-emerald-300" />
                  The repo root redirects to `/admin/` so GitHub Pages lands on the panel directly.
                </li>
              </ul>
            </div>
          </div>
        </Section>
      </main>
    </div>
  )
}

export default App
