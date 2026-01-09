import { X, Info } from 'lucide-react'
import { MEETUP_STAGE_CONFIG, REVENUE_STATUS_CONFIG, MEETUP_STAGES_ORDERED } from '../../pages/ScalingPlannerV2'

// =====================================================
// STAGE INFO MODAL COMPONENT
// Shows explanation of all meetup stages and revenue status
// Triggered by clicking ℹ️ icon on column headers
// =====================================================

interface StageInfoModalProps {
  isOpen: boolean
  onClose: () => void
  type: 'meetup_stage' | 'revenue_status'
}

export function StageInfoModal({ isOpen, onClose, type }: StageInfoModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#1a1d21] border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 bg-[#22262b]">
          <div className="flex items-center gap-2">
            <Info size={20} className="text-blue-400" />
            <h3 className="text-lg font-bold text-white">
              {type === 'meetup_stage' ? 'Meetup Stage Guide' : 'Revenue Status Guide'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {type === 'meetup_stage' ? (
            <MeetupStageContent />
          ) : (
            <RevenueStatusContent />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-700 bg-[#22262b]">
          <p className="text-xs text-gray-400">
            {type === 'meetup_stage'
              ? 'Revenue moves with meetup stage. If meetup regresses to S4, its revenue also moves to S4 bucket.'
              : 'Realisation Gap = Target - Actual (min 0). Unattributed revenue needs a target to be created.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function MeetupStageContent() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-300 mb-4">
        Stages progress from ideation to realised. Colors indicate progress: 🔴 early → 🟡 mid → 🟢 done
      </p>

      {MEETUP_STAGES_ORDERED.map((stage) => (
        <div
          key={stage.key}
          className="flex items-start gap-3 p-3 rounded-lg bg-[#22262b] hover:bg-[#2a2e33] transition-colors"
        >
          <span
            className={`shrink-0 w-12 px-2 py-1 rounded text-xs font-bold text-center
              ${stage.color.bg} ${stage.color.text}`}
          >
            {stage.shortLabel}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-white">{stage.label}</div>
            <div className="text-sm text-gray-400">{stage.description}</div>
          </div>
        </div>
      ))}

      <div className="mt-4 p-3 rounded-lg bg-blue-900/30 border border-blue-800/50">
        <div className="text-sm font-medium text-blue-300">Stage Progression</div>
        <div className="text-xs text-blue-200/70 mt-1">
          NP → St → S1 → S2 → S3 → Realised ↔ S4
        </div>
        <div className="text-xs text-gray-400 mt-2">
          S4 (Regression) is bidirectional - meetups can recover back to Realised
        </div>
      </div>
    </div>
  )
}

function RevenueStatusContent() {
  const stageRevenuePills = MEETUP_STAGES_ORDERED.slice(0, -1) // Exclude 'realised' since it has special handling
  const revenueMetrics = Object.values(REVENUE_STATUS_CONFIG)

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-300">
        Revenue is tied to meetup stage. Each stage shows its target revenue potential.
      </p>

      {/* Stage Revenue Pills */}
      <div>
        <h4 className="text-sm font-medium text-gray-200 mb-2">Pipeline Revenue (by Stage)</h4>
        <div className="space-y-2">
          {stageRevenuePills.map((stage) => (
            <div
              key={stage.key}
              className="flex items-center gap-3 p-2 rounded-lg bg-[#22262b]"
            >
              <span
                className={`shrink-0 w-10 px-1.5 py-0.5 rounded text-[10px] font-bold text-center
                  ${stage.color.bg} ${stage.color.text}`}
              >
                {stage.shortLabel}
              </span>
              <div className="text-sm text-gray-300">
                Revenue potential at <span className="text-white">{stage.label}</span> stage
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue Metrics (RG, UA, RA) */}
      <div>
        <h4 className="text-sm font-medium text-gray-200 mb-2">Realised Metrics</h4>
        <div className="space-y-2">
          {revenueMetrics.map((metric) => (
            <div
              key={metric.key}
              className="flex items-start gap-3 p-3 rounded-lg bg-[#22262b]"
            >
              <span
                className={`shrink-0 w-10 px-1.5 py-0.5 rounded text-[10px] font-bold text-center
                  ${metric.color.bg} ${metric.color.text}`}
              >
                {metric.shortLabel}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white">{metric.label}</div>
                <div className="text-sm text-gray-400">{metric.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Order explanation */}
      <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-800/50">
        <div className="text-sm font-medium text-amber-300">Pill Order</div>
        <div className="text-xs text-amber-200/70 mt-1 font-mono">
          [NP] [St] [S1] [S2] [S3] [S4] [RG] [UA] [RA]
        </div>
        <div className="text-xs text-gray-400 mt-2">
          Pipeline stages first, then Gap, Unattributed, and finally Realised Actual
        </div>
      </div>
    </div>
  )
}

// Info icon button component for column headers
interface InfoIconButtonProps {
  onClick: () => void
  className?: string
}

export function InfoIconButton({ onClick, className = '' }: InfoIconButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`p-0.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-blue-400 transition-colors ${className}`}
      title="Show guide"
    >
      <Info size={14} />
    </button>
  )
}

export default StageInfoModal
