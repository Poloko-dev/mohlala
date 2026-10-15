import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

/** Types of the API, generated from the backend's OpenAPI schema (npm run gen:api). */
export type Schemas = components['schemas']
export type Prediction = Schemas['Prediction']
export type ModePrediction = Schemas['ModePrediction']
export type CategoryScore = Schemas['CategoryScore']
export type LocationContext = Schemas['LocationContext']
export type Neighbour = Schemas['Neighbour']
export type GapRow = Schemas['GapRow']
export type PoiPoint = Schemas['PoiPoint']
export type PoiSummary = Schemas['PoiSummary']
export type Area = Schemas['Area']
export type ModelInfo = Schemas['ModelInfo']
export type SiteRequest = Schemas['SiteRequest']
export type NewPoiRequest = Schemas['NewPoiRequest']
export type SuggestRequest = Schemas['SuggestRequest']
export type SuggestJob = Schemas['SuggestJob']
export type SuggestedSite = Schemas['SuggestedSite']
export type BatchJob = Schemas['BatchJob']
export type BatchRow = Schemas['BatchRow']
export type Mode = ModePrediction['mode']

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export const api = createClient<paths>({ baseUrl: API_BASE })

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** The API's error detail: a message (model input errors) or FastAPI's list of validation errors. */
function detailOf(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('detail' in error)) return null
  const { detail } = error as { detail: unknown }
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((e: { loc?: (string | number)[]; msg?: string }) => `${(e.loc ?? []).slice(1).join('.')}: ${e.msg}`)
      .join('; ')
  }
  return null
}

/** Resolve an openapi-fetch call to its data, or throw an ApiError with the API's message. */
export async function unwrap<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let result: Awaited<typeof call>
  try {
    result = await call
  } catch {
    throw new ApiError('Cannot reach the API. Is the backend running (uvicorn app.main:app)?', 0)
  }
  const { data, error, response } = result
  if (error !== undefined || data === undefined) {
    throw new ApiError(detailOf(error) ?? `Request failed (${response.status} ${response.statusText})`, response.status)
  }
  return data
}
