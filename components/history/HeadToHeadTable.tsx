import type { HeadToHead } from '@/lib/history/recordsData'

export default function HeadToHeadTable({ headToHead }: { headToHead: HeadToHead[] }) {
  // Matrix rows/columns are the owners present in the head-to-head view, in name order.
  const owners = [
    ...new Map(headToHead.map((row) => [row.owner_id, row.owner_name])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]))
  const cell = new Map(headToHead.map((row) => [`${row.owner_id}|${row.opp_owner_id}`, row]))

  return (
    <section>
      <h2 className="pb-3 text-xl font-bold text-ink dark:text-gray-100">Head-to-head</h2>
      <p className="pb-3 text-sm text-gray-500">
        Each row shows the owner&apos;s record against the owner in each column. Playoff and
        consolation games are included.
      </p>
      <div className="overflow-x-auto">
        <table className="text-center text-xs">
          <thead>
            <tr>
              <th className="p-2" />
              {owners.map(([id, name]) => (
                <th key={id} className="p-2 font-medium text-gray-500">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {owners.map(([rowId, rowName]) => (
              <tr key={rowId} className="border-t border-gray-200 dark:border-gray-800">
                <th className="p-2 text-left font-medium">{rowName}</th>
                {owners.map(([colId]) => {
                  const record = cell.get(`${rowId}|${colId}`)
                  if (!record)
                    return (
                      <td key={colId} className="p-2 text-gray-300">
                        –
                      </td>
                    )
                  const tone =
                    record.wins > record.losses
                      ? 'text-green-600 dark:text-green-400'
                      : record.wins < record.losses
                        ? 'text-red-600 dark:text-red-400'
                        : ''
                  return (
                    <td key={colId} className={`p-2 tabular-nums ${tone}`}>
                      {record.wins}-{record.losses}
                      {record.ties > 0 ? `-${record.ties}` : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
