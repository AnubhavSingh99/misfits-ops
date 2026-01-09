import { X, Rocket, MapPin } from 'lucide-react'

interface AddChoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onNewLaunch: () => void
  onExpandClub: () => void
  areaName?: string
}

export function AddChoiceModal({ isOpen, onClose, onNewLaunch, onExpandClub, areaName }: AddChoiceModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-bold text-gray-900">What would you like to add?</h3>
            {areaName && (
              <p className="text-sm text-gray-500">in {areaName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Options */}
        <div className="p-6 space-y-3">
          {/* New Club Launch Option */}
          <button
            onClick={() => {
              onNewLaunch()
              onClose()
            }}
            className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-violet-400
              hover:bg-violet-50 transition-all group text-left"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center
                group-hover:bg-violet-200 transition-colors flex-shrink-0">
                <Rocket size={20} className="text-violet-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 group-hover:text-violet-700 transition-colors">
                  New Club Launch
                </h4>
                <p className="text-sm text-gray-500 mt-0.5">
                  Plan a brand new club in this area
                </p>
              </div>
            </div>
          </button>

          {/* Expand Existing Club Option */}
          <button
            onClick={() => {
              onExpandClub()
              onClose()
            }}
            className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-emerald-400
              hover:bg-emerald-50 transition-all group text-left"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center
                group-hover:bg-emerald-200 transition-colors flex-shrink-0">
                <MapPin size={20} className="text-emerald-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors">
                  Expand Existing Club
                </h4>
                <p className="text-sm text-gray-500 mt-0.5">
                  Add target for an existing club to operate here
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddChoiceModal
