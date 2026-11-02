// Shared loading/failed block of the live pages: loading note, French failure
// message with a retry button. Renders nothing once ready.

import { ERROR_FALLBACK_MESSAGE, LOAD_STATE_TEXT } from '../ui/strings'
import type { LivePhase } from '../pages/useLiveSnapshot'

export interface LoadStateProps {
  phase: LivePhase
  /** French failure message; null falls back to the generic wording. */
  message: string | null
  onRetry: (() => void) | null
}

export function LoadState({ phase, message, onRetry }: LoadStateProps) {
  if (phase === 'loading') {
    return <p className="load-state">{LOAD_STATE_TEXT.loading}</p>
  }
  if (phase === 'failed') {
    return (
      <div className="load-state load-state--failed">
        <p className="form-error" role="alert">
          {message ?? ERROR_FALLBACK_MESSAGE}
        </p>
        {onRetry !== null && (
          <button type="button" className="button button--ghost" onClick={onRetry}>
            {LOAD_STATE_TEXT.retry}
          </button>
        )}
      </div>
    )
  }
  return null
}
