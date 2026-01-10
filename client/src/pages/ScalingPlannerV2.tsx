import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  ClipboardList,
  CheckCircle,
  AlertTriangle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Activity,
  MapPin,
  Building2,
  Users,
  Loader2,
  RefreshCw,
  X,
  Edit3,
  Save,
  Rocket,
  ToggleLeft,
  ToggleRight,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MessageSquarePlus
} from 'lucide-react'
import type {
  HierarchyNode,
  HierarchyResponse,
  TrendsResponse,
  StageProgress,
  ValidationStatus,
  ScalingTaskSummary
} from '../../shared/types'
import { SprintViewModal, TaskSummaryCell, ScalingTaskCreateModal, SummaryTiles, HierarchyFilterBar, HierarchyRollupHeader, RevenueStatusPills, DayTypeTags, StageInfoModal, InfoIconButton, buildRolledUpSummaryMap, buildSummaryKey, type HierarchyFilters, type HierarchyLevel, type HealthFilter, MeetupDetailsTooltip, ExpandClubModal, AddChoiceModal, type ExpandClubTargetData, WeekSelector, getWeekBounds, formatWeekLabel, type WeekOption, HealthDot, HealthDistributionBar, HealthInfoModal, type HealthStatus, TaskListTooltip } from '../components/scaling'
import { getTeamForClub, type TeamKey } from '../../shared/teamConfig'
import { DimensionalTargetsService } from '../services/api'
import FeedbackModal from '../components/FeedbackModal'

// Format date as YYYY-MM-DD in LOCAL timezone (IST)
// IMPORTANT: Do NOT use toISOString() as it converts to UTC,
// which shifts dates back by 5:30 hours for IST timezone
function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// =====================================================
// SORTABLE TABLE HEADER CONFIGURATION
// =====================================================
type SortColumn = 'name' | 'health_score' | 'target_meetups' | 'current_meetups' | 'gap_meetups' | 'l4w_revenue'
type SortDirection = 'asc' | 'desc' | null

interface SortState {
  column: SortColumn | null
  direction: SortDirection
}

interface SortableHeaderProps {
  label: string
  column: SortColumn
  currentSort: SortState
  onSort: (column: SortColumn) => void
  align?: 'left' | 'right' | 'center'
}

function SortableHeader({ label, column, currentSort, onSort, align = 'left' }: SortableHeaderProps) {
  const isActive = currentSort.column === column
  const direction = isActive ? currentSort.direction : null

  return (
    <th
      className={`py-3 px-4 text-xs font-semibold uppercase tracking-wider
        cursor-pointer select-none group
        transition-all duration-200
        ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}
        ${isActive ? 'text-indigo-700 bg-indigo-50/50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/50'}`}
      onClick={() => onSort(column)}
    >
      <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
        <span className="transition-colors duration-200">{label}</span>
        <div className={`
          flex items-center justify-center w-4 h-4 rounded
          transition-all duration-200 ease-out
          ${isActive
            ? 'bg-indigo-100 text-indigo-600'
            : 'text-gray-300 group-hover:text-gray-500 group-hover:bg-gray-100'
          }
        `}>
          {direction === 'asc' ? (
            <ArrowUp size={12} className="transition-transform duration-200" />
          ) : direction === 'desc' ? (
            <ArrowDown size={12} className="transition-transform duration-200" />
          ) : (
            <ArrowUpDown size={10} className="opacity-60 group-hover:opacity-100 transition-opacity duration-200" />
          )}
        </div>
      </div>
    </th>
  )
}

// Sort hierarchy nodes within each level (preserves tree structure)
function sortHierarchy(nodes: HierarchyNode[], sortState: SortState): HierarchyNode[] {
  if (!sortState.column || !sortState.direction) return nodes

  const { column, direction } = sortState
  const multiplier = direction === 'asc' ? 1 : -1

  const sortNodes = (items: HierarchyNode[]): HierarchyNode[] => {
    const sorted = [...items].sort((a, b) => {
      let aVal: number | string
      let bVal: number | string

      switch (column) {
        case 'name':
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          return multiplier * aVal.localeCompare(bVal)
        case 'health_score':
          // Sort by health score, put undefined/null at the end
          aVal = a.health_score ?? -1
          bVal = b.health_score ?? -1
          break
        case 'target_meetups':
          aVal = a.target_meetups ?? 0
          bVal = b.target_meetups ?? 0
          break
        case 'current_meetups':
          aVal = a.current_meetups ?? 0
          bVal = b.current_meetups ?? 0
          break
        case 'gap_meetups':
          aVal = a.gap_meetups ?? 0
          bVal = b.gap_meetups ?? 0
          break
        case 'l4w_revenue':
          aVal = a.last_4w_revenue_total ?? 0
          bVal = b.last_4w_revenue_total ?? 0
          break
        default:
          return 0
      }

      return multiplier * ((aVal as number) - (bVal as number))
    })

    // Recursively sort children
    return sorted.map(node => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined
    }))
  }

  return sortNodes(nodes)
}

// =====================================================
// MEETUP STAGE CONFIGURATION - SINGLE SOURCE OF TRUTH
// Keys match database schema (progress JSONB column)
// Colors: Red → Orange → Amber → Green progression (S4 = Purple for regression)
// Update labels/colors here to change across the app
// =====================================================
export const MEETUP_STAGE_CONFIG = {
  not_picked: {
    key: 'not_picked',
    label: 'Not Picked',
    shortLabel: 'NP',
    description: 'Ideation phase - concept identified',
    order: 0,
    // Deep red - earliest stage, highest risk
    color: { bg: 'bg-red-600', text: 'text-white', hex: '#dc2626', glow: 'shadow-red-600/40' }
  },
  started: {
    key: 'started',
    label: 'Started',
    shortLabel: 'St',
    description: 'Work has begun on this meetup',
    order: 1,
    // Red-orange - early progress
    color: { bg: 'bg-orange-600', text: 'text-white', hex: '#ea580c', glow: 'shadow-orange-600/40' }
  },
  stage_1: {
    key: 'stage_1',
    label: 'Leaders Found',
    shortLabel: 'S1',
    description: 'Leader recruitment completed',
    order: 2,
    // Orange - making progress
    color: { bg: 'bg-orange-500', text: 'text-white', hex: '#f97316', glow: 'shadow-orange-500/40' }
  },
  stage_2: {
    key: 'stage_2',
    label: 'Venue Found',
    shortLabel: 'S2',
    description: 'Venue confirmed and booked',
    order: 3,
    // Amber - good progress
    color: { bg: 'bg-amber-500', text: 'text-white', hex: '#f59e0b', glow: 'shadow-amber-500/40' }
  },
  stage_3: {
    key: 'stage_3',
    label: 'Launch Ready',
    shortLabel: 'S3',
    description: 'All formalities done, ready to start',
    order: 4,
    // Yellow-green - almost there
    color: { bg: 'bg-lime-500', text: 'text-white', hex: '#84cc16', glow: 'shadow-lime-500/40' }
  },
  stage_4: {
    key: 'stage_4',
    label: 'Regression',
    shortLabel: 'S4',
    description: 'Was running, now paused/stopped',
    order: 5,
    // Purple - special case for regression
    color: { bg: 'bg-purple-600', text: 'text-white', hex: '#9333ea', glow: 'shadow-purple-600/40' }
  },
  realised: {
    key: 'realised',
    label: 'Realised',
    shortLabel: '✓',
    description: 'Meetups actively happening',
    order: 6,
    // Green - success
    color: { bg: 'bg-green-500', text: 'text-white', hex: '#22c55e', glow: 'shadow-green-500/40' }
  },
  unattributed_meetups: {
    key: 'unattributed_meetups',
    label: 'Unattributed',
    shortLabel: 'UA',
    description: 'Meetups which could not be auto matched to any target',
    order: 7,
    // Blue - special case for excess/unattributed
    color: { bg: 'bg-blue-500', text: 'text-white', hex: '#3b82f6', glow: 'shadow-blue-500/40' }
  }
} as const

// Backwards compatibility alias
export const STAGE_CONFIG = MEETUP_STAGE_CONFIG

// Type for meetup stage keys (matches database schema)
export type MeetupStageKey = keyof typeof MEETUP_STAGE_CONFIG
export type StageKey = MeetupStageKey // Backwards compatibility

// Helper to get ordered stages array
export const MEETUP_STAGES_ORDERED = Object.values(MEETUP_STAGE_CONFIG).sort((a, b) => a.order - b.order)
export const STAGES_ORDERED = MEETUP_STAGES_ORDERED // Backwards compatibility

// =====================================================
// REVENUE STATUS CONFIGURATION
// Order: [NP][St][S1][S2][S3][S4][RG][UA][RA]
// =====================================================
export const REVENUE_STATUS_CONFIG = {
  realisation_gap: {
    key: 'realisation_gap',
    label: 'Realisation Gap',
    shortLabel: 'RG',
    description: 'Target revenue - Actual revenue (money left on table)',
    order: 0,
    color: { bg: 'bg-rose-500', text: 'text-white', hex: '#f43f5e', glow: 'shadow-rose-500/40' }
  },
  unattributed: {
    key: 'unattributed',
    label: 'Unattributed',
    shortLabel: 'UA',
    description: 'Revenue that couldn\'t match to any target',
    order: 1,
    color: { bg: 'bg-green-300', text: 'text-green-900', hex: '#86efac', glow: 'shadow-green-300/40' }
  },
  realised_actual: {
    key: 'realised_actual',
    label: 'Realised Actual',
    shortLabel: 'RA',
    description: 'Actual revenue collected',
    order: 2,
    color: { bg: 'bg-emerald-500', text: 'text-white', hex: '#10b981', glow: 'shadow-emerald-500/40' }
  }
} as const

export type RevenueStatusKey = keyof typeof REVENUE_STATUS_CONFIG

// =====================================================
// TOOLTIP COMPONENT
// =====================================================
interface TooltipProps {
  children: React.ReactNode
  text: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

function Tooltip({ children, text, position = 'top' }: TooltipProps) {
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-800 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-800 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-800 border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-800 border-y-transparent border-l-transparent'
  }

  return (
    <div className="relative group/tooltip inline-block">
      {children}
      <div className={`absolute ${positionClasses[position]} z-50 pointer-events-none
        opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-200`}>
        <div className="bg-gray-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-md shadow-lg whitespace-nowrap">
          {text}
        </div>
        <div className={`absolute ${arrowClasses[position]} border-4`} />
      </div>
    </div>
  )
}

// =====================================================
// STAGE PILL COMPONENT
// =====================================================
interface StagePillProps {
  stage: StageKey
  count: number
}

function StagePill({ stage, count }: StagePillProps) {
  if (count === 0) return null
  const config = STAGE_CONFIG[stage] || STAGE_CONFIG.not_picked

  return (
    <Tooltip text={`${config.label}: ${config.description}`} position="top">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold
          ${config.color.bg} ${config.color.text} shadow-sm ${config.color.glow}
          transition-all duration-200 hover:scale-110 hover:shadow-md`}
      >
        <span className="opacity-70">{config.shortLabel}</span>
        <span className="font-mono">{count}</span>
      </span>
    </Tooltip>
  )
}

// =====================================================
// STAGE DISTRIBUTION COMPONENT
// =====================================================
interface StageDistributionProps {
  progress: StageProgress & { unattributed_meetups?: number }
  compact?: boolean
}

function StageDistribution({ progress, compact = false }: StageDistributionProps) {
  // Use STAGES_ORDERED to ensure consistent ordering from single source of truth
  // Cast progress to include unattributed_meetups
  const progressWithUA = progress as StageProgress & { unattributed_meetups?: number }
  const stages = STAGES_ORDERED
    .map(stage => ({ key: stage.key as StageKey, count: (progressWithUA as any)[stage.key] || 0 }))
    .filter(s => s.count > 0)

  if (stages.length === 0) {
    return <span className="text-gray-400 text-sm italic">No stages</span>
  }

  return (
    <div className={`flex flex-wrap gap-1 ${compact ? 'max-w-[200px]' : ''}`}>
      {stages.map(s => (
        <StagePill key={s.key} stage={s.key} count={s.count} />
      ))}
    </div>
  )
}

// =====================================================
// VALIDATION INDICATOR COMPONENT
// =====================================================
interface ValidationIndicatorProps {
  status: ValidationStatus
  message?: string
}

function ValidationIndicator({ status, message }: ValidationIndicatorProps) {
  if (status === 'valid') {
    return (
      <div className="flex items-center gap-1 text-emerald-400">
        <CheckCircle size={16} className="drop-shadow-[0_0_4px_rgba(52,211,153,0.5)]" />
      </div>
    )
  }

  if (status === 'needs_update') {
    return (
      <div className="group/status relative flex items-center gap-1 text-amber-500 cursor-help">
        <AlertTriangle size={16} className="drop-shadow-[0_0_4px_rgba(251,191,36,0.5)] animate-pulse" />
        {message && (
          <div className="absolute bottom-full right-0 mb-2 hidden group-hover/status:block z-40">
            <div className="bg-white border border-amber-400 text-amber-700 text-xs px-3 py-2 rounded-lg shadow-xl whitespace-nowrap">
              {message}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="group/status relative flex items-center gap-1 text-red-500 cursor-help">
      <XCircle size={16} className="drop-shadow-[0_0_4px_rgba(248,113,113,0.5)]" />
      {message && (
        <div className="absolute bottom-full right-0 mb-2 hidden group-hover/status:block z-40">
          <div className="bg-white border border-red-400 text-red-700 text-xs px-3 py-2 rounded-lg shadow-xl whitespace-nowrap">
            {message}
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// STAGE EDITOR MODAL COMPONENT
// =====================================================
interface StageEditorModalProps {
  isOpen: boolean
  onClose: () => void
  node: HierarchyNode | null
  onSave: (progress: StageProgress) => Promise<void>
}

function StageEditorModal({ isOpen, onClose, node, onSave }: StageEditorModalProps) {
  const [progress, setProgress] = useState<StageProgress>({
    not_picked: 0,
    started: 0,
    stage_1: 0,
    stage_2: 0,
    stage_3: 0,
    stage_4: 0,
    realised: 0
  })
  const [saving, setSaving] = useState(false)

  // Reset form when node changes
  useEffect(() => {
    if (node) {
      setProgress({ ...node.progress_summary })
    }
  }, [node])

  if (!isOpen || !node) return null

  const handleChange = (key: StageKey, value: number) => {
    setProgress(prev => ({
      ...prev,
      [key]: Math.max(0, value)
    }))
  }

  // Calculate total of ALL stages (must equal target_meetups)
  const totalAllStages = progress.not_picked + progress.started +
    progress.stage_1 + progress.stage_2 + progress.stage_3 + progress.stage_4 + progress.realised
  const targetMeetups = node.target_meetups
  const isValidDistribution = totalAllStages === targetMeetups
  const difference = totalAllStages - targetMeetups

  const handleSave = async () => {
    // Prevent save if distribution doesn't match target
    if (!isValidDistribution) {
      return
    }
    setSaving(true)
    try {
      await onSave(progress)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // Legacy validation for display (in-progress stages vs gap)
  const totalInProgress = progress.not_picked + progress.started +
    progress.stage_1 + progress.stage_2 + progress.stage_3 + progress.stage_4
  const gap = Math.max(0, node.target_meetups - node.current_meetups)
  const isOverAllocated = totalInProgress > gap

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Edit Stage Distribution</h3>
            <p className="text-sm text-gray-500">{node.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stats Row */}
        <div className="px-6 py-3 bg-gray-100 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-sm text-gray-500">Target</div>
            <div className="font-bold text-gray-900">{node.target_meetups}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Current</div>
            <div className="font-bold text-gray-900">{node.current_meetups}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Gap</div>
            <div className={`font-bold ${gap > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{gap}</div>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-3">
          {STAGES_ORDERED.map(stage => {
            const config = STAGE_CONFIG[stage.key as StageKey]
            return (
              <div key={stage.key} className="flex items-center gap-3">
                <span
                  className={`w-24 px-2 py-1 rounded text-xs font-bold text-center
                    ${config.color.bg} ${config.color.text}`}
                >
                  {config.label}
                </span>
                <input
                  type="number"
                  min="0"
                  value={progress[stage.key as keyof StageProgress] || 0}
                  onChange={(e) => handleChange(stage.key as StageKey, parseInt(e.target.value) || 0)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                    focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )
          })}
        </div>

        {/* Distribution Sum Indicator */}
        <div className="mx-6 mb-4">
          <div className={`px-4 py-3 rounded-lg border ${
            isValidDistribution
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isValidDistribution ? (
                  <CheckCircle size={18} className="text-emerald-600" />
                ) : (
                  <AlertTriangle size={18} className="text-red-600" />
                )}
                <span className={`text-sm font-medium ${
                  isValidDistribution ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  Stage Sum: {totalAllStages} / Target: {targetMeetups}
                </span>
              </div>
              {!isValidDistribution && (
                <span className="text-sm font-bold text-red-700">
                  {difference > 0 ? `+${difference} over` : `${Math.abs(difference)} under`}
                </span>
              )}
            </div>
            {!isValidDistribution && (
              <p className="text-xs text-red-600 mt-1">
                Stage distribution must equal target meetups to save
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isValidDistribution}
            className={`px-4 py-2 text-white rounded-lg font-medium transition-colors
              flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed
              ${isValidDistribution
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-400'}`}
            title={!isValidDistribution ? 'Stage distribution must equal target meetups' : ''}
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// QUICK ADD TARGET MODAL COMPONENT
// =====================================================
interface QuickAddContext {
  activity_id?: number
  activity_name?: string
  city_id?: number
  city_name?: string
  area_id?: number
  area_name?: string
  club_id?: number
  club_name?: string
  node_type: string
}

interface QuickAddModalProps {
  isOpen: boolean
  onClose: () => void
  context: QuickAddContext | null
  onSave: (data: { club_id: number; target_meetups: number; target_revenue: number; meetup_cost: number; meetup_capacity: number; area_id: number; activity_id: number; name?: string; day_type_id?: number | null }) => Promise<void>
}

interface ExistingTarget {
  id: number
  name: string | null
  target_meetups: number
  meetup_cost: number | null
  meetup_capacity: number | null
  target_revenue: number
}

function QuickAddModal({ isOpen, onClose, context, onSave }: QuickAddModalProps) {
  const [targetMeetups, setTargetMeetups] = useState<number>(1)
  const [meetupCost, setMeetupCost] = useState<number>(200)
  const [meetupCapacity, setMeetupCapacity] = useState<number>(15)
  const [targetName, setTargetName] = useState<string>('')
  const [defaultsSource, setDefaultsSource] = useState<string>('default')
  const [loadingDefaults, setLoadingDefaults] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingTargets, setExistingTargets] = useState<ExistingTarget[]>([])
  // Day type state
  const [dayTypes, setDayTypes] = useState<{ id: number; name: string }[]>([])
  const [selectedDayTypeId, setSelectedDayTypeId] = useState<number | null>(null)
  const [loadingDayTypes, setLoadingDayTypes] = useState(false)

  // Capitalize day type name helper
  const capitalizeDayType = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

  // Calculate revenue from inputs
  const calculatedRevenue = targetMeetups * meetupCost * meetupCapacity

  // Check if current values match an existing target
  const matchingTarget = existingTargets.find(t =>
    t.meetup_cost === meetupCost && t.meetup_capacity === meetupCapacity
  )

  // Fetch existing targets for this club
  useEffect(() => {
    if (context?.club_id) {
      fetch(`/api/targets/clubs/${context.club_id}/dimensional`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.dimensional_targets) {
            setExistingTargets(data.dimensional_targets.map((t: any) => ({
              id: t.id,
              name: t.name,
              target_meetups: t.target_meetups,
              meetup_cost: t.meetup_cost,
              meetup_capacity: t.meetup_capacity,
              target_revenue: t.target_revenue
            })))
          } else {
            setExistingTargets([])
          }
        })
        .catch(() => setExistingTargets([]))
    } else {
      setExistingTargets([])
    }
  }, [context?.club_id])

  // Fetch day types when modal opens
  useEffect(() => {
    if (isOpen) {
      setLoadingDayTypes(true)
      DimensionalTargetsService.getAllDimensions()
        .then(response => {
          if (response.success && response.dimensions?.day_type?.values) {
            setDayTypes(response.dimensions.day_type.values.map((d: any) => ({
              id: d.id,
              name: capitalizeDayType(d.name || d.day_type)
            })))
          }
        })
        .catch(console.error)
        .finally(() => setLoadingDayTypes(false))
    }
  }, [isOpen])

  // Fetch defaults when context changes
  useEffect(() => {
    if (context && context.activity_name && context.city_name) {
      setLoadingDefaults(true)
      const params = new URLSearchParams({
        activity: context.activity_name,
        city: context.city_name,
        ...(context.area_name && { area: context.area_name })
      })
      fetch(`/api/targets/meetup-defaults?${params}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            if (data.meetup_cost !== null) setMeetupCost(data.meetup_cost)
            if (data.meetup_capacity !== null) setMeetupCapacity(data.meetup_capacity)
            setDefaultsSource(
              data.source === 'exact' ? `${context.area_name || context.city_name} defaults` :
              data.source === 'city_avg' ? `${context.city_name} average` :
              data.source === 'activity_avg' ? `${context.activity_name} average` :
              'default'
            )
          }
        })
        .catch(console.error)
        .finally(() => setLoadingDefaults(false))
    }
  }, [context?.activity_name, context?.city_name, context?.area_name])

  // Reset form when context changes
  useEffect(() => {
    if (context) {
      setTargetMeetups(1)
      setMeetupCost(200)
      setMeetupCapacity(15)
      setTargetName('')
      setDefaultsSource('default')
      setSelectedDayTypeId(null)
      setError(null)
    }
  }, [context])

  if (!isOpen || !context) return null

  // Quick Add only works for clubs (need club_id for the API)
  const canSave = context.club_id && context.area_id && context.activity_id

  const handleSave = async () => {
    if (!canSave) {
      setError('Quick Add requires club context. Please expand to club level.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave({
        club_id: context.club_id!,
        target_meetups: targetMeetups,
        target_revenue: calculatedRevenue,
        meetup_cost: meetupCost,
        meetup_capacity: meetupCapacity,
        area_id: context.area_id!,
        activity_id: context.activity_id!,
        name: targetName.trim() || undefined,
        day_type_id: selectedDayTypeId
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save target')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-emerald-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Plus size={20} className="text-emerald-600" />
              Quick Add Target
            </h3>
            {context.club_name && (
              <p className="text-sm text-gray-500">{context.club_name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Context Info */}
        <div className="px-6 py-3 bg-gray-50 text-sm text-gray-600 space-y-1">
          {context.activity_name && <div><span className="font-medium">Activity:</span> {context.activity_name}</div>}
          {context.city_name && <div><span className="font-medium">City:</span> {context.city_name}</div>}
          {context.area_name && <div><span className="font-medium">Area:</span> {context.area_name}</div>}
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Day Type <span className="text-gray-400 font-normal">(for revenue matching)</span>
            </label>
            <select
              value={selectedDayTypeId || ''}
              onChange={(e) => setSelectedDayTypeId(e.target.value ? parseInt(e.target.value) : null)}
              disabled={loadingDayTypes}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
            >
              <option value="">All Days</option>
              {dayTypes.map(dt => (
                <option key={dt.id} value={dt.id}>{dt.name}</option>
              ))}
            </select>
            <p className="text-xs text-amber-600 mt-1">
              Primary matching: Revenue is matched to targets based on day type.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Premium Meetups, Weekend Slots"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400
                focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Fallback matching: When day type doesn't match, revenue is matched by comparing this name with meetup titles. Use a distinctive name that appears in your meetup titles.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Meetups
            </label>
            <input
              type="number"
              min="1"
              value={targetMeetups}
              onChange={(e) => setTargetMeetups(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost per Meetup (₹)
              </label>
              <input
                type="number"
                min="0"
                value={meetupCost}
                onChange={(e) => setMeetupCost(parseInt(e.target.value) || 0)}
                disabled={loadingDefaults}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                  focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Capacity/Meetup
              </label>
              <input
                type="number"
                min="1"
                value={meetupCapacity}
                onChange={(e) => setMeetupCapacity(parseInt(e.target.value) || 1)}
                disabled={loadingDefaults}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                  focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>
          </div>
          {defaultsSource !== 'default' && (
            <p className="text-xs text-emerald-600 -mt-2">
              Pre-filled from {defaultsSource}
            </p>
          )}

          {/* Existing targets info */}
          {existingTargets.length > 0 && (
            <div className="bg-blue-50 rounded-lg px-4 py-3 border border-blue-200">
              <p className="text-xs font-medium text-blue-700 mb-2">
                Existing targets for this club:
              </p>
              <div className="space-y-1.5">
                {existingTargets.map((t, idx) => (
                  <div key={t.id} className="text-xs text-blue-600">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{t.name || `Target ${idx + 1}`}</span>
                      <span className="font-medium">{t.target_meetups} meetups</span>
                    </div>
                    <div className="text-blue-500 text-[10px]">
                      ₹{t.meetup_cost || 0} × {t.meetup_capacity || 0} capacity
                    </div>
                  </div>
                ))}
              </div>
              {matchingTarget && (
                <p className="text-xs text-amber-700 mt-2 font-medium">
                  ⚠️ A target with same cost & capacity exists. This will update it.
                  Change cost or capacity to create a new target.
                </p>
              )}
            </div>
          )}

          <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Calculated Revenue
            </label>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-gray-900">
                ₹{calculatedRevenue >= 100000 ? `${(calculatedRevenue / 100000).toFixed(1)}L` : `${(calculatedRevenue / 1000).toFixed(1)}K`}
              </span>
              <span className="text-xs text-gray-400">
                ({targetMeetups} × ₹{meetupCost} × {meetupCapacity})
              </span>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Warning for non-club levels */}
        {!canSave && (
          <div className="mx-6 mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
            Quick Add works at club level. Please expand the hierarchy to a specific club.
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg
              font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            Add Target
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// EDIT TARGET MODAL COMPONENT
// =====================================================
interface EditTargetContext {
  node: HierarchyNode
  is_launch: boolean
}

interface EditTargetModalProps {
  isOpen: boolean
  onClose: () => void
  context: EditTargetContext | null
  onSave: (data: {
    target_id: number
    club_id?: number
    launch_id?: number
    target_meetups: number
    target_revenue: number
    meetup_cost: number
    meetup_capacity: number
    is_launch: boolean
    name?: string
    day_type_id?: number | null
  }) => Promise<void>
}

function EditTargetModal({ isOpen, onClose, context, onSave }: EditTargetModalProps) {
  const [targetMeetups, setTargetMeetups] = useState<number>(1)
  const [meetupCost, setMeetupCost] = useState<number>(200)
  const [meetupCapacity, setMeetupCapacity] = useState<number>(15)
  const [targetName, setTargetName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Day type state
  const [dayTypes, setDayTypes] = useState<{ id: number; name: string }[]>([])
  const [selectedDayTypeId, setSelectedDayTypeId] = useState<number | null>(null)
  const [loadingDayTypes, setLoadingDayTypes] = useState(false)

  // Capitalize day type name helper
  const capitalizeDayType = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

  // Calculate revenue from inputs
  const calculatedRevenue = targetMeetups * meetupCost * meetupCapacity

  // Fetch day types when modal opens
  useEffect(() => {
    if (isOpen) {
      setLoadingDayTypes(true)
      DimensionalTargetsService.getAllDimensions()
        .then(response => {
          if (response.success && response.dimensions?.day_type?.values) {
            setDayTypes(response.dimensions.day_type.values.map((d: any) => ({
              id: d.id,
              name: capitalizeDayType(d.name || d.day_type)
            })))
          }
        })
        .catch(console.error)
        .finally(() => setLoadingDayTypes(false))
    }
  }, [isOpen])

  // Load existing target data when context changes
  useEffect(() => {
    if (context && context.node) {
      setLoading(true)
      setError(null)

      const { node, is_launch } = context
      const targetId = node.target_id
      const entityId = is_launch ? node.launch_id : node.club_id

      if (!targetId || !entityId) {
        setError('Target not found')
        setLoading(false)
        return
      }

      // Fetch current target data
      const endpoint = is_launch
        ? `/api/targets/launches/${entityId}/dimensional`
        : `/api/targets/clubs/${entityId}/dimensional`

      fetch(endpoint)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.dimensional_targets) {
            // Find the specific target
            const target = data.dimensional_targets.find((t: any) => t.id === targetId)
            if (target) {
              setTargetMeetups(target.target_meetups || 0)
              setMeetupCost(target.meetup_cost || 200)
              setMeetupCapacity(target.meetup_capacity || 15)
              setTargetName(target.name || '')
              setSelectedDayTypeId(target.day_type_id || null)
            } else {
              // Use node data as fallback
              setTargetMeetups(node.target_meetups || 0)
              setMeetupCost(200)
              setMeetupCapacity(15)
              setTargetName('')
              setSelectedDayTypeId(node.day_type_id || null)
            }
          }
        })
        .catch(err => {
          console.error('Failed to load target:', err)
          // Use node data as fallback
          setTargetMeetups(node.target_meetups || 0)
          setTargetName('')
          setSelectedDayTypeId(null)
        })
        .finally(() => setLoading(false))
    }
  }, [context])

  if (!isOpen || !context) return null

  const { node, is_launch } = context
  const canSave = targetMeetups > 0 && meetupCapacity > 0

  const handleSave = async () => {
    if (!canSave || !node.target_id) return

    setSaving(true)
    setError(null)
    try {
      await onSave({
        target_id: node.target_id,
        club_id: node.club_id,
        launch_id: node.launch_id,
        target_meetups: targetMeetups,
        target_revenue: calculatedRevenue,
        meetup_cost: meetupCost,
        meetup_capacity: meetupCapacity,
        is_launch,
        name: targetName.trim() || undefined,
        day_type_id: selectedDayTypeId
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update target')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b border-gray-200 ${is_launch ? 'bg-violet-50' : 'bg-blue-50'}`}>
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Edit3 size={20} className={is_launch ? 'text-violet-600' : 'text-blue-600'} />
              Edit Target
            </h3>
            <p className="text-sm text-gray-500">{node.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="px-6 py-8 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Form */}
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Day Type <span className="text-gray-400 font-normal">(for revenue matching)</span>
                </label>
                <select
                  value={selectedDayTypeId || ''}
                  onChange={(e) => setSelectedDayTypeId(e.target.value ? parseInt(e.target.value) : null)}
                  disabled={loadingDayTypes}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                    focus:ring-2 ${is_launch ? 'focus:ring-violet-500' : 'focus:ring-blue-500'} focus:border-transparent disabled:bg-gray-100`}
                >
                  <option value="">All Days</option>
                  {dayTypes.map(dt => (
                    <option key={dt.id} value={dt.id}>{dt.name}</option>
                  ))}
                </select>
                <p className="text-xs text-amber-600 mt-1">
                  Primary matching: Revenue is matched to targets based on day type.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Name <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Premium Meetups, Weekend Slots"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400
                    focus:ring-2 ${is_launch ? 'focus:ring-violet-500' : 'focus:ring-blue-500'} focus:border-transparent`}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Fallback matching: When day type doesn't match, revenue is matched by comparing this name with meetup titles. Use a distinctive name that appears in your meetup titles.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Meetups
                </label>
                <input
                  type="number"
                  min="1"
                  value={targetMeetups}
                  onChange={(e) => setTargetMeetups(parseInt(e.target.value) || 0)}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                    focus:ring-2 ${is_launch ? 'focus:ring-violet-500' : 'focus:ring-blue-500'} focus:border-transparent`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cost per Meetup (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={meetupCost}
                    onChange={(e) => setMeetupCost(parseInt(e.target.value) || 0)}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                      focus:ring-2 ${is_launch ? 'focus:ring-violet-500' : 'focus:ring-blue-500'} focus:border-transparent`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Capacity/Meetup
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={meetupCapacity}
                    onChange={(e) => setMeetupCapacity(parseInt(e.target.value) || 1)}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                      focus:ring-2 ${is_launch ? 'focus:ring-violet-500' : 'focus:ring-blue-500'} focus:border-transparent`}
                  />
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Calculated Revenue
                </label>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-gray-900">
                    ₹{calculatedRevenue >= 100000 ? `${(calculatedRevenue / 100000).toFixed(1)}L` : `${(calculatedRevenue / 1000).toFixed(1)}K`}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({targetMeetups} × ₹{meetupCost} × {meetupCapacity})
                  </span>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !canSave}
                className={`px-4 py-2 ${is_launch ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-lg
                  font-medium transition-colors flex items-center gap-2 disabled:opacity-50`}
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Save Changes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// =====================================================
// TASK MODAL COMPONENT
// =====================================================
interface TaskContext {
  club_id?: number
  club_name?: string
  activity?: string
  city?: string
}

interface TaskModalProps {
  isOpen: boolean
  onClose: () => void
  context: TaskContext | null
  onSave: (data: { title: string; description: string; priority: string; due_date?: string; club_id?: number; activity?: string; city?: string }) => Promise<void>
}

function TaskModal({ isOpen, onClose, context, onSave }: TaskModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset and pre-fill form when context changes
  useEffect(() => {
    if (context) {
      // Generate suggested title based on context
      const suggestedTitle = context.club_name
        ? `Follow up on ${context.club_name} target`
        : context.activity
          ? `${context.activity} scaling task`
          : ''
      setTitle(suggestedTitle)
      setDescription('')
      setPriority('medium')
      setDueDate('')
      setError(null)
    }
  }, [context])

  if (!isOpen || !context) return null

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        priority,
        due_date: dueDate || undefined,
        club_id: context.club_id,
        activity: context.activity,
        city: context.city
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-blue-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList size={20} className="text-blue-600" />
              Create Task
            </h3>
            {context.club_name && (
              <p className="text-sm text-gray-500">{context.club_name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Context Info */}
        {(context.activity || context.city) && (
          <div className="px-6 py-2 bg-gray-50 text-sm text-gray-600 flex gap-4">
            {context.activity && <span><strong>Activity:</strong> {context.activity}</span>}
            {context.city && <span><strong>City:</strong> {context.city}</span>}
          </div>
        )}

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task description"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg
              font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <ClipboardList size={18} />}
            Create Task
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// LAUNCH MODAL COMPONENT
// =====================================================
interface LaunchModalProps {
  isOpen: boolean
  onClose: () => void
  context: QuickAddContext | null
  onSave: (data: {
    activity_name: string
    planned_club_name: string
    area_id?: number
    target_meetups: number
    target_revenue: number
    meetup_cost: number
    meetup_capacity: number
    day_type_id?: number | null
  }) => Promise<void>
}

function LaunchModal({ isOpen, onClose, context, onSave }: LaunchModalProps) {
  const [clubName, setClubName] = useState('')
  const [activityName, setActivityName] = useState('')
  const [targetMeetups, setTargetMeetups] = useState<number>(1)
  const [meetupCost, setMeetupCost] = useState<number>(200)
  const [meetupCapacity, setMeetupCapacity] = useState<number>(15)
  const [defaultsSource, setDefaultsSource] = useState<string>('default')
  const [loadingDefaults, setLoadingDefaults] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Day type state
  const [dayTypes, setDayTypes] = useState<{ id: number; name: string }[]>([])
  const [selectedDayTypeId, setSelectedDayTypeId] = useState<number | null>(null)
  const [loadingDayTypes, setLoadingDayTypes] = useState(false)

  // City and Area states (changeable)
  // Note: selectedCityId and selectedAreaId are production IDs (using scaling-tasks/filters API)
  const [selectedCityId, setSelectedCityId] = useState<number | undefined>()
  const [selectedCityName, setSelectedCityName] = useState<string>('')
  const [selectedAreaId, setSelectedAreaId] = useState<number | undefined>()
  const [selectedAreaName, setSelectedAreaName] = useState<string>('')
  const [cities, setCities] = useState<{ id: number; name: string }[]>([])
  const [areas, setAreas] = useState<{ id: number; name: string }[]>([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [loadingAreas, setLoadingAreas] = useState(false)

  // Capitalize day type name helper
  const capitalizeDayType = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

  // Calculate revenue from inputs
  const calculatedRevenue = targetMeetups * meetupCost * meetupCapacity

  // Activity options (fetched once) - API returns activity_id and activity_name
  const [activities, setActivities] = useState<{activity_id: number; activity_name: string}[]>([])

  // Fetch activities on mount
  useEffect(() => {
    fetch('/api/targets/activities')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.activities) {
          setActivities(data.activities)
        }
      })
      .catch(console.error)
  }, [])

  // Fetch all cities on mount - uses scaling-tasks/filters API which returns production IDs
  useEffect(() => {
    if (!isOpen) return
    setLoadingCities(true)
    fetch('/api/scaling-tasks/filters/cities')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.options) {
          const cityList = data.options.map((c: any) => ({
            id: c.id,
            name: c.name
          })).sort((a: any, b: any) => a.name.localeCompare(b.name))
          setCities(cityList)
        }
      })
      .catch(console.error)
      .finally(() => setLoadingCities(false))
  }, [isOpen])

  // Fetch areas when city changes - uses scaling-tasks/filters API which returns production IDs
  useEffect(() => {
    if (!isOpen || !selectedCityId) {
      setAreas([])
      return
    }
    setLoadingAreas(true)
    fetch(`/api/scaling-tasks/filters/areas?city_ids=${selectedCityId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.options) {
          const areaList = data.options.map((a: any) => ({
            id: a.id,
            name: a.name
          }))
          setAreas(areaList)
        }
      })
      .catch(console.error)
      .finally(() => setLoadingAreas(false))
  }, [isOpen, selectedCityId])

  // Fetch day types when modal opens
  useEffect(() => {
    if (isOpen) {
      setLoadingDayTypes(true)
      DimensionalTargetsService.getAllDimensions()
        .then(response => {
          if (response.success && response.dimensions?.day_type?.values) {
            setDayTypes(response.dimensions.day_type.values.map((d: any) => ({
              id: d.id,
              name: capitalizeDayType(d.name || d.day_type)
            })))
          }
        })
        .catch(console.error)
        .finally(() => setLoadingDayTypes(false))
    }
  }, [isOpen])

  // Fetch defaults when activity/city/area are known
  useEffect(() => {
    if (activityName && selectedCityName) {
      setLoadingDefaults(true)
      const params = new URLSearchParams({
        activity: activityName,
        city: selectedCityName,
        ...(selectedAreaName && { area: selectedAreaName })
      })
      fetch(`/api/targets/meetup-defaults?${params}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            if (data.meetup_cost !== null) setMeetupCost(data.meetup_cost)
            if (data.meetup_capacity !== null) setMeetupCapacity(data.meetup_capacity)
            setDefaultsSource(
              data.source === 'exact' ? `${selectedAreaName || selectedCityName} defaults` :
              data.source === 'city_avg' ? `${selectedCityName} average` :
              data.source === 'activity_avg' ? `${activityName} average` :
              'default'
            )
          }
        })
        .catch(console.error)
        .finally(() => setLoadingDefaults(false))
    }
  }, [activityName, selectedCityName, selectedAreaName])

  // Reset form when modal opens
  // Note: city_id and area_id are production IDs - set directly from context
  useEffect(() => {
    if (isOpen && context) {
      setClubName('')
      setActivityName(context.activity_name || '')
      // Set city/area IDs directly from context (they're production IDs, matching the API)
      setSelectedCityId(context.city_id)
      setSelectedCityName(context.city_name || '')
      setSelectedAreaId(context.area_id)
      setSelectedAreaName(context.area_name || '')
      setTargetMeetups(1)
      setMeetupCost(200)
      setMeetupCapacity(15)
      setDefaultsSource('default')
      setSelectedDayTypeId(null)
      setError(null)
    }
  }, [isOpen])

  if (!isOpen || !context) return null

  // All required fields must be filled: Activity, City, Area, Target Meetups, Cost, Capacity (Name is optional)
  const canSave = activityName.trim().length > 0 &&
    selectedCityId !== undefined &&
    selectedAreaId !== undefined &&
    targetMeetups > 0 &&
    meetupCost > 0 &&
    meetupCapacity > 0

  // Handle city change
  const handleCityChange = (cityId: number | undefined) => {
    const city = cities.find(c => c.id === cityId)
    setSelectedCityId(cityId)
    setSelectedCityName(city?.name || '')
    // Reset area when city changes
    setSelectedAreaId(undefined)
    setSelectedAreaName('')
  }

  // Handle area change
  const handleAreaChange = (areaId: number | undefined) => {
    const area = areas.find(a => a.id === areaId)
    setSelectedAreaId(areaId)
    setSelectedAreaName(area?.name || '')
  }

  const handleSave = async () => {
    if (!canSave) {
      const missing: string[] = []
      if (!activityName.trim()) missing.push('Activity')
      if (!selectedCityId) missing.push('City')
      if (!selectedAreaId) missing.push('Area')
      if (targetMeetups <= 0) missing.push('Target Meetups')
      if (meetupCost <= 0) missing.push('Cost')
      if (meetupCapacity <= 0) missing.push('Capacity')
      setError(`Required: ${missing.join(', ')}`)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave({
        activity_name: activityName,
        planned_club_name: clubName || `New ${activityName} Club`,
        area_id: selectedAreaId, // Use selected area, not context
        target_meetups: targetMeetups,
        target_revenue: calculatedRevenue,
        meetup_cost: meetupCost,
        meetup_capacity: meetupCapacity,
        day_type_id: selectedDayTypeId
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create launch')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-violet-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Rocket size={20} className="text-violet-600" />
              Add New Club Launch
            </h3>
            <p className="text-sm text-gray-500">Plan a new club to launch</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          {/* Compact 2-column grid for Activity, City, Area */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {/* Activity - Always dropdown (pre-filled from context) */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Activity <span className="text-red-500">*</span>
              </label>
              <select
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md text-gray-900
                  focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
              >
                <option value="">Select Activity</option>
                {activities.map(a => (
                  <option key={a.activity_id} value={a.activity_name}>{a.activity_name}</option>
                ))}
              </select>
            </div>

            {/* City - Dropdown (all cities available) */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">City <span className="text-red-500">*</span></label>
              <select
                value={selectedCityId || ''}
                onChange={(e) => handleCityChange(e.target.value ? parseInt(e.target.value) : undefined)}
                disabled={loadingCities}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md text-gray-900
                  focus:ring-1 focus:ring-violet-500 focus:border-violet-500 disabled:bg-gray-50"
              >
                <option value="">Select</option>
                {cities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Area - Dropdown (filtered by city) */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Area <span className="text-red-500">*</span></label>
              <select
                value={selectedAreaId || ''}
                onChange={(e) => handleAreaChange(e.target.value ? parseInt(e.target.value) : undefined)}
                disabled={loadingAreas}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md text-gray-900
                  focus:ring-1 focus:ring-violet-500 focus:border-violet-500 disabled:bg-gray-50"
              >
                <option value="">{selectedCityId ? 'Select' : 'Select city first'}</option>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Day Type <span className="text-gray-400 font-normal">(for revenue matching)</span>
            </label>
            <select
              value={selectedDayTypeId || ''}
              onChange={(e) => setSelectedDayTypeId(e.target.value ? parseInt(e.target.value) : null)}
              disabled={loadingDayTypes}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:bg-gray-100"
            >
              <option value="">All Days</option>
              {dayTypes.map(dt => (
                <option key={dt.id} value={dt.id}>{dt.name}</option>
              ))}
            </select>
            <p className="text-xs text-amber-600 mt-1">
              Primary matching: Revenue is matched to targets based on day type.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Club Name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder={`New ${activityName || 'Activity'} Club`}
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Fallback matching: When day type doesn't match, revenue is matched by comparing this name with meetup titles. Use a distinctive name that appears in your meetup titles.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Meetups <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={targetMeetups}
              onChange={(e) => setTargetMeetups(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost per Meetup (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={meetupCost}
                onChange={(e) => setMeetupCost(parseInt(e.target.value) || 0)}
                disabled={loadingDefaults}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                  focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Capacity/Meetup <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={meetupCapacity}
                onChange={(e) => setMeetupCapacity(parseInt(e.target.value) || 1)}
                disabled={loadingDefaults}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900
                  focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>
          </div>
          {defaultsSource !== 'default' && (
            <p className="text-xs text-violet-600 -mt-2">
              Pre-filled from {defaultsSource}
            </p>
          )}

          <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Calculated Revenue
            </label>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-gray-900">
                ₹{calculatedRevenue >= 100000 ? `${(calculatedRevenue / 100000).toFixed(1)}L` : `${(calculatedRevenue / 1000).toFixed(1)}K`}
              </span>
              <span className="text-xs text-gray-400">
                ({targetMeetups} × ₹{meetupCost} × {meetupCapacity})
              </span>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg
              font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Rocket size={18} />}
            Add Launch
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// HIERARCHY ROW COMPONENT
// =====================================================
interface HierarchyRowProps {
  node: HierarchyNode
  level: number
  expanded: boolean
  onToggle: () => void
  onEditTarget: (node: HierarchyNode) => void // For clubs/launches: edit existing target
  onDeleteTarget: (node: HierarchyNode) => void // For deleting a target
  onAddAtAreaLevel: (node: HierarchyNode) => void  // For areas: open choice modal (new launch vs expand)
  onExpandClub: (node: HierarchyNode) => void  // For clubs: add target (opens ExpandClubModal)
  onCreateTask: (node: HierarchyNode) => void
  onEditStages: (node: HierarchyNode) => void
  onOpenSprint: (node: HierarchyNode) => void  // For opening sprint modal
  taskSummary: ScalingTaskSummary | null       // Task summary for this node
  weekBounds: { start: Date; end: Date }       // Week bounds for tooltip
}

function HierarchyRow({ node, level, expanded, onToggle, onEditTarget, onDeleteTarget, onAddAtAreaLevel, onExpandClub, onCreateTask, onEditStages, onOpenSprint, taskSummary, weekBounds }: HierarchyRowProps) {
  const hasChildren = node.children && node.children.length > 0
  const isLaunch = node.is_launch || node.type === 'launch'
  const isTarget = node.type === 'target'
  // Can edit stages at TARGET level only:
  // - Target rows: always editable
  // - Club with single target (no children): editable (this IS the target level)
  // - Club with multiple targets (has children): NOT editable (shows rolled up data)
  // - Launches: same logic
  const canEditStages = isTarget ||
    (node.type === 'club' && node.target_id && !hasChildren) ||
    (isLaunch && node.has_target && !hasChildren)

  // Level-specific styling (light theme)
  // Level 4 = target rows (children of clubs)
  const levelStyles: Record<number, { bg: string; indent: string; border: string }> = {
    0: { bg: 'bg-indigo-50', indent: 'pl-4', border: 'border-l-4 border-indigo-500' },
    1: { bg: 'bg-cyan-50/50', indent: 'pl-10', border: 'border-l-4 border-cyan-500' },
    2: { bg: 'bg-emerald-50/50', indent: 'pl-16', border: 'border-l-4 border-emerald-500' },
    3: { bg: isLaunch ? 'bg-violet-50' : 'bg-white', indent: 'pl-[5.5rem]', border: isLaunch ? 'border-l-4 border-violet-400' : 'border-l-4 border-gray-200' },
    4: { bg: 'bg-amber-50/50', indent: 'pl-[7rem]', border: 'border-l-4 border-amber-300' } // Target rows
  }

  const style = levelStyles[level] || levelStyles[4]

  const typeIcons: Record<string, React.ReactNode> = {
    activity: <Activity size={16} className="text-indigo-600" />,
    city: <Building2 size={16} className="text-cyan-600" />,
    area: <MapPin size={16} className="text-emerald-600" />,
    club: <Users size={16} className="text-gray-500" />,
    launch: <Rocket size={16} className="text-violet-600" />,
    target: <Target size={16} className="text-amber-600" />
  }

  const formatCurrency = (value: number) => {
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`
    return `₹${value}`
  }

  return (
    <tr
      className={`${style.bg} ${style.border} transition-all duration-200
        hover:bg-gray-100 group cursor-pointer`}
      onClick={hasChildren ? onToggle : undefined}
    >
      {/* Name column */}
      <td className={`py-3 ${style.indent} pr-4`}>
        <div className="flex items-center gap-3">
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="p-1 rounded hover:bg-gray-200 transition-colors"
            >
              {expanded ? (
                <ChevronDown size={18} className="text-gray-500" />
              ) : (
                <ChevronRight size={18} className="text-gray-500" />
              )}
            </button>
          ) : (
            <span className="w-7" />
          )}
          {typeIcons[node.type] || typeIcons.club}
          <div className="flex flex-col">
            <span className={`font-semibold ${level === 0 ? 'text-lg' : ''}
              ${isLaunch ? 'text-violet-700' : 'text-gray-800'}`}>
              {node.name}
            </span>
            {/* Day type tags for target nodes */}
            {isTarget && node.day_type_name && (
              <DayTypeTags dayTypeName={node.day_type_name} compact />
            )}
          </div>
          {node.club_count !== undefined && node.type !== 'club' && (
            <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
              {node.club_count} {node.club_count === 1 ? 'club' : 'clubs'}
            </span>
          )}
        </div>
      </td>

      {/* Health column - show single health dot for all levels */}
      {/* For clubs/launches, clicking opens the meetup details tooltip with health section */}
      <td className="py-3 px-3 text-center">
        {isTarget ? (
          <div className="text-gray-400 text-xs">-</div>
        ) : (node.type === 'club' || node.type === 'launch') && node.club_id && node.health_status ? (
          // Club/launch level: health dot triggers tooltip with health details
          <MeetupDetailsTooltip
            clubId={node.club_id}
            clubName={node.name}
            currentMeetups={node.current_meetups}
            currentRevenue={node.current_revenue}
            weekLabel={formatWeekLabel(weekBounds.start, weekBounds.end)}
            weekStart={formatLocalDate(weekBounds.start)}
            weekEnd={formatLocalDate(weekBounds.end)}
          >
            <div className="flex justify-center cursor-pointer">
              <HealthDot
                status={node.health_status as HealthStatus}
                score={node.health_score}
                size="md"
                showTooltip={false}
              />
            </div>
          </MeetupDetailsTooltip>
        ) : node.health_status ? (
          // Roll-up level: just show health dot with built-in tooltip
          <div className="flex justify-center">
            <HealthDot
              status={node.health_status as HealthStatus}
              score={node.health_score}
              size="md"
            />
          </div>
        ) : (
          <div className="text-gray-400 text-xs">-</div>
        )}
      </td>

      {/* Target column */}
      <td className="py-3 px-4 text-right">
        <div className="text-gray-800 font-mono font-semibold">{node.target_meetups}</div>
        <div className="text-xs text-gray-500">{formatCurrency(node.target_revenue)}</div>
      </td>

      {/* Current column - targets don't have current data, clubs get hover tooltip */}
      <td className="py-3 px-4 text-right">
        {isTarget ? (
          <div className="text-gray-400 font-mono">-</div>
        ) : (node.type === 'club' || node.type === 'launch') && node.club_id ? (
          <MeetupDetailsTooltip
            clubId={node.club_id}
            clubName={node.name}
            currentMeetups={node.current_meetups}
            currentRevenue={node.current_revenue}
            weekLabel={formatWeekLabel(weekBounds.start, weekBounds.end)}
            weekStart={formatLocalDate(weekBounds.start)}
            weekEnd={formatLocalDate(weekBounds.end)}
          >
            <div className="hover:bg-gray-100 rounded px-1 -mx-1 transition-colors">
              <div className="text-gray-800 font-mono">{node.current_meetups}</div>
              <div className="text-xs text-gray-500">{formatCurrency(node.current_revenue)}</div>
            </div>
          </MeetupDetailsTooltip>
        ) : (
          <>
            <div className="text-gray-800 font-mono">{node.current_meetups}</div>
            <div className="text-xs text-gray-500">{formatCurrency(node.current_revenue)}</div>
          </>
        )}
      </td>

      {/* Gap column - shows remaining to achieve (never negative), targets don't have gap */}
      <td className="py-3 px-4 text-right">
        {isTarget ? (
          <div className="text-gray-400 font-mono">-</div>
        ) : (
          <>
            <div className={`font-mono font-semibold ${node.gap_meetups > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {Math.max(0, node.gap_meetups)}
            </div>
            <div className={`text-xs ${node.gap_revenue > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
              {formatCurrency(Math.max(0, node.gap_revenue))}
            </div>
          </>
        )}
      </td>

      {/* L4W Revenue column - Last 4 weeks total and weekly avg, targets don't have L4W data */}
      <td className="py-3 px-4 text-right">
        {isTarget ? (
          <div className="text-gray-400 font-mono">-</div>
        ) : (
          <>
            <div className="text-gray-800 font-mono">
              {formatCurrency(node.last_4w_revenue_total || 0)}
            </div>
            <div className="text-xs text-gray-500">
              {formatCurrency(node.last_4w_revenue_avg || 0)}/wk
            </div>
          </>
        )}
      </td>

      {/* Meetup Stage column (formerly Stage Distribution) */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <StageDistribution progress={node.progress_summary} compact />
          {canEditStages && (
            <Tooltip text="Edit Stages" position="left">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEditStages(node)
                }}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Edit3 size={14} />
              </button>
            </Tooltip>
          )}
        </div>
      </td>

      {/* Revenue Status column */}
      <td className="py-3 px-4">
        <RevenueStatusPills revenueStatus={node.revenue_status} compact />
      </td>

      {/* Validation column */}
      <td className="py-3 px-4">
        <ValidationIndicator status={node.validation_status} message={node.validation_message} />
      </td>

      {/* Tasks column */}
      <td className="py-3 px-4 text-center">
        <TaskListTooltip node={node} taskSummary={taskSummary}>
          <TaskSummaryCell
            summary={taskSummary}
            onOpenSprints={() => onOpenSprint(node)}
            onCreateTask={() => onCreateTask(node)}
          />
        </TaskListTooltip>
      </td>

      {/* Actions column */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Edit button: For target rows, clubs with targets (including expansions), or launches with targets */}
          {(isTarget || (node.type === 'club' && node.has_target) || (isLaunch && node.has_target)) && (
            <Tooltip text="Edit Target" position="left">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEditTarget(node)
                }}
                className="p-1.5 rounded-lg bg-blue-100 hover:bg-blue-200
                  text-blue-600 transition-all hover:scale-110"
              >
                <Edit3 size={14} />
              </button>
            </Tooltip>
          )}
          {/* Delete button: For target rows, clubs with single target (target_id set), or launches */}
          {(isTarget || (node.type === 'club' && node.has_target && node.target_id) || isLaunch) && (
            <Tooltip text={isLaunch ? "Delete Launch" : "Delete Target"} position="left">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteTarget(node)
                }}
                className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200
                  text-red-600 transition-all hover:scale-110"
              >
                <Trash2 size={14} />
              </button>
            </Tooltip>
          )}
          {/* Plus button: All levels open Choice Modal (New Launch vs Expand Club) */}
          {/* Club level for existing clubs goes directly to Expand Club modal */}
          {(node.type === 'activity' || node.type === 'city' || node.type === 'area') && (
            <Tooltip text="Add Target" position="left">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onAddAtAreaLevel(node)
                }}
                className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200
                  text-emerald-600 transition-all hover:scale-110"
              >
                <Plus size={16} />
              </button>
            </Tooltip>
          )}
          {node.type === 'club' && !isLaunch && (
            <Tooltip text="Add Target" position="left">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onExpandClub(node)
                }}
                className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200
                  text-emerald-600 transition-all hover:scale-110"
              >
                <Plus size={16} />
              </button>
            </Tooltip>
          )}
        </div>
      </td>
    </tr>
  )
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function ScalingPlannerV2() {
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([])
  const [trends, setTrends] = useState<TrendsResponse | null>(null)
  const [summary, setSummary] = useState<HierarchyResponse['summary'] | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sort state - persists across filter changes
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null })

  // Always include launches in hierarchy
  const includeLaunches = true

  // Ref for table container to preserve scroll position
  const tableContainerRef = useRef<HTMLDivElement>(null)

  // Stage editor modal state
  const [editingNode, setEditingNode] = useState<HierarchyNode | null>(null)

  // Quick Add modal state
  const [quickAddContext, setQuickAddContext] = useState<QuickAddContext | null>(null)

  // Launch modal state
  const [launchContext, setLaunchContext] = useState<QuickAddContext | null>(null)

  // Add Choice modal state (for Area level - choose between New Launch and Expand)
  const [addChoiceContext, setAddChoiceContext] = useState<QuickAddContext | null>(null)

  // Expand Club modal state
  const [expandClubContext, setExpandClubContext] = useState<QuickAddContext | null>(null)

  // Task modal state
  const [taskContext, setTaskContext] = useState<TaskContext | null>(null)

  // Sprint modal state (for Jira-like weekly view)
  const [sprintNode, setSprintNode] = useState<HierarchyNode | null>(null)
  const [taskSummaries, setTaskSummaries] = useState<Record<string, ScalingTaskSummary>>({})

  // Scaling task create modal state
  const [scalingTaskNode, setScalingTaskNode] = useState<HierarchyNode | null>(null)

  // Edit target modal state
  const [editTargetContext, setEditTargetContext] = useState<EditTargetContext | null>(null)

  // Delete target confirmation state
  const [deleteTargetNode, setDeleteTargetNode] = useState<HierarchyNode | null>(null)
  const [deletingTarget, setDeletingTarget] = useState(false)

  // Stage info modal state
  const [stageInfoModalType, setStageInfoModalType] = useState<'meetup_stage' | 'revenue_status' | null>(null)

  // Health info modal state
  const [healthInfoModalOpen, setHealthInfoModalOpen] = useState(false)

  // Feedback modal state
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false)

  // Hierarchy filter state
  const [filters, setFilters] = useState<HierarchyFilters>({
    activities: [],
    cities: [],
    areas: [],
    clubs: [],
    teams: []
  })

  // Hierarchy order state (drag-drop reorder + enable/disable)
  const [hierarchyLevels, setHierarchyLevels] = useState<HierarchyLevel[]>(['activity', 'city', 'area'])
  const [enabledLevels, setEnabledLevels] = useState<Set<HierarchyLevel>>(new Set(['activity', 'city', 'area']))
  const [draggingLevel, setDraggingLevel] = useState<HierarchyLevel | null>(null)

  // Week selector state
  const [selectedWeek, setSelectedWeek] = useState<WeekOption>('last_completed')
  const [customWeekStart, setCustomWeekStart] = useState<Date | null>(null)

  // Compute week bounds from selection
  const weekBounds = useMemo(() =>
    getWeekBounds(selectedWeek, customWeekStart || undefined),
    [selectedWeek, customWeekStart]
  )

  // Get enabled levels in order for API call
  const enabledHierarchyOrder = useMemo(() => {
    return hierarchyLevels.filter(l => enabledLevels.has(l))
  }, [hierarchyLevels, enabledLevels])

  // Check if using custom hierarchy (not default order)
  const isCustomHierarchy = useMemo(() => {
    const defaultOrder: HierarchyLevel[] = ['activity', 'city', 'area']
    return enabledHierarchyOrder.length !== 3 ||
      enabledHierarchyOrder.some((l, i) => l !== defaultOrder[i])
  }, [enabledHierarchyOrder])

  // Direct task summaries from API (keyed by name)
  const [directTaskSummaries, setDirectTaskSummaries] = useState<Record<string, ScalingTaskSummary>>({})

  // Rolled-up summaries (parent nodes aggregate children)
  const rolledUpSummaries = useMemo(() => {
    if (hierarchy.length === 0 || Object.keys(directTaskSummaries).length === 0) {
      return new Map<string, ScalingTaskSummary>()
    }
    return buildRolledUpSummaryMap(hierarchy, directTaskSummaries)
  }, [hierarchy, directTaskSummaries])

  // Fetch task summaries for all hierarchy nodes
  const fetchTaskSummaries = async () => {
    try {
      const response = await fetch('/api/scaling-tasks/summary/by-hierarchy')
      const data = await response.json()
      if (data.success && data.summaries) {
        // Build a map of node key -> summary using NAMES (not IDs)
        const summaryMap: Record<string, ScalingTaskSummary> = {}
        for (const summary of data.summaries) {
          const key = buildSummaryKey(
            summary.activity_name,
            summary.city_name,
            summary.area_name,
            summary.club_name
          ) || summary.task_scope

          // Merge or create summary
          if (summaryMap[key]) {
            summaryMap[key].not_started += parseInt(summary.not_started) || 0
            summaryMap[key].in_progress += parseInt(summary.in_progress) || 0
            summaryMap[key].completed += parseInt(summary.completed) || 0
            summaryMap[key].cancelled += parseInt(summary.cancelled) || 0
          } else {
            summaryMap[key] = {
              not_started: parseInt(summary.not_started) || 0,
              in_progress: parseInt(summary.in_progress) || 0,
              completed: parseInt(summary.completed) || 0,
              cancelled: parseInt(summary.cancelled) || 0,
              by_transition: {}
            }
          }
        }
        setDirectTaskSummaries(summaryMap)
      }
    } catch (err) {
      console.error('Failed to fetch task summaries:', err)
    }
  }

  // Get rolled-up task summary for a node (includes all descendant tasks)
  const getTaskSummary = (node: HierarchyNode): ScalingTaskSummary | null => {
    return rolledUpSummaries.get(node.id) || null
  }

  // Build breadcrumb for sprint modal
  const buildBreadcrumb = (node: HierarchyNode): string[] => {
    const crumbs: string[] = []
    if (node.activity_name) crumbs.push(node.activity_name)
    if (node.city_name) crumbs.push(node.city_name)
    if (node.area_name) crumbs.push(node.area_name)
    if (node.club_name) crumbs.push(node.club_name)
    if (crumbs.length === 0) crumbs.push(node.name)
    return crumbs
  }

  // Fetch data with optional scroll position preservation
  const fetchData = useCallback(async (preserveScroll = false) => {
    // Save scroll position if preserving
    const scrollTop = preserveScroll ? tableContainerRef.current?.scrollTop : undefined

    // Only show loading spinner on initial load (when no data yet)
    // This prevents flicker when changing hierarchy order
    if (hierarchy.length === 0) {
      setLoading(true)
    }
    setError(null)

    try {
      // Build hierarchy query params including custom order if different from default
      const hierarchyParams = new URLSearchParams()
      hierarchyParams.append('include_launches', String(includeLaunches))
      hierarchyParams.append('use_auto_matching', 'true')
      if (enabledHierarchyOrder.length > 0) {
        hierarchyParams.append('hierarchy_order', enabledHierarchyOrder.join(','))
      }
      // Add week params (use local date formatting to preserve IST timezone)
      hierarchyParams.append('week_start', formatLocalDate(weekBounds.start))
      hierarchyParams.append('week_end', formatLocalDate(weekBounds.end))

      const [hierarchyRes, trendsRes] = await Promise.all([
        fetch(`/api/targets/v2/hierarchy?${hierarchyParams}`),
        fetch('/api/targets/v2/trends')
      ])

      if (!hierarchyRes.ok || !trendsRes.ok) {
        throw new Error('Failed to fetch data')
      }

      const hierarchyData: HierarchyResponse = await hierarchyRes.json()
      const trendsData: TrendsResponse = await trendsRes.json()

      if (hierarchyData.success) {
        setHierarchy(hierarchyData.hierarchy)
        setSummary(hierarchyData.summary)
      }

      if (trendsData.success) {
        setTrends(trendsData)
      }

      // Restore scroll position after state updates
      if (preserveScroll && scrollTop !== undefined) {
        requestAnimationFrame(() => {
          if (tableContainerRef.current) {
            tableContainerRef.current.scrollTop = scrollTop
          }
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [includeLaunches, enabledHierarchyOrder, hierarchy.length, weekBounds])

  useEffect(() => {
    fetchData()
    fetchTaskSummaries()
  }, [includeLaunches, enabledHierarchyOrder, selectedWeek, customWeekStart])

  // Hierarchy order handlers
  const handleDragStart = (level: HierarchyLevel) => {
    setDraggingLevel(level)
  }

  const handleDragEnd = () => {
    setDraggingLevel(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (targetLevel: HierarchyLevel) => {
    if (!draggingLevel || draggingLevel === targetLevel) return

    setHierarchyLevels(prev => {
      const newLevels = [...prev]
      const dragIndex = newLevels.indexOf(draggingLevel)
      const dropIndex = newLevels.indexOf(targetLevel)
      // Remove from old position
      newLevels.splice(dragIndex, 1)
      // Insert at new position
      newLevels.splice(dropIndex, 0, draggingLevel)
      return newLevels
    })
  }

  const toggleLevel = (level: HierarchyLevel) => {
    setEnabledLevels(prev => {
      const next = new Set(prev)
      if (next.has(level)) {
        // Don't allow disabling if it's the last enabled level
        if (next.size <= 1) return prev
        next.delete(level)
      } else {
        next.add(level)
      }
      return next
    })
  }

  // Toggle node expansion
  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  // Helper: Find parent context by traversing hierarchy to get activity/city/area names
  const findParentContext = (targetId: string, nodes: HierarchyNode[], parentContext: Partial<QuickAddContext> = {}): Partial<QuickAddContext> | null => {
    for (const node of nodes) {
      // Build context as we go down
      const currentContext: Partial<QuickAddContext> = { ...parentContext }

      if (node.type === 'activity') {
        currentContext.activity_id = node.activity_id
        currentContext.activity_name = node.name
      } else if (node.type === 'city') {
        currentContext.city_id = node.city_id
        currentContext.city_name = node.name
      } else if (node.type === 'area') {
        currentContext.area_id = node.area_id
        currentContext.area_name = node.name
      }

      // Found the target node
      if (node.id === targetId) {
        return currentContext
      }

      // Search in children
      if (node.children && node.children.length > 0) {
        const found = findParentContext(targetId, node.children, currentContext)
        if (found) return found
      }
    }
    return null
  }

  // Add target handler (for clubs) - extracts context from node hierarchy
  const handleAddTarget = (node: HierarchyNode) => {
    // Get parent context by traversing hierarchy
    const parentContext = findParentContext(node.id, hierarchy) || {}

    const context: QuickAddContext = {
      node_type: node.type,
      activity_id: parentContext.activity_id || node.activity_id,
      activity_name: parentContext.activity_name,
      city_id: parentContext.city_id || node.city_id,
      city_name: parentContext.city_name,
      area_id: parentContext.area_id || node.area_id,
      area_name: parentContext.area_name,
      club_id: node.club_id,
      club_name: node.type === 'club' ? node.name : undefined
    }
    setQuickAddContext(context)
  }

  // Add handler for area level - shows choice modal (New Launch vs Expand)
  // Note: Currently hardcoded to 'area' level in HierarchyRow component
  const handleAddAtAreaLevel = (node: HierarchyNode) => {
    // Get parent context by traversing hierarchy
    const parentContext = findParentContext(node.id, hierarchy) || {}

    const context: QuickAddContext = {
      node_type: node.type,
      activity_id: parentContext.activity_id || node.activity_id,
      activity_name: parentContext.activity_name,
      city_id: parentContext.city_id || node.city_id,
      city_name: parentContext.city_name,
      area_id: node.area_id,
      area_name: node.name // Area node's name is the area name
    }
    setAddChoiceContext(context)
  }

  // Add launch handler - opens launch modal (called from choice modal)
  const handleAddLaunch = (context: QuickAddContext) => {
    setLaunchContext(context)
  }

  // Add expand club handler - for club level or from choice modal
  const handleExpandClub = (node: HierarchyNode) => {
    const parentContext = findParentContext(node.id, hierarchy) || {}

    const context: QuickAddContext = {
      node_type: node.type,
      activity_id: parentContext.activity_id || node.activity_id,
      activity_name: parentContext.activity_name,
      city_id: parentContext.city_id || node.city_id,
      city_name: parentContext.city_name,
      area_id: parentContext.area_id || node.area_id,
      area_name: parentContext.area_name,
      club_id: node.club_id,
      club_name: node.name
    }
    setExpandClubContext(context)
  }

  // Save expanded club target handler
  const handleSaveExpandedTarget = async (data: ExpandClubTargetData) => {
    const response = await fetch(`/api/targets/clubs/${data.club_id}/dimensional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        area_id: data.area_id,
        target_meetups: data.target_meetups,
        target_revenue: data.target_revenue,
        meetup_cost: data.meetup_cost,
        meetup_capacity: data.meetup_capacity,
        name: data.name,
        day_type_id: data.day_type_id
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || 'Failed to create expansion target')
    }

    // Refresh data after save, preserve scroll position
    await fetchData(true)
  }

  // Save new target handler
  const handleSaveTarget = async (data: { club_id: number; target_meetups: number; target_revenue: number; meetup_cost: number; meetup_capacity: number; area_id: number; activity_id: number; name?: string; day_type_id?: number | null }) => {
    const response = await fetch(`/api/targets/clubs/${data.club_id}/dimensional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        area_id: data.area_id,
        activity_id: data.activity_id,
        target_meetups: data.target_meetups,
        target_revenue: data.target_revenue,
        meetup_cost: data.meetup_cost,
        meetup_capacity: data.meetup_capacity,
        name: data.name,
        day_type_id: data.day_type_id
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || 'Failed to create target')
    }

    // Refresh data after save, preserve scroll position
    await fetchData(true)
  }

  // Edit target handler - opens edit modal for existing targets
  const handleEditTarget = (node: HierarchyNode) => {
    const isLaunch = node.is_launch || node.type === 'launch'
    setEditTargetContext({
      node,
      is_launch: isLaunch
    })
  }

  // Save edited target handler - updates existing target via PUT
  const handleSaveEditedTarget = async (data: {
    target_id: number
    club_id?: number
    launch_id?: number
    target_meetups: number
    target_revenue: number
    meetup_cost: number
    meetup_capacity: number
    is_launch: boolean
    name?: string
    day_type_id?: number | null
  }) => {
    const endpoint = data.is_launch
      ? `/api/targets/launches/${data.launch_id}/dimensional/${data.target_id}`
      : `/api/targets/clubs/${data.club_id}/dimensional/${data.target_id}`

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_meetups: data.target_meetups,
        target_revenue: data.target_revenue,
        meetup_cost: data.meetup_cost,
        meetup_capacity: data.meetup_capacity,
        name: data.name,
        day_type_id: data.day_type_id
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || 'Failed to update target')
    }

    // Refresh data after save, preserve scroll position
    await fetchData(true)
  }

  // Delete target handler - opens confirmation modal
  const handleDeleteTarget = (node: HierarchyNode) => {
    setDeleteTargetNode(node)
  }

  // Confirm delete target/launch - makes API call to delete
  const handleConfirmDeleteTarget = async () => {
    if (!deleteTargetNode) return

    const isLaunch = deleteTargetNode.is_launch || deleteTargetNode.type === 'launch'

    setDeletingTarget(true)
    try {
      let response: Response

      if (isLaunch) {
        // Delete launch - use launch_id
        const launchId = deleteTargetNode.launch_id
        if (!launchId) {
          throw new Error('Missing launch_id')
        }
        response = await fetch(`/api/targets/v2/launches/${launchId}`, {
          method: 'DELETE'
        })
      } else {
        // Delete target - use target_id and club_id
        const targetId = deleteTargetNode.target_id
        const clubId = deleteTargetNode.club_id

        if (!targetId || !clubId) {
          throw new Error('Missing target_id or club_id')
        }
        response = await fetch(`/api/targets/clubs/${clubId}/dimensional/${targetId}`, {
          method: 'DELETE'
        })
      }

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || `Failed to delete ${isLaunch ? 'launch' : 'target'}`)
      }

      // Refresh data after delete
      await fetchData(true)
      setDeleteTargetNode(null)
    } catch (error) {
      console.error('Delete failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete')
    } finally {
      setDeletingTarget(false)
    }
  }

  // Create task handler - opens scaling task modal with context
  const handleCreateTask = (node: HierarchyNode) => {
    setScalingTaskNode(node)
  }

  // Get scaling task context from node - includes all parent hierarchy names
  // Uses findParentContext to traverse hierarchy and get all parent names
  const getScalingTaskContext = (node: HierarchyNode) => {
    // Get parent context by traversing hierarchy
    const parentContext = findParentContext(node.id, hierarchy) || {}

    // For launches, use the node name as the club name (it's the planned club name)
    const isLaunch = node.type === 'launch'
    const clubName = isLaunch
      ? node.name  // Launch name is the planned club name
      : (node.club_name || (node.type === 'club' ? node.name : undefined))

    return {
      task_scope: node.type as 'activity' | 'city' | 'area' | 'club' | 'launch',
      // Use parent context for IDs and names, fall back to node properties
      activity_id: parentContext.activity_id || node.activity_id,
      activity_name: parentContext.activity_name || node.activity_name || (node.type === 'activity' ? node.name : undefined),
      city_id: parentContext.city_id || node.city_id,
      city_name: parentContext.city_name || node.city_name || (node.type === 'city' ? node.name : undefined),
      area_id: parentContext.area_id || node.area_id,
      area_name: parentContext.area_name || node.area_name || (node.type === 'area' ? node.name : undefined),
      club_id: node.club_id,
      club_name: clubName,
      launch_id: node.launch_id,
      launch_name: isLaunch ? node.name : undefined,
      // Include progress summary for pre-filling stage transition
      progress_summary: node.progress_summary
    }
  }

  // Save task handler
  const handleSaveTask = async (data: { title: string; description: string; priority: string; due_date?: string; club_id?: number; activity?: string; city?: string }) => {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        created_by: 'ScalingPlannerV2'
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || 'Failed to create task')
    }
  }

  // Edit stages handler - opens modal for clubs and launches with targets
  const handleEditStages = (node: HierarchyNode) => {
    // Allow editing stages for:
    // - Target rows (children of clubs with multiple targets)
    // - Clubs with target_id (single target displayed on club row)
    // - Launches with targets
    const isLaunch = node.is_launch || node.type === 'launch'
    const isTarget = node.type === 'target'
    if (isTarget || (node.type === 'club' && node.target_id) || (isLaunch && node.has_target)) {
      setEditingNode(node)
    }
  }

  // Save launch handler - creates a new launch
  const handleSaveLaunch = async (data: {
    activity_name: string
    planned_club_name: string
    area_id?: number
    target_meetups: number
    target_revenue: number
    meetup_cost: number
    meetup_capacity: number
    day_type_id?: number | null
  }) => {
    const response = await fetch('/api/targets/v2/launches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || 'Failed to create launch')
    }

    // Refresh data after save, preserve scroll position
    await fetchData(true)
  }

  // Save progress handler - supports both clubs and launches
  const handleSaveProgress = async (progress: StageProgress) => {
    if (!editingNode) return

    // Determine endpoint based on whether it's a launch or club
    const isLaunch = editingNode.is_launch
    let url: string

    if (isLaunch) {
      // Launch progress endpoint
      if (!editingNode.launch_id) return
      url = `/api/targets/v2/launches/${editingNode.launch_id}/progress`
    } else {
      // Club progress endpoint
      if (!editingNode.target_id || !editingNode.club_id) return
      url = `/api/targets/clubs/${editingNode.club_id}/dimensional/${editingNode.target_id}/progress`
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress })
    })

    if (!response.ok) {
      throw new Error('Failed to save progress')
    }

    // Refresh data after save, preserve scroll position
    await fetchData(true)
  }

  // Extract filter options from hierarchy data
  const filterOptions = useMemo(() => {
    const activities: { id: number; name: string }[] = []
    const cities: { id: number; name: string }[] = []
    const areas: { id: number; name: string }[] = []
    const clubs: { id: number; name: string }[] = []

    const collectOptions = (nodes: HierarchyNode[]) => {
      for (const node of nodes) {
        if (node.type === 'activity' && node.activity_id) {
          if (!activities.find(a => a.id === node.activity_id)) {
            activities.push({ id: node.activity_id, name: node.name })
          }
        } else if (node.type === 'city' && node.city_id) {
          if (!cities.find(c => c.id === node.city_id)) {
            cities.push({ id: node.city_id, name: node.name })
          }
        } else if (node.type === 'area' && node.area_id) {
          if (!areas.find(a => a.id === node.area_id)) {
            areas.push({ id: node.area_id, name: node.name })
          }
        } else if ((node.type === 'club' || node.type === 'launch') && node.club_id) {
          if (!clubs.find(c => c.id === node.club_id)) {
            clubs.push({ id: node.club_id, name: node.name })
          }
        }

        if (node.children) {
          collectOptions(node.children)
        }
      }
    }

    collectOptions(hierarchy)
    return { activities, cities, areas, clubs }
  }, [hierarchy])

  // Filter hierarchy based on selected filters
  // Properly propagates parent context down through the hierarchy
  const filteredHierarchy = useMemo(() => {
    const hasFilters =
      filters.activities.length > 0 ||
      filters.cities.length > 0 ||
      filters.areas.length > 0 ||
      filters.clubs.length > 0 ||
      filters.teams.length > 0 ||
      (filters.health && filters.health.length > 0)

    if (!hasFilters) return hierarchy

    // Context passed down from parent nodes
    interface FilterContext {
      activity_id?: number
      city_id?: number
      area_id?: number
    }

    // Filter function that preserves hierarchy structure and propagates context
    const filterNodes = (nodes: HierarchyNode[], parentContext: FilterContext = {}): HierarchyNode[] => {
      return nodes.map(node => {
        // Build context for this node (inherit from parent, override with node's own values)
        const context: FilterContext = {
          activity_id: node.activity_id || parentContext.activity_id,
          city_id: node.city_id || parentContext.city_id,
          area_id: node.area_id || parentContext.area_id
        }

        // Check if this node matches all applicable filters
        let matches = true

        // Activity filter - check context (inherited or own)
        if (filters.activities.length > 0) {
          if (!context.activity_id || !filters.activities.includes(context.activity_id)) {
            matches = false
          }
        }

        // City filter - check context
        if (filters.cities.length > 0) {
          if (!context.city_id || !filters.cities.includes(context.city_id)) {
            matches = false
          }
        }

        // Area filter - check context
        if (filters.areas.length > 0) {
          if (!context.area_id || !filters.areas.includes(context.area_id)) {
            matches = false
          }
        }

        // Club filter - only applies to club/launch nodes
        if (filters.clubs.length > 0) {
          if (node.type === 'club' || node.type === 'launch') {
            if (!node.club_id || !filters.clubs.includes(node.club_id)) {
              matches = false
            }
          }
          // For parent nodes, we'll check if any children match
        }

        // Team filter - check club/launch nodes
        if (filters.teams.length > 0) {
          if (node.type === 'club' || node.type === 'launch') {
            const nodeTeam = node.team as TeamKey | undefined
            if (!nodeTeam || !filters.teams.includes(nodeTeam)) {
              matches = false
            }
          }
          // For parent nodes, we'll check if any children match
        }

        // Health filter - check club/launch nodes by health_status
        if (filters.health && filters.health.length > 0) {
          if (node.type === 'club' || node.type === 'launch') {
            const nodeHealth = node.health_status as HealthFilter | undefined
            if (!nodeHealth || !filters.health.includes(nodeHealth)) {
              matches = false
            }
          }
          // For parent nodes, we'll check if any children match
        }

        // Filter children with this node's context
        const filteredChildren = node.children ? filterNodes(node.children, context) : []

        const hasMatchingChildren = filteredChildren.length > 0
        const isLeafNode = node.type === 'club' || node.type === 'launch' || node.type === 'target'

        // Determine if this node should be included:
        // - Leaf nodes (club/launch): must match all filters directly
        // - Parent nodes (activity/city/area): must have matching children when team/club filters are active
        //   OR match all filters when only activity/city/area filters are active

        const hasLeafFilters = filters.teams.length > 0 || filters.clubs.length > 0

        let includeNode = false
        if (isLeafNode) {
          // Leaf nodes must match all filters
          includeNode = matches
        } else if (hasLeafFilters) {
          // Parent nodes with team/club filters: ONLY include if they have matching children
          includeNode = hasMatchingChildren
        } else {
          // Parent nodes without team/club filters: include if matches or has children
          includeNode = matches || hasMatchingChildren
        }

        if (includeNode) {
          return {
            ...node,
            children: filteredChildren
          }
        }

        return null
      }).filter((node): node is HierarchyNode => node !== null)
    }

    return filterNodes(hierarchy)
  }, [hierarchy, filters])

  // Apply sorting to filtered hierarchy
  const sortedHierarchy = useMemo(() => {
    return sortHierarchy(filteredHierarchy, sortState)
  }, [filteredHierarchy, sortState])

  // Sort handler - cycles differ by column type:
  // Numeric columns: null → desc → asc → null (highest first)
  // Text columns (name): null → asc → desc → null (A-Z first)
  const handleSort = useCallback((column: SortColumn) => {
    setSortState(prev => {
      const isTextColumn = column === 'name'

      if (prev.column !== column) {
        // New column - start with desc for numeric, asc for text
        return { column, direction: isTextColumn ? 'asc' : 'desc' }
      }

      if (isTextColumn) {
        // Text: asc → desc → null
        if (prev.direction === 'asc') return { column, direction: 'desc' }
      } else {
        // Numeric: desc → asc → null
        if (prev.direction === 'desc') return { column, direction: 'asc' }
      }

      // Reset to no sort
      return { column: null, direction: null }
    })
  }, [])

  // Count visible items for rollup header
  const visibleCounts = useMemo(() => {
    let activities = 0, cities = 0, areas = 0, clubs = 0

    const countNodes = (nodes: HierarchyNode[]) => {
      for (const node of nodes) {
        if (node.type === 'activity') activities++
        else if (node.type === 'city') cities++
        else if (node.type === 'area') areas++
        else if (node.type === 'club' || node.type === 'launch') clubs++

        if (node.children) countNodes(node.children)
      }
    }

    countNodes(filteredHierarchy)
    return { activities, cities, areas, clubs }
  }, [filteredHierarchy])

  // Calculate filtered totals from filtered hierarchy (for SummaryTiles and rollup)
  const filteredTotals = useMemo(() => {
    let targetMeetups = 0
    let targetRevenue = 0
    let currentMeetups = 0
    let currentRevenue = 0
    const revenueStatuses: RevenueStatus[] = []

    const collectTotals = (nodes: HierarchyNode[]) => {
      for (const node of nodes) {
        if (node.type === 'club' || node.type === 'launch') {
          targetMeetups += node.target_meetups || 0
          targetRevenue += node.target_revenue || 0
          currentMeetups += node.current_meetups || 0
          currentRevenue += node.current_revenue || 0
          // Collect revenue status for aggregation
          if (node.revenue_status) {
            revenueStatuses.push(node.revenue_status)
          }
        }
        if (node.children) collectTotals(node.children)
      }
    }

    collectTotals(filteredHierarchy)

    // Aggregate all revenue statuses
    const aggregatedRevenueStatus: RevenueStatus = revenueStatuses.reduce((acc, status) => ({
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
    }), {
      np: 0, st: 0, s1: 0, s2: 0, s3: 0, s4: 0,
      realised_target: 0, realised_actual: 0, realisation_gap: 0,
      unattributed: 0, total_pipeline: 0, total_target: 0
    })

    return { targetMeetups, targetRevenue, currentMeetups, currentRevenue, revenueStatus: aggregatedRevenueStatus }
  }, [filteredHierarchy])

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return filters.activities.length > 0 ||
      filters.cities.length > 0 ||
      filters.areas.length > 0 ||
      filters.clubs.length > 0 ||
      filters.teams.length > 0 ||
      (filters.health && filters.health.length > 0)
  }, [filters])

  // Build filter context for rollup header (determines the hierarchy level for sprint/task)
  const rollupFilterContext = useMemo(() => {
    // Determine task scope based on most specific filter
    let task_scope: 'activity' | 'city' | 'area' | 'club' | 'all' = 'all'
    let activity_id: number | undefined
    let activity_name: string | undefined
    let city_id: number | undefined
    let city_name: string | undefined
    let area_id: number | undefined
    let area_name: string | undefined

    // If only one activity is filtered, use it
    if (filters.activities.length === 1) {
      const actNode = hierarchy.find(n => n.activity_id === filters.activities[0])
      if (actNode) {
        activity_id = actNode.activity_id
        activity_name = actNode.name
        task_scope = 'activity'
      }
    }

    // If only one city is filtered, use it
    if (filters.cities.length === 1) {
      // Find city in hierarchy
      for (const act of hierarchy) {
        const cityNode = act.children?.find(c => c.city_id === filters.cities[0])
        if (cityNode) {
          activity_id = act.activity_id
          activity_name = act.name
          city_id = cityNode.city_id
          city_name = cityNode.name
          task_scope = 'city'
          break
        }
      }
    }

    // If only one area is filtered, use it
    if (filters.areas.length === 1) {
      for (const act of hierarchy) {
        for (const city of act.children || []) {
          const areaNode = city.children?.find(a => a.area_id === filters.areas[0])
          if (areaNode) {
            activity_id = act.activity_id
            activity_name = act.name
            city_id = city.city_id
            city_name = city.name
            area_id = areaNode.area_id
            area_name = areaNode.name
            task_scope = 'area'
            break
          }
        }
      }
    }

    return { task_scope, activity_id, activity_name, city_id, city_name, area_id, area_name }
  }, [filters, hierarchy])

  // Create a synthetic node for the rollup sprint modal
  const rollupNode = useMemo((): HierarchyNode => {
    return {
      type: 'activity',
      id: 'rollup-all',
      name: hasActiveFilters ? 'Filtered Data' : 'All Data',
      activity_id: rollupFilterContext.activity_id,
      activity_name: rollupFilterContext.activity_name,
      city_id: rollupFilterContext.city_id,
      city_name: rollupFilterContext.city_name,
      area_id: rollupFilterContext.area_id,
      area_name: rollupFilterContext.area_name,
      target_meetups: filteredTotals.targetMeetups,
      target_revenue: filteredTotals.targetRevenue,
      current_meetups: filteredTotals.currentMeetups,
      current_revenue: filteredTotals.currentRevenue,
      gap_meetups: Math.max(0, filteredTotals.targetMeetups - filteredTotals.currentMeetups),
      gap_revenue: Math.max(0, filteredTotals.targetRevenue - filteredTotals.currentRevenue),
      club_count: visibleCounts.clubs,
      children: filteredHierarchy
    }
  }, [hasActiveFilters, rollupFilterContext, filteredTotals, visibleCounts, filteredHierarchy])

  // Flatten hierarchy for table rendering (uses sorted hierarchy)
  const flattenedRows = useMemo(() => {
    const rows: { node: HierarchyNode; level: number; expanded: boolean }[] = []

    const traverse = (nodes: HierarchyNode[], level: number, parentExpanded: boolean) => {
      if (!parentExpanded && level > 0) return

      for (const node of nodes) {
        const isExpanded = expandedNodes.has(node.id)
        rows.push({ node, level, expanded: isExpanded })

        if (node.children && isExpanded) {
          traverse(node.children, level + 1, true)
        }
      }
    }

    traverse(sortedHierarchy, 0, true)
    return rows
  }, [sortedHierarchy, expandedNodes])

  // Calculate completion percentage
  const completionPercent = useMemo(() => {
    if (!summary) return 0
    const total = summary.total_target_meetups
    const current = summary.total_current_meetups
    if (total === 0) return 0
    return Math.round((current / total) * 100)
  }, [summary])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={48} className="text-blue-600 animate-spin" />
          <span className="text-gray-600 font-medium">Loading Scaling Planner...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Failed to Load</h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg
              font-medium transition-colors flex items-center gap-2 mx-auto"
          >
            <RefreshCw size={18} />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Scaling Planner V2
            </h1>
            <p className="text-gray-500">Track targets across activities, cities, and areas</p>
          </div>
          <div className="flex items-center gap-3">
            <WeekSelector
              selectedWeek={selectedWeek}
              onWeekChange={setSelectedWeek}
              weekBounds={weekBounds}
              onCustomWeekChange={(start) => setCustomWeekStart(start)}
            />
            <button
              onClick={() => setFeedbackModalOpen(true)}
              className="p-2 rounded-lg bg-white hover:bg-indigo-50 text-gray-600
                hover:text-indigo-600 transition-all border border-gray-200 shadow-sm"
              title="Submit Feedback"
            >
              <MessageSquarePlus size={20} />
            </button>
            <button
              onClick={() => fetchData()}
              className="p-2 rounded-lg bg-white hover:bg-gray-100 text-gray-600
                hover:text-gray-900 transition-all border border-gray-200 shadow-sm"
            >
              <RefreshCw size={20} />
            </button>
          </div>
        </div>

        {/* Summary Tiles - uses filtered totals when filters are active */}
        <SummaryTiles
          summary={summary}
          trends={trends}
          filteredTotals={hasActiveFilters ? filteredTotals : null}
          isFiltered={hasActiveFilters}
          revenueStatus={filteredTotals?.revenueStatus || null}
        />

        {/* Filter Bar with Hierarchy Order Controls */}
        <HierarchyFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          filterOptions={filterOptions}
          hierarchyOrder={{
            hierarchyLevels,
            enabledLevels,
            draggingLevel,
            isCustomHierarchy,
            onDragStart: handleDragStart,
            onDragEnd: handleDragEnd,
            onDragOver: handleDragOver,
            onDrop: handleDrop,
            onToggleLevel: toggleLevel,
            onReset: () => {
              setHierarchyLevels(['activity', 'city', 'area']);
              setEnabledLevels(new Set(['activity', 'city', 'area']));
            }
          }}
        />

        {/* Hierarchy Table */}
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div ref={tableContainerRef} className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200">
                  <SortableHeader
                    label="Hierarchy"
                    column="name"
                    currentSort={sortState}
                    onSort={handleSort}
                    align="left"
                  />
                  <th className="py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">
                    <div className="flex items-center gap-1.5 justify-center">
                      <span>Health</span>
                      <InfoIconButton onClick={() => setHealthInfoModalOpen(true)} />
                    </div>
                  </th>
                  <SortableHeader
                    label="Target"
                    column="target_meetups"
                    currentSort={sortState}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="Current"
                    column="current_meetups"
                    currentSort={sortState}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="Gap"
                    column="gap_meetups"
                    currentSort={sortState}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="L4W Revenue"
                    column="l4w_revenue"
                    currentSort={sortState}
                    onSort={handleSort}
                    align="right"
                  />
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      Meetup Stage
                      <InfoIconButton onClick={() => setStageInfoModalType('meetup_stage')} />
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      Revenue Status (₹K)
                      <InfoIconButton onClick={() => setStageInfoModalType('revenue_status')} />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status Update
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Tasks
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Add/Edit Target
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Sticky rollup header row - always shown as first row */}
                <HierarchyRollupHeader
                  filteredData={filteredHierarchy}
                  visibleCounts={visibleCounts}
                  isFiltered={hasActiveFilters}
                  activeTeamFilter={filters.teams.length === 1 ? filters.teams[0] as TeamKey : undefined}
                  onOpenSprint={() => setSprintNode(rollupNode)}
                  onCreateTask={() => setScalingTaskNode(rollupNode)}
                  filterContext={rollupFilterContext}
                />
                {flattenedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center">
                      <div className="text-gray-400">
                        <Target size={48} className="mx-auto mb-4 opacity-50" />
                        <p className="font-medium">No targets found</p>
                        <p className="text-sm mt-1">Add dimensional targets to see them here</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  flattenedRows.map(({ node, level, expanded }) => (
                    <HierarchyRow
                      key={node.id}
                      node={node}
                      level={level}
                      expanded={expanded}
                      onToggle={() => toggleNode(node.id)}
                      onEditTarget={handleEditTarget}
                      onDeleteTarget={handleDeleteTarget}
                      onAddAtAreaLevel={handleAddAtAreaLevel}
                      onExpandClub={handleExpandClub}
                      onCreateTask={handleCreateTask}
                      onEditStages={handleEditStages}
                      onOpenSprint={(n) => setSprintNode(n)}
                      taskSummary={getTaskSummary(node)}
                      weekBounds={weekBounds}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Stage Editor Modal */}
      <StageEditorModal
        isOpen={editingNode !== null}
        onClose={() => setEditingNode(null)}
        node={editingNode}
        onSave={handleSaveProgress}
      />

      {/* Quick Add Target Modal */}
      <QuickAddModal
        isOpen={quickAddContext !== null}
        onClose={() => setQuickAddContext(null)}
        context={quickAddContext}
        onSave={handleSaveTarget}
      />

      {/* Edit Target Modal */}
      <EditTargetModal
        isOpen={editTargetContext !== null}
        onClose={() => setEditTargetContext(null)}
        context={editTargetContext}
        onSave={handleSaveEditedTarget}
      />

      {/* Delete Target Confirmation Modal */}
      {deleteTargetNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !deletingTarget && setDeleteTargetNode(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-red-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Trash2 size={20} className="text-red-600" />
                  Delete Target
                </h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
              <button
                onClick={() => !deletingTarget && setDeleteTargetNode(null)}
                className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
                disabled={deletingTarget}
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-gray-700">
                Are you sure you want to delete the target for <span className="font-semibold">{deleteTargetNode.name}</span>?
              </p>
              {deleteTargetNode.target_meetups && (
                <p className="text-sm text-gray-500 mt-2">
                  Target: {deleteTargetNode.target_meetups} meetups
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setDeleteTargetNode(null)}
                disabled={deletingTarget}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300
                  rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteTarget}
                disabled={deletingTarget}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-red-600
                  rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deletingTarget ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Launch Modal */}
      <LaunchModal
        isOpen={launchContext !== null}
        onClose={() => setLaunchContext(null)}
        context={launchContext}
        onSave={handleSaveLaunch}
      />

      {/* Add Choice Modal (Area level: New Launch vs Expand) */}
      <AddChoiceModal
        isOpen={addChoiceContext !== null}
        onClose={() => setAddChoiceContext(null)}
        onNewLaunch={() => {
          if (addChoiceContext) {
            handleAddLaunch(addChoiceContext)
          }
        }}
        onExpandClub={() => {
          if (addChoiceContext) {
            setExpandClubContext(addChoiceContext)
          }
        }}
        areaName={addChoiceContext?.area_name}
      />

      {/* Expand Club Modal (Add target for existing club in new area) */}
      {expandClubContext && (
        <ExpandClubModal
          isOpen={true}
          onClose={() => setExpandClubContext(null)}
          onSave={handleSaveExpandedTarget}
          context={expandClubContext}
        />
      )}

      {/* Sprint View Modal (Jira-like weekly tasks) */}
      {sprintNode && (
        <SprintViewModal
          isOpen={sprintNode !== null}
          onClose={() => {
            setSprintNode(null)
            fetchTaskSummaries() // Refresh summaries after modal closes
          }}
          node={sprintNode}
          context={getScalingTaskContext(sprintNode)}
        />
      )}

      {/* Scaling Task Create Modal */}
      {scalingTaskNode && (
        <ScalingTaskCreateModal
          isOpen={scalingTaskNode !== null}
          onClose={() => setScalingTaskNode(null)}
          onCreated={() => {
            setScalingTaskNode(null)
            fetchTaskSummaries() // Refresh summaries after task creation
          }}
          context={getScalingTaskContext(scalingTaskNode)}
        />
      )}

      {/* Stage Info Modal (Meetup Stage and Revenue Status guide) */}
      <StageInfoModal
        isOpen={stageInfoModalType !== null}
        onClose={() => setStageInfoModalType(null)}
        type={stageInfoModalType || 'meetup_stage'}
      />

      {/* Health Info Modal (Health calculation explanation) */}
      <HealthInfoModal
        isOpen={healthInfoModalOpen}
        onClose={() => setHealthInfoModalOpen(false)}
      />

      {/* Feedback Modal (Feature request / Bug report) */}
      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
      />
    </div>
  )
}
