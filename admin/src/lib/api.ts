import type { LeaderboardEntry } from '../types'

const DEFAULT_API_BASE_URL = 'https://minirouter.work.gd'

let runtimeApiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
).replace(/\/+$/, '')

export const API_BASE_URL = (): string => runtimeApiBaseUrl

export function setApiBaseUrl(next: string): void {
  const normalized = next.trim().replace(/\/+$/, '')
  runtimeApiBaseUrl = normalized || DEFAULT_API_BASE_URL
}

export function resetApiBaseUrl(): void {
  runtimeApiBaseUrl = (
    import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
  ).replace(/\/+$/, '')
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${runtimeApiBaseUrl}${normalizedPath}`
}

interface BackendLeaderboardEntry {
  rank: number
  submission_id: string
  team: string
  miner_id: string | null
  accuracy: number | null
  gsm8k: number | null
  mmlu: number | null
  math: number | null
  humaneval: number | null
  bbh: number | null
  params: number | null
  submitted: string
  report: string
  status: string
}

interface BackendLeaderboardResponse {
  items: BackendLeaderboardEntry[]
}

function normalizeLeaderboardEntry(entry: BackendLeaderboardEntry): LeaderboardEntry {
  const report =
    entry.report.startsWith('/api/submissions/') ? `/submission/${entry.submission_id}` : entry.report

  return {
    rank: entry.rank,
    submission_id: entry.submission_id,
    team: entry.team,
    miner_id: entry.miner_id,
    accuracy: entry.accuracy,
    gsm8k: entry.gsm8k,
    mmlu: entry.mmlu,
    math: entry.math,
    humaneval: entry.humaneval,
    bbh: entry.bbh,
    params: entry.params,
    submitted: entry.submitted,
    report,
    status: entry.status,
  }
}

export async function fetchLeaderboard(limit = 100): Promise<LeaderboardEntry[]> {
  const response = await fetch(apiUrl(`/api/leaderboard?limit=${limit}`), {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Leaderboard request failed with status ${response.status}`)
  }

  const payload = (await response.json()) as BackendLeaderboardResponse
  return payload.items.map(normalizeLeaderboardEntry)
}

export interface HealthResponse {
  status: string
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(apiUrl('/health'), {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`)
  }
  return (await response.json()) as HealthResponse
}

export interface BackendEvaluationOut {
  id: number
  submission_id: string
  train_id: number | null
  input_artifact_id: string | null
  status: string
  score: number | null
  phase: string | null
  message: string | null
  progress_current: number | null
  progress_total: number | null
  benchmark_names: string[]
  provider: string | null
  models_config: string | null
  execution_mode: string | null
  device: string | null
  dtype: string | null
  batch_size: number | null
  max_items: number | null
  max_turns: number | null
  max_tokens: number | null
  reasoning: string | null
  seed: number | null
  cost_usd: number | null
  duration_seconds: number | null
  metrics: Record<string, unknown>
  command: string | null
  stdout: string | null
  stderr: string | null
  results_path: string | null
  results_artifact_id: string | null
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface BackendTrainOut {
  id: number
  submission_id: string | null
  status: string
  phase: string | null
  message: string | null
  progress_current: number | null
  progress_total: number | null
  benchmark_names: string[]
  warmstart_artifact_id: string | null
  output_artifact_id: string | null
  cost_usd: number | null
  duration_seconds: number | null
  metrics: Record<string, unknown>
  command: string | null
  stdout: string | null
  stderr: string | null
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface BackendSubmissionOut {
  id: string
  source: string
  miner_id: string | null
  team_name: string | null
  repo_full_name: string | null
  pr_number: number | null
  head_sha: string | null
  benchmark: string
  benchmarks: string[]
  status: string
  latest_score: number | null
  latest_train_id: number | null
  latest_eval_id: number | null
  best_eval_id: number | null
  current_phase: string | null
  current_message: string | null
  current_progress_current: number | null
  current_progress_total: number | null
  finished_at: string | null
  duration_seconds: number | null
  cost_usd: number | null
  submission_artifact_id: string | null
  created_at: string
  updated_at: string
  evaluations: BackendEvaluationOut[]
  trains: BackendTrainOut[]
}

export async function fetchSubmission(submissionId: string): Promise<BackendSubmissionOut> {
  const response = await fetch(apiUrl(`/api/submissions/${submissionId}`), {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Submission request failed with status ${response.status}`)
  }

  return (await response.json()) as BackendSubmissionOut
}

export async function fetchEvaluation(evaluationId: string): Promise<BackendEvaluationOut> {
  const response = await fetch(apiUrl(`/api/evaluations/${evaluationId}`), {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Evaluation request failed with status ${response.status}`)
  }

  return (await response.json()) as BackendEvaluationOut
}

export interface TrainCreateRequest {
  benchmark_names: string[]
  submission_id?: string | null
  warmstart_artifact_id?: string | null
}

export interface TrainCreateResponse {
  train: BackendTrainOut
  job_id: string
}

export async function createTrainJob(payload: TrainCreateRequest): Promise<TrainCreateResponse> {
  const response = await fetch(apiUrl('/api/trains'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Train request failed with status ${response.status}`)
  }

  return (await response.json()) as TrainCreateResponse
}

export interface SubmissionCreateResponse {
  submission: BackendSubmissionOut
  evaluation: BackendEvaluationOut | null
}

export interface SubmissionUploadRequest {
  file: File
  team_name?: string
  repo_full_name?: string
  pr_number?: string | number
  head_sha?: string
}

export async function submitCheckpoint(payload: SubmissionUploadRequest): Promise<SubmissionCreateResponse> {
  const form = new FormData()
  form.append('file', payload.file)
  if (payload.team_name) form.append('team_name', payload.team_name)
  if (payload.repo_full_name) form.append('repo_full_name', payload.repo_full_name)
  if (payload.pr_number !== undefined && payload.pr_number !== null && `${payload.pr_number}`.trim()) {
    form.append('pr_number', `${payload.pr_number}`)
  }
  if (payload.head_sha) form.append('head_sha', payload.head_sha)

  const response = await fetch(apiUrl('/submit'), {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    throw new Error(`Submission request failed with status ${response.status}`)
  }

  return (await response.json()) as SubmissionCreateResponse
}
