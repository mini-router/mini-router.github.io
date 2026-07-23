import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
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
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Trash2,
  Wrench,
} from 'lucide-react'
import {
  API_BASE_URL,
  ApiError,
  clearAdminAuthToken,
  createProviderEvaluations,
  createTrainJob,
  deleteEvaluation,
  deleteSubmission,
  fetchAdminLogin,
  fetchAdminLogout,
  fetchAdminConfig,
  fetchAdminMe,
  fetchEvaluation,
  fetchEvaluations,
  fetchHealth,
  fetchLeaderboard,
  fetchQueuedJobs,
  fetchReviewControl,
  fetchSubmission,
  getAdminAuthToken,
  pauseReviewControl,
  resetApiBaseUrl,
  revokeEvaluation,
  revokeSubmission,
  setApiBaseUrl,
  setAdminAuthToken,
  submitCheckpoint,
  startReviewControl,
  updateAdminConfig,
} from './lib/api'
import type {
  BackendEvaluationOut,
  BackendJobQueueOut,
  BackendSubmissionOut,
  BackendTrainOut,
  AdminReviewControl,
} from './lib/api'
import type { LeaderboardEntry } from './types'
import { CostVsScoreChart, ScoreByModelChart, type ProviderBenchmarkPoint } from './components/ProviderBenchmarkChart'

type StatusTone = 'ok' | 'warn' | 'bad' | 'idle'

const BENCHMARK_OPTIONS = ['math500', 'mmlu', 'gsm8k', 'humaneval', 'bbh', 'livecodebench']

const MODEL_SET_OPTIONS = [
  { value: 'configs/models.openrouter-chutes.yaml', label: 'OpenRouter + Chutes' },
  { value: 'configs/models.chutes.light.yaml', label: 'Chutes light' },
  { value: 'configs/models.openrouter.light.yaml', label: 'OpenRouter light' },
  { value: 'configs/models.chutes.yaml', label: 'Chutes full' },
  { value: 'configs/models.openrouter.yaml', label: 'OpenRouter full' },
]

const PROVIDER_ROUTE_OPTIONS = [
  'openrouter-deepseek-v4-pro',
  'openrouter-glm-5',
  'openrouter-kimi-k2p6',
  'chutes-deepseek-v3p2',
  'chutes-glm-5',
  'chutes-kimi-k2p5',
]

const EXECUTION_MODE_OPTIONS = [
  { value: 'remote_gpu', label: 'Remote GPU' },
  { value: 'local_cpu', label: 'Local CPU' },
]

const STORAGE_KEYS = {
  authToken: 'minirouter.admin.token',
  authUser: 'minirouter.admin.authUser',
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

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        'w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none',
        'focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10',
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
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  icon?: ReactNode
}) {
  const cls =
    variant === 'primary'
      ? 'button-primary'
      : variant === 'secondary'
        ? 'button-secondary'
        : variant === 'danger'
          ? 'button-danger'
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

function LoginScreen({
  username,
  setUsername,
  password,
  setPassword,
  error,
  onLogin,
}: {
  username: string
  setUsername: (value: string) => void
  password: string
  setPassword: (value: string) => void
  error: string | null
  onLogin: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="panel w-full max-w-md p-6">
        <div className="flex items-center gap-3">
          <img
            src="/mini-router.jpg"
            alt="MiniRouter"
            className="h-12 w-12 rounded-lg border border-white/10 object-cover"
          />
          <div>
            <div className="section-kicker">Admin access</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50">MiniRouter Admin</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          Sign in to manage training, submissions, evaluation queues, and the database dashboard.
        </p>
        <div className="mt-6 space-y-4">
          <Field label="Username">
            <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </Field>
          <Field label="Password">
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onLogin()
                }
              }}
            />
          </Field>
        </div>
        {error ? (
          <div className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
        <Button className="mt-6 w-full" onClick={onLogin}>
          Sign in
        </Button>
      </div>
    </div>
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

function JobTable({ jobs }: { jobs: BackendJobQueueOut[] }) {
  if (!jobs.length) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-slate-400">
        No queued or running jobs found.
      </div>
    )
  }

  return (
    <div className="table-shell">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Submission</th>
              <th className="px-4 py-3 font-medium">Train</th>
              <th className="px-4 py-3 font-medium">Queue</th>
              <th className="px-4 py-3 font-medium">Attempts</th>
              <th className="px-4 py-3 font-medium">Claimed by</th>
              <th className="px-4 py-3 font-medium">Next run</th>
              <th className="px-4 py-3 font-medium">Last error</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-white/8 hover:bg-white/[0.03]">
                <td className="px-4 py-3">
                  <span className="ui-chip">{job.kind}</span>
                  <div className="mt-1 text-xs text-slate-500">{job.job_type}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(job.status)}`}>
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-300">{job.submission_id || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-300">{job.train_id ?? '—'}</td>
                <td className="px-4 py-3 text-slate-300">{job.queue_name}</td>
                <td className="px-4 py-3 text-slate-300">
                  {job.attempts}/{job.max_attempts}
                </td>
                <td className="px-4 py-3 text-slate-300">{job.claimed_by || '—'}</td>
                <td className="px-4 py-3 text-slate-300">{fmtDate(job.next_run_at)}</td>
                <td className="px-4 py-3 text-slate-300">
                  <div className="max-w-[24rem] whitespace-pre-wrap break-words">
                    {job.last_error || '—'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function metricText(metrics: Record<string, unknown>, key: string): string {
  const value = metrics[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isInteger(value) ? value.toString() : value.toFixed(4)
  return '—'
}

function ProviderEvaluationTable({
  runs,
  onDelete,
  onRevoke,
  deletingId,
}: {
  runs: BackendEvaluationOut[]
  onDelete: (run: BackendEvaluationOut) => void
  onRevoke: (run: BackendEvaluationOut) => void
  deletingId: number | null
}) {
  if (!runs.length) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-slate-400">
        No standalone provider evaluations recorded yet.
      </div>
    )
  }

  return (
    <div className="table-shell">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3 font-medium">Eval</th>
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">Benchmark</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Repeat</th>
              <th className="px-4 py-3 font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const isDeleted = Boolean(run.deleted_at)
              return (
                <tr
                  key={`provider-eval-${run.id}`}
                  className={[
                    'border-t border-white/8 hover:bg-white/[0.03]',
                    isDeleted ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-200">{run.id}</td>
                  <td className="px-4 py-3 text-slate-300">{metricText(run.metrics, 'provider_route')}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {run.benchmark_names.join(', ') || metricText(run.metrics, 'benchmark')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(run.status)}`}>
                      {run.status}
                    </span>
                    {isDeleted ? (
                      <span className="ml-2 rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-xs text-rose-200">
                        deleted
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{fmtPct(run.score)}</td>
                  <td className="px-4 py-3 text-slate-300">{metricText(run.metrics, 'repeat')}</td>
                  <td className="px-4 py-3 text-slate-300">{fmtNum(run.cost_usd)}</td>
                  <td className="px-4 py-3 text-slate-300">{fmtSeconds(run.duration_seconds)}</td>
                  <td className="px-4 py-3">
                    {isDeleted ? (
                      <Button
                        variant="secondary"
                        onClick={() => onRevoke(run)}
                        disabled={deletingId === run.id}
                        icon={
                          deletingId === run.id ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )
                        }
                        className="px-2.5 py-1.5 text-xs"
                      >
                        Revoke
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        onClick={() => onDelete(run)}
                        disabled={deletingId === run.id}
                        icon={
                          deletingId === run.id ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )
                        }
                        className="px-2.5 py-1.5 text-xs"
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function QueueFilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1.5 text-xs font-medium transition',
        active
          ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100'
          : 'border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-100',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function App() {
  const [isAuthed, setIsAuthed] = useState(() => Boolean(getAdminAuthToken()))
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [adminUser, setAdminUser] = useState(
    () => localStorage.getItem(STORAGE_KEYS.authUser) || '',
  )
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
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
  const [jobs, setJobs] = useState<BackendJobQueueOut[]>([])
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsFilter, setJobsFilter] = useState<'all' | 'submission' | 'train' | 'evaluation'>('all')
  const [runtimeBenchmarks, setRuntimeBenchmarks] = useState<string[]>(['math500'])
  const [runtimeMaxItems, setRuntimeMaxItems] = useState(20)
  const [runtimeBatchSize, setRuntimeBatchSize] = useState(1)
  const [runtimeProvider, setRuntimeProvider] = useState('chutes')
  const [runtimeModelsConfig, setRuntimeModelsConfig] = useState('configs/models.chutes.light.yaml')
  const [runtimeExecutionMode, setRuntimeExecutionMode] = useState('remote_gpu')
  const [runtimeConfigSaving, setRuntimeConfigSaving] = useState(false)
  const [runtimeConfigNote, setRuntimeConfigNote] = useState<string | null>(null)
  const [providerBenchmarks, setProviderBenchmarks] = useState<string[]>(['math500'])
  const [providerRoutes, setProviderRoutes] = useState<string[]>(['openrouter-glm-5'])
  const [providerModelsConfig, setProviderModelsConfig] = useState('configs/models.openrouter-chutes.yaml')
  const [providerMaxItems, setProviderMaxItems] = useState(20)
  const [providerBatchSize, setProviderBatchSize] = useState(1)
  const [providerRepeat, setProviderRepeat] = useState(1)
  const [providerEvalNote, setProviderEvalNote] = useState<string | null>(null)
  const [providerEvalLoading, setProviderEvalLoading] = useState(false)
  const [providerEvalRuns, setProviderEvalRuns] = useState<BackendEvaluationOut[]>([])
  const [providerEvalError, setProviderEvalError] = useState<string | null>(null)
  const [deletingEvaluationId, setDeletingEvaluationId] = useState<number | null>(null)
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(null)
  const [reviewControl, setReviewControl] = useState<AdminReviewControl | null>(null)
  const [reviewActionLoading, setReviewActionLoading] = useState(false)
  const [reviewActionNote, setReviewActionNote] = useState<string | null>(null)
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

  const handleLogout = useCallback(async () => {
    await fetchAdminLogout().catch(() => undefined)
    clearAdminAuthToken()
    localStorage.removeItem(STORAGE_KEYS.authUser)
    setIsAuthed(false)
    setAdminUser('')
    setLoginPassword('')
    setLoginError(null)
  }, [])

  const expireSession = useCallback(async () => {
    await handleLogout()
    setLoginError('Session expired. Sign in again.')
  }, [handleLogout])

  const handleLogin = async () => {
    setLoginError(null)
    try {
      const result = await fetchAdminLogin({
        username: loginUsername.trim(),
        password: loginPassword,
      })
      setAdminAuthToken(result.access_token)
      localStorage.setItem(STORAGE_KEYS.authUser, result.username)
      setAdminUser(result.username)
      setIsAuthed(true)
      setLoginPassword('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setLoginError('Invalid username or password.')
      } else {
        setLoginError(error instanceof Error ? error.message : String(error))
      }
    }
  }

  const toggleRuntimeBenchmark = (benchmark: string) => {
    setRuntimeBenchmarks((current) => {
      if (current.includes(benchmark)) {
        const next = current.filter((item) => item !== benchmark)
        return next.length ? next : current
      }
      return [...current, benchmark]
    })
  }

  const toggleProviderBenchmark = (benchmark: string) => {
    setProviderBenchmarks((current) => {
      if (current.includes(benchmark)) {
        const next = current.filter((item) => item !== benchmark)
        return next.length ? next : current
      }
      return [...current, benchmark]
    })
  }

  const toggleProviderRoute = (route: string) => {
    setProviderRoutes((current) => {
      if (current.includes(route)) {
        const next = current.filter((item) => item !== route)
        return next.length ? next : current
      }
      return [...current, route]
    })
  }

  const saveRuntimeConfig = async () => {
    setRuntimeConfigSaving(true)
    setRuntimeConfigNote(null)
    try {
      const result = await updateAdminConfig({
        benchmark_names: runtimeBenchmarks,
        eval_max_items: runtimeMaxItems,
        eval_batch_size: runtimeBatchSize,
        eval_provider: runtimeProvider,
        eval_models_config: runtimeModelsConfig,
        eval_execution_mode: runtimeExecutionMode,
      })
      setRuntimeBenchmarks(result.benchmark_names.length ? result.benchmark_names : ['math500'])
      setRuntimeMaxItems(result.eval_max_items)
      setRuntimeBatchSize(result.eval_batch_size || 1)
      setRuntimeProvider(result.eval_provider)
      setRuntimeModelsConfig(result.eval_models_config)
      setRuntimeExecutionMode(result.eval_execution_mode || 'remote_gpu')
      setRuntimeConfigNote('Evaluation defaults updated.')
      await refreshDashboard()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setRuntimeConfigNote(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setRuntimeConfigSaving(false)
    }
  }

  const startReview = async () => {
    setReviewActionLoading(true)
    setReviewActionNote(null)
    try {
      const result = await startReviewControl()
      setReviewControl(result)
      setReviewActionNote('Review queue enabled.')
      await refreshDashboard()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setReviewActionNote(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setReviewActionLoading(false)
    }
  }

  const pauseReview = async () => {
    setReviewActionLoading(true)
    setReviewActionNote(null)
    try {
      const result = await pauseReviewControl()
      setReviewControl(result)
      setReviewActionNote('Review queue paused.')
      await refreshDashboard()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setReviewActionNote(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setReviewActionLoading(false)
    }
  }

  const queueProviderEvaluations = async () => {
    setProviderEvalLoading(true)
    setProviderEvalNote(null)
    setProviderEvalError(null)
    try {
      const result = await createProviderEvaluations({
        benchmark_names: providerBenchmarks,
        pool_models: providerRoutes,
        provider: 'compatible',
        models_config: providerModelsConfig,
        max_items: providerMaxItems,
        batch_size: providerBatchSize,
        repeat: providerRepeat,
      })
      setProviderEvalNote(`Queued ${result.evaluations.length} provider evaluation jobs.`)
      setProviderEvalRuns((current) => [...result.evaluations, ...current].slice(0, 100))
      await refreshDashboard()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setProviderEvalError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setProviderEvalLoading(false)
    }
  }

  const deleteProviderEvaluationRun = async (run: BackendEvaluationOut) => {
    if (!window.confirm(`Delete evaluation #${run.id}? You can revoke this from the same row afterward.`)) {
      return
    }
    setDeletingEvaluationId(run.id)
    setProviderEvalError(null)
    try {
      const updated = await deleteEvaluation(run.id)
      setProviderEvalRuns((current) => current.map((item) => (item.id === run.id ? updated : item)))
      setProviderEvalNote(`Deleted evaluation #${run.id}. Use Revoke to restore it.`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setProviderEvalError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setDeletingEvaluationId(null)
    }
  }

  const revokeProviderEvaluationRun = async (run: BackendEvaluationOut) => {
    setDeletingEvaluationId(run.id)
    setProviderEvalError(null)
    try {
      const updated = await revokeEvaluation(run.id)
      setProviderEvalRuns((current) => current.map((item) => (item.id === run.id ? updated : item)))
      setProviderEvalNote(`Restored evaluation #${run.id}.`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setProviderEvalError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setDeletingEvaluationId(null)
    }
  }

  const deleteStandingsSubmission = async (entry: LeaderboardEntry) => {
    const submissionId = entry.submission_id
    if (!submissionId) {
      setLeaderboardError('This standings row has no submission id to delete.')
      return
    }
    if (
      !window.confirm(
        `Delete submission "${entry.team}" (${submissionId}) from standings? You can revoke this from the same row afterward.`,
      )
    ) {
      return
    }
    setDeletingSubmissionId(submissionId)
    setLeaderboardError(null)
    try {
      await deleteSubmission(submissionId)
      setLeaderboard((current) =>
        current.map((item) =>
          item.submission_id === submissionId ? { ...item, deleted_at: new Date().toISOString() } : item,
        ),
      )
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setLeaderboardError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setDeletingSubmissionId(null)
    }
  }

  const revokeStandingsSubmission = async (entry: LeaderboardEntry) => {
    const submissionId = entry.submission_id
    if (!submissionId) {
      return
    }
    setDeletingSubmissionId(submissionId)
    setLeaderboardError(null)
    try {
      await revokeSubmission(submissionId)
      setLeaderboard((current) =>
        current.map((item) => (item.submission_id === submissionId ? { ...item, deleted_at: null } : item)),
      )
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setLeaderboardError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setDeletingSubmissionId(null)
    }
  }

  const loadRuntimeConfig = useCallback(async () => {
    try {
      const config = await fetchAdminConfig()
      setRuntimeBenchmarks(config.benchmark_names?.length ? config.benchmark_names : ['math500'])
      setRuntimeMaxItems(config.eval_max_items)
      setRuntimeBatchSize(config.eval_batch_size || 1)
      setRuntimeProvider(config.eval_provider)
      setRuntimeModelsConfig(config.eval_models_config)
      setRuntimeExecutionMode(config.eval_execution_mode || 'remote_gpu')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setRuntimeConfigNote(error instanceof Error ? error.message : String(error))
      }
    }
  }, [expireSession])

  const loadReviewControl = useCallback(async () => {
    try {
      const control = await fetchReviewControl()
      setReviewControl(control)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setReviewActionNote(error instanceof Error ? error.message : String(error))
      }
    }
  }, [expireSession])

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

  useEffect(() => {
    const validateSession = async () => {
      const token = getAdminAuthToken()
      if (!token) {
        setIsCheckingSession(false)
        return
      }
      try {
        const me = await fetchAdminMe()
        localStorage.setItem(STORAGE_KEYS.authUser, me.username)
        setAdminUser(me.username)
        setIsAuthed(true)
      } catch {
        clearAdminAuthToken()
        localStorage.removeItem(STORAGE_KEYS.authUser)
        setIsAuthed(false)
      } finally {
        setIsCheckingSession(false)
      }
    }
    void validateSession()
  }, [])

  const refreshDashboard = useCallback(async () => {
    setLeaderboardLoading(true)
    setJobsLoading(true)
    setHealthError(null)
    setLeaderboardError(null)
    setJobsError(null)
    setProviderEvalError(null)
    try {
      const jobType = jobsFilter === 'all' ? undefined : jobsFilter
      const [health, board, queue, review, providerRuns] = await Promise.all([
        fetchHealth(),
        fetchLeaderboard(50),
        fetchQueuedJobs('queued,running', jobType, 100),
        fetchReviewControl(),
        fetchEvaluations(100),
      ])
      setHealthStatus(health.status)
      setLeaderboard(board)
      setJobs(queue)
      setReviewControl(review)
      setProviderEvalRuns(providerRuns)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      setHealthError(message)
      setHealthStatus('error')
      setLeaderboardError(message)
      setJobsError(message)
      setProviderEvalError(message)
    } finally {
      setLeaderboardLoading(false)
      setJobsLoading(false)
    }
  }, [jobsFilter, expireSession])

  useEffect(() => {
    if (!isAuthed || isCheckingSession) return
    void loadRuntimeConfig()
    void loadReviewControl()
    void refreshDashboard()
  }, [isAuthed, isCheckingSession, loadRuntimeConfig, loadReviewControl, refreshDashboard])

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
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setSubmissionError(error instanceof Error ? error.message : String(error))
      }
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
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setEvaluationError(error instanceof Error ? error.message : String(error))
      }
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
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setTrainNote(error instanceof Error ? error.message : String(error))
      }
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
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
      } else {
        setSubmissionNote(error instanceof Error ? error.message : String(error))
      }
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

  const providerBenchmarkPoints: ProviderBenchmarkPoint[] = useMemo(
    () =>
      providerEvalRuns
        .filter((run) => !run.deleted_at)
        .map((run) => ({
          id: run.id,
          route: metricText(run.metrics, 'provider_route'),
          benchmark: run.benchmark_names.join(', ') || metricText(run.metrics, 'benchmark'),
          score: run.score,
          cost_usd: run.cost_usd,
          duration_seconds: run.duration_seconds,
        })),
    [providerEvalRuns],
  )

  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-slate-300">
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          <span className="text-sm">Checking admin session…</span>
        </div>
      </div>
    )
  }

  if (!isAuthed) {
    return (
      <LoginScreen
        username={loginUsername}
        setUsername={setLoginUsername}
        password={loginPassword}
        setPassword={setLoginPassword}
        error={loginError}
        onLogin={handleLogin}
      />
    )
  }

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
                User: <span className="font-mono text-slate-100">{adminUser || 'admin'}</span>
              </div>
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
              <Button variant="quiet" onClick={handleLogout} icon={<ShieldCheck className="h-4 w-4" />}>
                Logout
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
          eyebrow="Runtime defaults"
          title="Evaluation defaults"
          description="These settings are stored in the backend database and used as the default benchmark list, item cap, and model preset for queued evaluations and submissions."
          actions={
            <Button
              variant="quiet"
              onClick={() => void saveRuntimeConfig()}
              disabled={runtimeConfigSaving}
              icon={runtimeConfigSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            >
              Save defaults
            </Button>
          }
        >
          <div className="panel p-5">
            <div className="grid gap-4 xl:grid-cols-[1.4fr_0.85fr_0.85fr_1fr_1fr_1fr]">
              <Field
                label="Benchmark list"
                help="The current evaluator uses the first selected benchmark as the active runtime benchmark."
              >
                <div className="flex flex-wrap gap-2">
                  {BENCHMARK_OPTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleRuntimeBenchmark(item)}
                      className={[
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                        runtimeBenchmarks.includes(item)
                          ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-100',
                      ].join(' ')}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Max items" help="Default item cap for evaluation runs.">
                <Input
                  type="number"
                  min={1}
                  value={runtimeMaxItems}
                  onChange={(event) => setRuntimeMaxItems(Math.max(1, Number(event.target.value) || 1))}
                />
              </Field>
              <Field label="Batch size" help="Number of benchmark items evaluated in parallel per batch.">
                <Input
                  type="number"
                  min={1}
                  value={runtimeBatchSize}
                  onChange={(event) => setRuntimeBatchSize(Math.max(1, Number(event.target.value) || 1))}
                />
              </Field>
              <Field label="Provider" help="Default provider used when queueing evaluation jobs.">
                <Select value={runtimeProvider} onChange={(event) => setRuntimeProvider(event.target.value)}>
                  <option value="chutes">chutes</option>
                  <option value="openrouter">openrouter</option>
                  <option value="fireworks">fireworks</option>
                </Select>
              </Field>
              <Field label="Model set" help="Default model config file used by the evaluator.">
                <Select
                  value={runtimeModelsConfig}
                  onChange={(event) => setRuntimeModelsConfig(event.target.value)}
                >
                  {MODEL_SET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Runtime mode"
                help="Default execution path for evaluations. Remote GPU is the default; local CPU is the fallback and manual-debug option."
              >
                <Select
                  value={runtimeExecutionMode}
                  onChange={(event) => setRuntimeExecutionMode(event.target.value)}
                >
                  {EXECUTION_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {runtimeConfigNote ? (
              <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                {runtimeConfigNote}
              </div>
            ) : null}
          </div>
        </Section>

        <Section
          eyebrow="Provider tests"
          title="Single provider benchmark tests"
          description="Queue direct single-route evaluations. Each selected provider route and benchmark pair is saved as its own evaluation row."
          actions={
            <Button
              onClick={() => void queueProviderEvaluations()}
              disabled={providerEvalLoading}
              icon={providerEvalLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
            >
              Queue tests
            </Button>
          }
        >
          <div className="panel p-5">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_1.4fr_1fr_0.7fr_0.7fr_0.7fr]">
              <Field label="Benchmarks" help="Each selected benchmark gets an individual evaluation row per provider route.">
                <div className="flex flex-wrap gap-2">
                  {BENCHMARK_OPTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleProviderBenchmark(item)}
                      className={[
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                        providerBenchmarks.includes(item)
                          ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-100',
                      ].join(' ')}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Provider routes" help="Routes are backend + logical model, for example openrouter-glm-5.">
                <div className="flex flex-wrap gap-2">
                  {PROVIDER_ROUTE_OPTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleProviderRoute(item)}
                      className={[
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                        providerRoutes.includes(item)
                          ? 'border-lime-400/40 bg-lime-400/15 text-lime-100'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-lime-400/30 hover:bg-lime-400/10 hover:text-lime-100',
                      ].join(' ')}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Model config">
                <Select value={providerModelsConfig} onChange={(event) => setProviderModelsConfig(event.target.value)}>
                  {MODEL_SET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Max items">
                <Input
                  type="number"
                  min={1}
                  value={providerMaxItems}
                  onChange={(event) => setProviderMaxItems(Math.max(1, Number(event.target.value) || 1))}
                />
              </Field>
              <Field label="Batch size">
                <Input
                  type="number"
                  min={1}
                  value={providerBatchSize}
                  onChange={(event) => setProviderBatchSize(Math.max(1, Number(event.target.value) || 1))}
                />
              </Field>
              <Field label="Repeat">
                <Input
                  type="number"
                  min={1}
                  value={providerRepeat}
                  onChange={(event) => setProviderRepeat(Math.max(1, Number(event.target.value) || 1))}
                />
              </Field>
            </div>
            {providerEvalNote ? (
              <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                {providerEvalNote}
              </div>
            ) : null}
            {providerEvalError ? (
              <div className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {providerEvalError}
              </div>
            ) : null}
          </div>
          <div className="mt-4">
            <ProviderEvaluationTable
              runs={providerEvalRuns}
              onDelete={(run) => void deleteProviderEvaluationRun(run)}
              onRevoke={(run) => void revokeProviderEvaluationRun(run)}
              deletingId={deletingEvaluationId}
            />
          </div>
        </Section>

        <Section
          eyebrow="Provider tests"
          title="Score by model"
          description="Scores from the provider benchmark table above, grouped by benchmark. Deleted rows are excluded."
        >
          <ScoreByModelChart points={providerBenchmarkPoints} />
        </Section>

        <Section
          eyebrow="Provider tests"
          title="Cost vs. score"
          description="Each point is one provider route's benchmark run. Marker shape indicates benchmark; hover a point for details."
        >
          <CostVsScoreChart points={providerBenchmarkPoints} />
        </Section>

        <Section
          eyebrow="Worker queue"
          title="Queued jobs"
          description="Live job rows pulled from the backend queue. Submission jobs, train jobs, and evaluation jobs are shown together so you can see what is waiting, what is running, and what failed."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(reviewControl?.enabled ? 'completed' : 'queued')}`}>
                {reviewControl?.enabled ? 'review active' : 'review paused'}
              </span>
              {!reviewControl?.enabled ? (
                <Button
                  variant="secondary"
                  onClick={() => void startReview()}
                  disabled={reviewActionLoading}
                  icon={reviewActionLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                >
                  Start review
                </Button>
              ) : (
                <Button
                  variant="quiet"
                  onClick={() => void pauseReview()}
                  disabled={reviewActionLoading}
                  icon={reviewActionLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                >
                  Pause review
                </Button>
              )}
              <QueueFilterButton active={jobsFilter === 'all'} onClick={() => setJobsFilter('all')}>
                All
              </QueueFilterButton>
              <QueueFilterButton active={jobsFilter === 'submission'} onClick={() => setJobsFilter('submission')}>
                Submission
              </QueueFilterButton>
              <QueueFilterButton active={jobsFilter === 'train'} onClick={() => setJobsFilter('train')}>
                Train
              </QueueFilterButton>
              <QueueFilterButton active={jobsFilter === 'evaluation'} onClick={() => setJobsFilter('evaluation')}>
                Evaluation
              </QueueFilterButton>
              <Button variant="quiet" onClick={() => void refreshDashboard()} icon={<RefreshCw className="h-4 w-4" />}>
                Refresh jobs
              </Button>
            </div>
          }
        >
          {jobsError ? (
            <div className="mb-4 rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {jobsError}
            </div>
          ) : null}
          {reviewActionNote ? (
            <div className="mb-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              {reviewActionNote}
            </div>
          ) : null}
          {jobsLoading && !jobs.length ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-slate-400">
              Loading queued jobs…
            </div>
          ) : (
            <JobTable jobs={jobs} />
          )}
        </Section>

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
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardLoading && !leaderboard.length ? (
                    <tr>
                      <td className="px-4 py-6 text-slate-400" colSpan={12}>
                        Loading leaderboard…
                      </td>
                    </tr>
                  ) : leaderboard.length ? (
                    leaderboard.map((entry) => {
                      const isDeleted = Boolean(entry.deleted_at)
                      return (
                        <tr
                          key={entry.submission_id}
                          className={[
                            'border-t border-white/8 hover:bg-white/[0.03]',
                            isDeleted ? 'opacity-50' : '',
                          ].join(' ')}
                        >
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
                            {isDeleted ? (
                              <span className="ml-2 rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-xs text-rose-200">
                                deleted
                              </span>
                            ) : null}
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
                          <td className="px-4 py-3">
                            {isDeleted ? (
                              <Button
                                variant="secondary"
                                onClick={() => void revokeStandingsSubmission(entry)}
                                disabled={deletingSubmissionId === entry.submission_id}
                                icon={
                                  deletingSubmissionId === entry.submission_id ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )
                                }
                                className="px-2.5 py-1.5 text-xs"
                              >
                                Revoke
                              </Button>
                            ) : (
                              <Button
                                variant="danger"
                                onClick={() => void deleteStandingsSubmission(entry)}
                                disabled={deletingSubmissionId === entry.submission_id}
                                icon={
                                  deletingSubmissionId === entry.submission_id ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )
                                }
                                className="px-2.5 py-1.5 text-xs"
                              >
                                Delete
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-slate-400" colSpan={12}>
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
