import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { RevenueStatus, RevenueStatusDisplay } from '../../../shared/types'
import { MEETUP_STAGE_CONFIG, REVENUE_STATUS_CONFIG, type MeetupStageKey } from '../../pages/ScalingPlannerV2'

// =====================================================
// REVENUE STATUS PILLS COMPONENT
// Shows revenue by stage + realisation metrics as pills
// Order: [NP][St][S1][S2][S3][S4][RG][UA][RA]
// =====================================================

interface RevenueStatusPillsProps {
  revenueStatus?: RevenueStatus
  compact?: boolean
  showZeros?: boolean
}

// Format amount in ₹K with 1 decimal place
// Note: Backend returns values in rupees, not paisa
function formatAmount(amountInRupees: number): string | null {
  if (!amountInRupees || amountInRupees === 0) return null
  const amountInK = amountInRupees / 1000
  if (amountInK >= 100) {
    // Show as Lakh for large amounts (100K+ = 1L)
    const amountInL = amountInK / 100
    return `${amountInL.toFixed(1)}L`
  }
  return `${amountInK.toFixed(1)}K`
}

// Format full amount for tooltip
function formatFullAmount(amountInRupees: number): string {
  if (!amountInRupees || amountInRupees === 0) return '₹0'
  return `₹${amountInRupees.toLocaleString('en-IN')}`
}

// Individual pill component with portal-based tooltip (escapes overflow:hidden)
interface PillProps {
  label: string
  value: string | null
  fullValue: string
  description: string
  bgColor: string
  textColor: string
  glowColor?: string
  count?: number
}

function Pill({ label, value, fullValue, description, bgColor, textColor, glowColor, count }: PillProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null)
  const pillRef = useRef<HTMLSpanElement>(null)

  if (!value) return null

  const handleMouseEnter = () => {
    if (pillRef.current) {
      setTooltipRect(pillRef.current.getBoundingClientRect())
    }
    setShowTooltip(true)
  }

  const handleMouseLeave = () => {
    setShowTooltip(false)
    setTooltipRect(null)
  }

  return (
    <div className="relative">
      <span
        ref={pillRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold
          ${bgColor} ${textColor} ${glowColor ? `shadow-sm ${glowColor}` : ''}
          transition-all duration-200 hover:scale-105 cursor-default`}
      >
        <span className="opacity-80">{label}</span>
        <span className="font-mono">{value}</span>
      </span>

      {/* Portal-based tooltip - renders to body to escape overflow:hidden */}
      {showTooltip && tooltipRect && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: tooltipRect.left + tooltipRect.width / 2,
            top: tooltipRect.top - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-xl whitespace-nowrap">
            <div className="font-bold">{label} - {description}</div>
            <div className="mt-1">Revenue: {fullValue}</div>
            {count !== undefined && <div>Meetups: {count}</div>}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>,
        document.body
      )}
    </div>
  )
}

export function RevenueStatusPills({ revenueStatus, compact = false, showZeros = false }: RevenueStatusPillsProps) {
  if (!revenueStatus) {
    return <span className="text-gray-500 text-xs italic">No revenue data</span>
  }

  // Stage pills (use same colors as meetup stage)
  const stagePills: { key: MeetupStageKey; value: number }[] = [
    { key: 'not_picked', value: revenueStatus.np },
    { key: 'started', value: revenueStatus.st },
    { key: 'stage_1', value: revenueStatus.s1 },
    { key: 'stage_2', value: revenueStatus.s2 },
    { key: 'stage_3', value: revenueStatus.s3 },
    { key: 'stage_4', value: revenueStatus.s4 },
  ]

  // Revenue status pills (RG, UA, RA)
  const revenueMetricPills = [
    {
      key: 'realisation_gap',
      value: revenueStatus.realisation_gap,
      config: REVENUE_STATUS_CONFIG.realisation_gap
    },
    {
      key: 'unattributed',
      value: revenueStatus.unattributed,
      config: REVENUE_STATUS_CONFIG.unattributed
    },
    {
      key: 'realised_actual',
      value: revenueStatus.realised_actual,
      config: REVENUE_STATUS_CONFIG.realised_actual
    },
  ]

  const hasAnyValue = stagePills.some(p => p.value > 0) || revenueMetricPills.some(p => p.value > 0)

  if (!hasAnyValue && !showZeros) {
    return <span className="text-gray-500 text-xs italic">-</span>
  }

  return (
    <div className={`flex flex-wrap gap-1 ${compact ? 'min-w-[160px]' : ''}`}>
      {/* Stage revenue pills */}
      {stagePills.map(({ key, value }) => {
        const config = MEETUP_STAGE_CONFIG[key]
        const formattedValue = formatAmount(value)
        if (!formattedValue && !showZeros) return null

        return (
          <Pill
            key={key}
            label={config.shortLabel}
            value={formattedValue || '0'}
            fullValue={formatFullAmount(value)}
            description={config.description}
            bgColor={config.color.bg}
            textColor={config.color.text}
            glowColor={config.color.glow}
          />
        )
      })}

      {/* Revenue metric pills (RG, UA, RA) */}
      {revenueMetricPills.map(({ key, value, config }) => {
        const formattedValue = formatAmount(value)
        if (!formattedValue && !showZeros) return null

        return (
          <Pill
            key={key}
            label={config.shortLabel}
            value={formattedValue || '0'}
            fullValue={formatFullAmount(value)}
            description={config.description}
            bgColor={config.color.bg}
            textColor={config.color.text}
            glowColor={config.color.glow}
          />
        )
      })}
    </div>
  )
}

// Helper function to calculate revenue status display from RevenueStatus
export function getRevenueStatusDisplay(revenueStatus: RevenueStatus): RevenueStatusDisplay {
  return {
    np: formatAmount(revenueStatus.np),
    st: formatAmount(revenueStatus.st),
    s1: formatAmount(revenueStatus.s1),
    s2: formatAmount(revenueStatus.s2),
    s3: formatAmount(revenueStatus.s3),
    s4: formatAmount(revenueStatus.s4),
    rg: formatAmount(revenueStatus.realisation_gap),
    ua: formatAmount(revenueStatus.unattributed),
    ra: formatAmount(revenueStatus.realised_actual),
  }
}

// Helper function to create empty revenue status
export function createEmptyRevenueStatus(): RevenueStatus {
  return {
    np: 0,
    st: 0,
    s1: 0,
    s2: 0,
    s3: 0,
    s4: 0,
    realised_target: 0,
    realised_actual: 0,
    realisation_gap: 0,
    unattributed: 0,
    total_pipeline: 0,
    total_target: 0,
  }
}

// Helper function to merge/rollup revenue statuses (for hierarchy)
export function rollupRevenueStatuses(statuses: RevenueStatus[]): RevenueStatus {
  return statuses.reduce((acc, status) => ({
    np: acc.np + (status.np || 0),
    st: acc.st + (status.st || 0),
    s1: acc.s1 + (status.s1 || 0),
    s2: acc.s2 + (status.s2 || 0),
    s3: acc.s3 + (status.s3 || 0),
    s4: acc.s4 + (status.s4 || 0),
    realised_target: acc.realised_target + (status.realised_target || 0),
    realised_actual: acc.realised_actual + (status.realised_actual || 0),
    realisation_gap: acc.realisation_gap + (status.realisation_gap || 0),
    unattributed: acc.unattributed + (status.unattributed || 0),
    total_pipeline: acc.total_pipeline + (status.total_pipeline || 0),
    total_target: acc.total_target + (status.total_target || 0),
  }), createEmptyRevenueStatus())
}

export default RevenueStatusPills
