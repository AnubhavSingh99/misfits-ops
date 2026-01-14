import { useState } from 'react'
import { X, Undo2, AlertTriangle, Loader2 } from 'lucide-react'

// =====================================================
// UNDO LINK MODAL
// Confirmation modal for unlinking a club from its launch target
// Options to keep or delete transferred targets
// =====================================================

interface UndoLinkModalProps {
  isOpen: boolean
  onClose: () => void
  launchName: string
  clubName: string
  matchType: 'auto' | 'manual' | 'legacy'
  onConfirm: (deleteTargets: boolean) => Promise<void>
}

export function UndoLinkModal({
  isOpen,
  onClose,
  launchName,
  clubName,
  matchType,
  onConfirm
}: UndoLinkModalProps) {
  const [deleteTargets, setDeleteTargets] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matchTypeLabel = {
    auto: 'Auto-matched',
    manual: 'Manually linked',
    legacy: 'Previously linked'
  }

  const handleConfirm = async () => {
    setLoading(true)
    setError(null)
    try {
      await onConfirm(deleteTargets)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo link')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Undo2 size={20} className="text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Undo Club Link</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-amber-100 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-gray-600 mb-4">
            Are you sure you want to unlink this launch from the club?
          </p>

          {/* Details */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 mb-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Launch Target</span>
              <span className="text-sm text-gray-900 font-medium truncate max-w-[200px]">{launchName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Linked to</span>
              <span className="text-sm text-gray-900 font-medium truncate max-w-[200px]">{clubName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Match type</span>
              <span className="text-sm text-gray-600">{matchTypeLabel[matchType]}</span>
            </div>
          </div>

          {/* Delete targets option */}
          <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200
            hover:border-amber-300 hover:bg-amber-50/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={deleteTargets}
              onChange={(e) => setDeleteTargets(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-amber-600 mt-0.5
                focus:ring-amber-500 focus:ring-offset-0"
            />
            <div>
              <span className="text-sm text-gray-700 font-medium">
                Also delete targets that were copied to the club
              </span>
              <div className="flex items-start gap-1.5 mt-1">
                <AlertTriangle size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-amber-600">
                  This may affect existing progress tracking
                </span>
              </div>
            </div>
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200
              rounded-lg transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg
              font-medium transition-colors flex items-center gap-2 disabled:opacity-50 text-sm"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Undo2 size={16} />
            )}
            Undo Link
          </button>
        </div>
      </div>
    </div>
  )
}

export default UndoLinkModal
