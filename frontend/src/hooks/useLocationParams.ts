import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { coordParam, inLesotho } from '../lib/geo'

/**
 * The analysed location lives in the URL (?lat=..&lon=..), so results can be shared and survive a reload; the form
 * keeps an editable draft that follows the URL whenever the URL changes (map click, back/forward navigation).
 */
export function useLocationParams() {
  const [params, setParams] = useSearchParams()
  const lat = coordParam(params, 'lat')
  const lon = coordParam(params, 'lon')
  const urlKey = `${lat ?? ''},${lon ?? ''}`

  const [draft, setDraft] = useState({ lat: lat?.toString() ?? '', lon: lon?.toString() ?? '' })
  const [draftKey, setDraftKey] = useState(urlKey)
  if (draftKey !== urlKey) {
    // Adjust state while rendering (not in an effect) when the URL moves on
    setDraftKey(urlKey)
    setDraft({ lat: lat?.toString() ?? '', lon: lon?.toString() ?? '' })
  }

  /** Put a location (and any other parameters) in the URL. */
  const commit = (next: { lat: number; lon: number } & Record<string, string | number | boolean | null | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) {
      if (v !== null && v !== undefined && v !== '' && v !== false) p.set(k, v === true ? '1' : String(v))
    }
    setParams(p)
  }

  /** Validate the draft; returns the coordinates or an error message. */
  const parseDraft = (): { lat: number; lon: number } | string => {
    const la = Number(draft.lat)
    const lo = Number(draft.lon)
    if (draft.lat.trim() === '' || draft.lon.trim() === '' || !Number.isFinite(la) || !Number.isFinite(lo)) {
      return 'Enter a latitude and a longitude, or click the map.'
    }
    if (!inLesotho(la, lo)) return `(${la}, ${lo}) is outside Lesotho.`
    return { lat: la, lon: lo }
  }

  return { params, lat, lon, draft, setDraft, commit, parseDraft }
}
