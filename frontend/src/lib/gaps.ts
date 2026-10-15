import type { GapRow } from '../api/client'

/** Identity of a market_gaps.csv row: one per sub-district and category. */
export const gapKey = (g: GapRow) => `${g.adm2_pcode}|${g.category}`
