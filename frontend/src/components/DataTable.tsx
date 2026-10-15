import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  /** Right-aligned tabular figures. */
  num?: boolean
  render: (row: T) => ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  selectedKey?: string | number | null
  caption?: string
  scroll?: boolean
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, selectedKey, caption, scroll }: DataTableProps<T>) {
  const table = (
    <table className="table">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.num ? 'num' : undefined} scope="col">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = rowKey(row)
          const classes = [onRowClick && 'clickable', key === selectedKey && 'selected'].filter(Boolean).join(' ')
          return (
            <tr
              key={key}
              className={classes || undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              aria-selected={onRowClick ? key === selectedKey : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
  return <div className={scroll ? 'table-wrap table-scroll' : 'table-wrap'}>{table}</div>
}
