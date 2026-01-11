import React from 'react'
import { Calendar, Layers, Target, TrendingUp, ChevronRight } from 'lucide-react'
import type { RevenueStatus } from '../../../../shared/types'

interface MonthlyRevenueData {
  month: string
  year: number
  revenue: number
}

interface SummaryData {
  total_target_meetups: number
  total_target_revenue: number
  total_current_meetups: number
  total_current_revenue: number
  total_clubs: number
  total_launches: number
  monthly_target_meetups: number
  monthly_target_revenue: number
  last_4w_revenue_total: number
  last_4w_revenue_avg: number
  march_2026_revenue: number
  monthly_revenue?: MonthlyRevenueData[]
}

interface TrendsData {
  summary: {
    trend_direction: 'up' | 'down' | 'stable'
    trend_percentage: number
  }
}

// Filtered totals from the hierarchy rollup
interface FilteredTotals {
  targetMeetups: number
  targetRevenue: number
  currentMeetups: number
  currentRevenue: number
}

interface SummaryTilesProps {
  summary: SummaryData | null
  trends: TrendsData | null
  // Filtered totals - if provided, use these instead of summary
  filteredTotals?: FilteredTotals | null
  isFiltered?: boolean
  // Aggregated revenue status for projected calculation
  revenueStatus?: RevenueStatus | null
}

// Format currency in Lakhs or K
const formatCurrency = (value: number): string => {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(1)}L`
  }
  return `₹${(value / 1000).toFixed(1)}K`
}

// Get current month name and year
const getCurrentMonthLabel = (): string => {
  const now = new Date()
  return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Monthly Revenue Tile Component
function MonthlyRevenueTile({ monthlyRevenue }: { monthlyRevenue?: MonthlyRevenueData[] }) {
  if (!monthlyRevenue || monthlyRevenue.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={14} className="text-amber-500" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Actual Revenue Trend
          </span>
        </div>
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={14} className="text-amber-500" />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Actual Revenue Trend
        </span>
      </div>

      <div className="flex justify-between">
        {monthlyRevenue.map((month) => {
          const isZero = month.revenue === 0
          return (
            <div key={`${month.month}-${month.year}`} className="text-center flex-1">
              <div className={`text-sm font-semibold tabular-nums ${isZero ? 'text-gray-300' : 'text-gray-800'}`}>
                {formatCurrency(month.revenue)}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                {month.month}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SummaryTiles({ summary, trends, filteredTotals, isFiltered, revenueStatus }: SummaryTilesProps) {
  if (!summary) return null

  // Use filtered totals if available, otherwise use summary
  const targetMeetups = filteredTotals ? filteredTotals.targetMeetups : summary.total_target_meetups
  const targetRevenue = filteredTotals ? filteredTotals.targetRevenue : summary.total_target_revenue
  const currentMeetups = filteredTotals ? filteredTotals.currentMeetups : summary.total_current_meetups
  const currentRevenue = filteredTotals ? filteredTotals.currentRevenue : summary.total_current_revenue

  // Monthly targets (weekly × 4.2)
  const monthlyTargetMeetups = Math.round(targetMeetups * 4.2)
  const monthlyTargetRevenue = Math.round(targetRevenue * 4.2)

  // Projected achievement (current weekly × 4.2)
  const projectedMeetups = Math.round(currentMeetups * 4.2)

  // Revenue projections from revenue status
  // Projected = (realised_actual + unattributed) × 4.2 (potential from current meetups)
  const realisedActual = revenueStatus?.realised_actual || 0
  const unattributed = revenueStatus?.unattributed || 0
  const projectedRevenue = Math.round((realisedActual + unattributed) * 4.2)

  // Realisation Gap = expected revenue from realised meetups - actual collected
  // This represents revenue potential not captured from meetups that already happened
  const realisationGap = (revenueStatus?.realisation_gap || 0) * 4.2

  // Achievement percentage
  const meetupAchievement = monthlyTargetMeetups > 0 ? Math.round((projectedMeetups / monthlyTargetMeetups) * 100) : 0
  const revenueAchievement = monthlyTargetRevenue > 0 ? Math.round((projectedRevenue / monthlyTargetRevenue) * 100) : 0

  return (
    <div className="mb-6">
      {isFiltered && (
        <div className="mb-2 text-xs text-gray-500 font-medium">
          Showing filtered data
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Monthly Meetups - Target vs Projected */}
        <div className="bg-white rounded-xl border border-gray-100 p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {/* Header */}
              <div className="flex items-center gap-2 mb-2 md:mb-3">
                <Target size={14} className="text-blue-500" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Monthly Projected Meetups
                </span>
              </div>

              {/* Two column layout: Target | Projected */}
              <div className="flex items-start gap-4 md:gap-6">
                {/* Target Column */}
                <div className="flex-1">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">Target</p>
                  <div className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
                    {monthlyTargetMeetups.toLocaleString()}
                  </div>
                  <p className="text-[9px] md:text-[10px] text-gray-400 mt-0.5">weekly × 4.2</p>
                </div>

                {/* Divider */}
                <div className="w-px h-10 md:h-12 bg-gray-200 self-center" />

                {/* Projected Column */}
                <div className="flex-1">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">Projected</p>
                  <div className={`text-xl md:text-2xl font-bold tracking-tight ${
                    meetupAchievement >= 100 ? 'text-emerald-600' :
                    meetupAchievement >= 75 ? 'text-amber-600' : 'text-red-500'
                  }`}>
                    {projectedMeetups.toLocaleString()}
                  </div>
                  <p className={`text-[9px] md:text-[10px] font-semibold mt-0.5 ${
                    meetupAchievement >= 100 ? 'text-emerald-600' :
                    meetupAchievement >= 75 ? 'text-amber-600' : 'text-red-500'
                  }`}>
                    {meetupAchievement}% of target
                  </p>
                </div>
              </div>
            </div>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Layers size={16} className="text-blue-500" />
            </div>
          </div>
        </div>

        {/* Monthly Revenue - Target vs Projected vs Gap */}
        <div className="bg-white rounded-xl border border-gray-100 p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {/* Header */}
              <div className="flex items-center gap-2 mb-2 md:mb-3">
                <Target size={14} className="text-emerald-500" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Monthly Projected Revenue
                </span>
              </div>

              {/* Three column layout: Target | Projected | Gap */}
              <div className="flex items-start gap-2 md:gap-4">
                {/* Target Column */}
                <div className="flex-1">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">Target</p>
                  <div className="text-lg md:text-xl font-bold text-gray-900 tracking-tight">
                    {formatCurrency(monthlyTargetRevenue)}
                  </div>
                  <p className="text-[9px] md:text-[10px] text-gray-400 mt-0.5">weekly × 4.2</p>
                </div>

                {/* Divider */}
                <div className="w-px h-10 md:h-12 bg-gray-200 self-center" />

                {/* Projected Column */}
                <div className="flex-1">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">Projected</p>
                  <div className={`text-lg md:text-xl font-bold tracking-tight ${
                    revenueAchievement >= 100 ? 'text-emerald-600' :
                    revenueAchievement >= 75 ? 'text-amber-600' : 'text-red-500'
                  }`}>
                    {formatCurrency(projectedRevenue)}
                  </div>
                  <p className="text-[9px] md:text-[10px] text-gray-500 mt-0.5">
                    projected from<br/>current meetups
                  </p>
                </div>

                {/* Divider */}
                <div className="w-px h-10 md:h-12 bg-gray-200 self-center" />

                {/* Realisation Gap Column */}
                <div className="flex-1">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">RG</p>
                  <div className={`text-lg md:text-xl font-bold tracking-tight ${
                    realisationGap === 0 ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    {realisationGap > 0 ? formatCurrency(realisationGap) : '✓'}
                  </div>
                  <p className="text-[9px] md:text-[10px] text-gray-500 mt-0.5">
                    {realisationGap === 0 ? 'fully captured!' : 'potential not captured\nfor realised meetups'}
                  </p>
                </div>
              </div>
            </div>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <TrendingUp size={16} className="text-emerald-500" />
            </div>
          </div>
        </div>

        {/* Monthly Revenue Trend (Sep 2025 - Mar 2026) */}
        <MonthlyRevenueTile monthlyRevenue={summary.monthly_revenue} />
      </div>
    </div>
  )
}

export default SummaryTiles
