import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link2, Undo2 } from 'lucide-react'

// =====================================================
// MATCHED LAUNCH INDICATOR
// Subtle icon shown on club rows that were matched from launch targets
// Hover reveals origin details + undo action
// =====================================================

interface MatchedLaunchInfo {
  launch_id: number
  original_name: string
  matched_at: string
  match_type: 'auto' | 'manual' | 'legacy'
}

interface MatchedLaunchIndicatorProps {
  matchedLaunch: MatchedLaunchInfo
  onUndo: () => void
  compact?: boolean
}

export function MatchedLaunchIndicator({ matchedLaunch, onUndo, compact = false }: MatchedLaunchIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null)
  const iconRef = useRef<HTMLButtonElement>(null)

  const handleMouseEnter = () => {
    if (iconRef.current) {
      setTooltipRect(iconRef.current.getBoundingClientRect())
    }
    setShowTooltip(true)
  }

  const handleMouseLeave = (e: React.MouseEvent) => {
    // Don't hide if moving to tooltip
    const relatedTarget = e.relatedTarget as HTMLElement
    if (relatedTarget?.closest('.matched-launch-tooltip')) return
    setShowTooltip(false)
    setTooltipRect(null)
  }

  const handleTooltipMouseLeave = () => {
    setShowTooltip(false)
    setTooltipRect(null)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const matchTypeLabel = {
    auto: 'Auto-matched',
    manual: 'Manually linked',
    legacy: 'Previously linked'
  }

  return (
    <>
      <button
        ref={iconRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`inline-flex items-center justify-center rounded transition-all duration-150
          text-sky-500 hover:text-sky-600 hover:bg-sky-50
          ${compact ? 'w-5 h-5' : 'w-6 h-6'}`}
        title="Matched from launch target"
      >
        <Link2 size={compact ? 12 : 14} strokeWidth={2.5} />
      </button>

      {/* Portal-based tooltip - escapes overflow:hidden */}
      {showTooltip && tooltipRect && createPortal(
        <div
          className="matched-launch-tooltip fixed z-[9999]"
          style={{
            left: tooltipRect.left + tooltipRect.width / 2,
            top: tooltipRect.bottom + 8,
            transform: 'translateX(-50%)',
          }}
          onMouseLeave={handleTooltipMouseLeave}
        >
          {/* Arrow pointing up */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-800" />

          {/* Content */}
          <div className="bg-gray-800 text-white rounded-lg shadow-xl overflow-hidden min-w-[220px]">
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-gray-700">
              <div className="flex items-center gap-2 text-sky-400 text-xs font-medium uppercase tracking-wide">
                <Link2 size={12} />
                Matched from Launch
              </div>
            </div>

            {/* Details */}
            <div className="px-3 py-2.5 space-y-1.5">
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Original Target</div>
                <div className="text-sm font-medium text-white truncate max-w-[200px]">
                  {matchedLaunch.original_name}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-300">
                <span>{matchTypeLabel[matchedLaunch.match_type]}</span>
                <span className="text-gray-500">|</span>
                <span>{formatDate(matchedLaunch.matched_at)}</span>
              </div>
            </div>

            {/* Undo Action */}
            <div className="px-3 py-2 bg-gray-900/50 border-t border-gray-700">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onUndo()
                  setShowTooltip(false)
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5
                  text-xs font-medium text-amber-400 hover:text-amber-300
                  hover:bg-amber-500/10 rounded transition-colors"
              >
                <Undo2 size={12} />
                Undo Match
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default MatchedLaunchIndicator
