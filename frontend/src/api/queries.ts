import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { API_BASE, api, unwrap } from './client'
import type { BatchJob, Mode, NewPoiRequest, SiteRequest, SuggestJob, SuggestRequest } from './client'

const STATIC = { staleTime: Infinity, gcTime: Infinity } as const
const JOB_POLL_MS = 600

const isRunning = (job?: { status: string }) => job?.status === 'queued' || job?.status === 'running'

// -- Reference data (fixed for a given model) ------------------------------------------------------------------------
export const useModelInfo = () =>
  useQuery({ queryKey: ['model'], queryFn: () => unwrap(api.GET('/api/v1/model')), ...STATIC })

export const usePois = () =>
  useQuery({ queryKey: ['pois'], queryFn: () => unwrap(api.GET('/api/v1/pois')), ...STATIC })

export const useAreas = () =>
  useQuery({ queryKey: ['areas'], queryFn: () => unwrap(api.GET('/api/v1/areas')), ...STATIC })

// -- Predictions (deterministic for the same input, so cached as queries) --------------------------------------------
export const useSitePrediction = (body: SiteRequest | null) =>
  useQuery({
    queryKey: ['prediction', 'site', body],
    queryFn: () => unwrap(api.POST('/api/v1/predictions/site', { body: body! })),
    enabled: body !== null,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  })

export const useNewPoiPrediction = (body: NewPoiRequest | null) =>
  useQuery({
    queryKey: ['prediction', 'new-poi', body],
    queryFn: () => unwrap(api.POST('/api/v1/predictions/new-poi', { body: body! })),
    enabled: body !== null,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  })

export const useExistingPrediction = (nodeId: number | null) =>
  useQuery({
    queryKey: ['prediction', 'existing', nodeId],
    queryFn: () =>
      unwrap(api.GET('/api/v1/pois/{node_id}/prediction', { params: { path: { node_id: nodeId! } } })),
    enabled: nodeId !== null,
    placeholderData: keepPreviousData,
    ...STATIC,
  })

export const usePoiSearch = (q: string) =>
  useQuery({
    queryKey: ['pois', 'search', q],
    queryFn: () => unwrap(api.GET('/api/v1/pois/search', { params: { query: { q, limit: 25 } } })),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
    ...STATIC,
  })

export const useMarketGaps = (flaggedOnly: boolean) =>
  useQuery({
    queryKey: ['market-gaps', flaggedOnly],
    queryFn: () => unwrap(api.GET('/api/v1/market-gaps', { params: { query: { flagged_only: flaggedOnly } } })),
    placeholderData: keepPreviousData,
    ...STATIC,
  })

// -- Background jobs: start with a mutation, then poll until finished ------------------------------------------------
export const useStartSuggestion = () =>
  useMutation({ mutationFn: (body: SuggestRequest) => unwrap(api.POST('/api/v1/suggestions', { body })) })

export const useSuggestionJob = (jobId: string | null) =>
  useQuery<SuggestJob>({
    queryKey: ['job', 'suggest', jobId],
    queryFn: () => unwrap(api.GET('/api/v1/suggestions/{job_id}', { params: { path: { job_id: jobId! } } })),
    enabled: jobId !== null,
    refetchInterval: (query) => (isRunning(query.state.data) ? JOB_POLL_MS : false),
  })

export const useStartBatch = () =>
  useMutation({
    mutationFn: ({ file, mode }: { file: File; mode: Mode }) =>
      unwrap(
        api.POST('/api/v1/batch', {
          // FastAPI reads the upload as multipart form data
          body: { file: file as unknown as string, mode },
          bodySerializer: (b) => {
            const form = new FormData()
            form.append('file', b.file as unknown as File)
            form.append('mode', String(b.mode))
            return form
          },
        }),
      ),
  })

export const useBatchJob = (jobId: string | null) =>
  useQuery<BatchJob>({
    queryKey: ['job', 'batch', jobId],
    queryFn: () => unwrap(api.GET('/api/v1/batch/{job_id}', { params: { path: { job_id: jobId! } } })),
    enabled: jobId !== null,
    refetchInterval: (query) => (isRunning(query.state.data) ? JOB_POLL_MS : false),
  })

export const batchCsvUrl = (jobId: string) => `${API_BASE}/api/v1/batch/${jobId}/csv`
