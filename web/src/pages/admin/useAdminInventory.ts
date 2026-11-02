// Inventory of lutins ready to sell (GET /api/admin/lutins — lutins without
// an auction, per docs/PLAN.md). Reload keeps the previous list until the
// answer arrives, so a refresh after a save never blanks the selector.

import { useCallback, useEffect, useState } from 'react'
import { API_PATHS, get } from '../../api/http'
import type { Lutin } from '../../socket/contract'
import { messageForError } from '../../ui/strings'

export interface UseAdminInventoryResult {
  /** Lutins without an auction; null while the first load is in flight. */
  lutins: Lutin[] | null
  /** French error message; null when the last load succeeded. */
  error: string | null
  reload: () => void
}

export function useAdminInventory(): UseAdminInventoryResult {
  const [lutins, setLutins] = useState<Lutin[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback((): void => {
    get<Lutin[]>(API_PATHS.adminLutins)
      .then((list) => {
        setLutins(list)
        setError(null)
      })
      .catch((cause: unknown) => {
        setError(messageForError(cause))
      })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { lutins, error, reload }
}
