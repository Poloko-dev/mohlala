import type { GapRow } from '../api/client'
import { num, signed } from '../lib/format'
import { gapKey } from '../lib/gaps'
import { DataTable, type Column } from './DataTable'

export function SignalBadge({ signal }: { signal: GapRow['signal'] }) {
  if (!signal) return <span className="hint">—</span>
  return (
    <span className="badge">
      <span className={`swatch swatch-${signal}`} aria-hidden />
      {signal === 'gap' ? 'Gap' : 'Cluster'}
    </span>
  )
}

export function MappingBadge({ mapping }: { mapping: GapRow['mapping'] }) {
  return mapping ? (
    <span className="badge" title="Mapping quality in the lowest quarter of sub-districts: a gap may be missing data">
      thin
    </span>
  ) : null
}

interface GapTableProps {
  rows: GapRow[]
  showArea?: boolean
  onRowClick?: (row: GapRow) => void
  selectedKey?: string | null
  scroll?: boolean
}

/** Rows of market_gaps.csv: expected against observed POIs per sub-district and category. */
export function GapTable({ rows, showArea = true, onRowClick, selectedKey, scroll }: GapTableProps) {
  const columns: Column<GapRow>[] = [
    ...(showArea
      ? [
          {
            key: 'area',
            header: 'Sub-district',
            render: (g: GapRow) => (
              <span title={`${g.adm1_name} district`}>
                {g.adm2_name} <span className="hint">{g.adm2_pcode}</span>
              </span>
            ),
          },
        ]
      : []),
    { key: 'category', header: 'Category', render: (g) => g.category },
    {
      key: 'signal',
      header: 'Signal',
      render: (g) => (
        <span className="row nowrap">
          <SignalBadge signal={g.signal} />
          <MappingBadge mapping={g.mapping} />
        </span>
      ),
    },
    { key: 'observed', header: 'Obs.', num: true, render: (g) => g.observed },
    { key: 'expected', header: 'Exp.', num: true, render: (g) => num(g.expected, 1) },
    { key: 'gap', header: 'Gap', num: true, render: (g) => signed(g.gap) },
    { key: 'z', header: 'z', num: true, render: (g) => signed(g.z, 2) },
  ]
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={gapKey}
      onRowClick={onRowClick}
      selectedKey={selectedKey}
      scroll={scroll}
      caption="Market gaps and clusters"
    />
  )
}
