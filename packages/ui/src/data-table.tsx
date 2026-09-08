import type { ReactNode } from 'react';

export function DataTable<T extends { id: string }>({
  caption,
  columns,
  rows,
  emptyLabel = 'No results match your search.',
}: {
  caption: string;
  columns: { key: string; label: ReactNode; render: (row: T) => ReactNode }[];
  rows: T[];
  emptyLabel?: string;
}) {
  return (
    <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
