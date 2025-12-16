/**
 * @file ErrorOverlay
 *
 * Full-screen error overlay used when the application fails to load workplan data.
 */

type ErrorOverlayProps = {
  loadError: string | null
  onReload: () => void
}

/**
 * Displays a blocking error message with a reload action.
 */
export function ErrorOverlay({ loadError, onReload }: ErrorOverlayProps) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-50">
      <div className="text-center p-8 max-w-md">
        <div className="animate-pulse text-5xl mb-6">⚠️</div>
        <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">
          An error occurred
        </h2>
        <p className="text-gray-700 dark:text-gray-300 mb-6">
          {loadError || 'Workplan data not found'}
        </p>
        <button
          onClick={onReload}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          type="button"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
