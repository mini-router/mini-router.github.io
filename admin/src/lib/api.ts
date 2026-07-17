import type { LeaderboardEntry } from '../types'

const DEFAULT_API_BASE_URL = 'https://minirouter.work.gd'
const ADMIN_TOKEN_STORAGE_KEY = 'minirouter.admin.token'
const ADMIN_API_PREFIX = '/api/admin'

let runtimeApiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
).replace(/\/+$/, '')
let runtimeAdminToken = readStoredAdminToken()

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

function readStoredAdminToken(): string {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() || ''
}

function persistAdminToken(token: string): void {
  if (typeof window === 'undefined') {
    return
  }
  if (token) {
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token)
  } else {
    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
  }
}

export function getAdminAuthToken(): string {
  return runtimeAdminToken || readStoredAdminToken()
}

export function setAdminAuthToken(token: string): void {
  runtimeAdminToken = token.trim()
  persistAdminToken(runtimeAdminToken)
}

export function clearAdminAuthToken(): void {
  runtimeAdminToken = ''
  persistAdminToken('')
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function authHeaders(): HeadersInit {
  const token = getAdminAuthToken()
  if (!token) {
    return {}
  }
  return { Authorization: `Bearer ${token}` }
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }
  const token = getAdminAuthToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new ApiError(
      message || `${init.method || 'GET'} request failed with status ${response.status}`,
      response.status,
    )
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
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
  const payload = await requestJson<BackendLeaderboardResponse>(`${ADMIN_API_PREFIX}/leaderboard?limit=${limit}`)
  return payload.items.map(normalizeLeaderboardEntry)
}

export interface HealthResponse {
  status: string
}

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/health')
}

export interface BackendEvaluationOut {
  id: number
  submission_id: string | null
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

export interface BackendJobQueueOut {
  id: string
  job_type: string
  kind: string
  job_id: string
  submission_id: string | null
  train_id: number | null
  evaluation_id: number | null
  queue_name: string
  status: string
  priority: number
  dedupe_key: string | null
  claimed_by: string | null
  claimed_at: string | null
  heartbeat_at: string | null
  attempts: number
  max_attempts: number
  next_run_at: string | null
  last_error: string | null
  payload: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface BackendJobQueueResponse {
  items: BackendJobQueueOut[]
}

export async function fetchSubmission(submissionId: string): Promise<BackendSubmissionOut> {
  return requestJson<BackendSubmissionOut>(`${ADMIN_API_PREFIX}/submissions/${submissionId}`)
}

export async function fetchQueuedJobs(
  status = 'queued,running',
  jobType?: string,
  limit = 100,
): Promise<BackendJobQueueOut[]> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (jobType) params.set('job_type', jobType)
  params.set('limit', `${limit}`)

  const payload = await requestJson<BackendJobQueueResponse>(
    `${ADMIN_API_PREFIX}/jobs?${params.toString()}`,
  )
  return payload.items
}

export async function fetchEvaluation(evaluationId: string): Promise<BackendEvaluationOut> {
  return requestJson<BackendEvaluationOut>(`${ADMIN_API_PREFIX}/evaluations/${evaluationId}`)
}

export async function fetchEvaluations(limit = 100): Promise<BackendEvaluationOut[]> {
  return requestJson<BackendEvaluationOut[]>(
    `${ADMIN_API_PREFIX}/evaluations?standalone_only=true&limit=${limit}`,
  )
}

export interface AdminLoginRequest {
  username: string
  password: string
}

export interface AdminLoginResponse {
  access_token: string
  token_type: string
  username: string
  expires_at: string
}

export interface AdminMeResponse {
  username: string
}

export interface AdminRuntimeConfig {
  benchmark_names: string[]
  eval_max_items: number
  eval_batch_size: number
  eval_provider: string
  eval_models_config: string
  eval_execution_mode: string
  updated_at: string | null
}

export interface AdminRuntimeConfigUpdate {
  benchmark_names: string[]
  eval_max_items: number
  eval_batch_size: number
  eval_provider: string
  eval_models_config: string
  eval_execution_mode: string
}

export interface AdminReviewControl {
  enabled: boolean
  started_by: string | null
  started_at: string | null
  updated_at: string
}

export async function fetchAdminLogin(payload: AdminLoginRequest): Promise<AdminLoginResponse> {
  const response = await fetch(apiUrl(`${ADMIN_API_PREFIX}/login`), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new ApiError(message || `Login request failed with status ${response.status}`, response.status)
  }
  return (await response.json()) as AdminLoginResponse
}

export async function fetchAdminMe(): Promise<AdminMeResponse> {
  return requestJson<AdminMeResponse>(`${ADMIN_API_PREFIX}/me`)
}

export async function fetchAdminConfig(): Promise<AdminRuntimeConfig> {
  return requestJson<AdminRuntimeConfig>(`${ADMIN_API_PREFIX}/config`)
}

export async function updateAdminConfig(
  payload: AdminRuntimeConfigUpdate,
): Promise<AdminRuntimeConfig> {
  return requestJson<AdminRuntimeConfig>(`${ADMIN_API_PREFIX}/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function fetchReviewControl(): Promise<AdminReviewControl> {
  return requestJson<AdminReviewControl>(`${ADMIN_API_PREFIX}/review`)
}

export async function startReviewControl(): Promise<AdminReviewControl> {
  return requestJson<AdminReviewControl>(`${ADMIN_API_PREFIX}/review/start`, {
    method: 'POST',
  })
}

export async function pauseReviewControl(): Promise<AdminReviewControl> {
  return requestJson<AdminReviewControl>(`${ADMIN_API_PREFIX}/review/pause`, {
    method: 'POST',
  })
}

export async function fetchAdminLogout(): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`${ADMIN_API_PREFIX}/logout`, { method: 'POST' })
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
  const response = await fetch(apiUrl(`${ADMIN_API_PREFIX}/trains`), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new ApiError(message || `Train request failed with status ${response.status}`, response.status)
  }

  return (await response.json()) as TrainCreateResponse
}

export interface ProviderEvaluationCreateRequest {
  benchmark_names: string[]
  pool_models: string[]
  provider: string
  models_config: string
  max_items: number
  batch_size: number
  repeat: number
}

export interface ProviderEvaluationCreateResponse {
  evaluations: BackendEvaluationOut[]
  job_ids: string[]
}

export async function createProviderEvaluations(
  payload: ProviderEvaluationCreateRequest,
): Promise<ProviderEvaluationCreateResponse> {
  return requestJson<ProviderEvaluationCreateResponse>(`${ADMIN_API_PREFIX}/provider-evaluations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
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

  const response = await fetch(apiUrl(`${ADMIN_API_PREFIX}/submit`), {
    method: 'POST',
    headers: {
      ...authHeaders(),
    },
    body: form,
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new ApiError(
      message || `Submission request failed with status ${response.status}`,
      response.status,
    )
  }

  return (await response.json()) as SubmissionCreateResponse
}
