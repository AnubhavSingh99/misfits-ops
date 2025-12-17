import { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, Users, DollarSign, Activity, Target, Zap, Star, ArrowRight, Calendar } from 'lucide-react'

interface RevenueData {
  month: string
  total_revenue_rupees: number
}

interface ClubData {
  club_name: string
  activity: string
  club_level: string
  total_events: number
  active_weeks: number
}

interface GrowthData {
  totalGrowth: {
    currentTotal: number
    previousTotal: number
    percentGrowth: number
  }
  monthlyData: RevenueData[]
  topActivities: Array<{
    activity: string
    revenue: number
    growth: number
  }>
  clubAnalysis: {
    l1Clubs: number
    l2Clubs: number
    totalActiveClubs: number
    avgEventsPerWeek: number
  }
}

export function RevenueGrowth() {
  const [growthData, setGrowthData] = useState<GrowthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchGrowthData = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/revenue-growth')
        if (!response.ok) {
          throw new Error('Failed to fetch revenue growth data')
        }
        const data = await response.json()
        setGrowthData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchGrowthData()
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 p-6 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 shadow-xl border border-red-100 max-w-md w-full text-center">
          <div className="p-3 bg-red-500 rounded-lg w-fit mx-auto mb-4">
            <TrendingUp className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-xl font-bold text-red-800 mb-2">Error Loading Data</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 rounded-2xl p-8 text-white shadow-2xl overflow-hidden">
          {/* Background decorations */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-20 translate-x-20"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-16 -translate-x-16"></div>
          <div className="absolute top-1/2 right-1/4 w-2 h-2 bg-white/20 rounded-full"></div>
          <div className="absolute top-1/4 right-1/3 w-1 h-1 bg-white/30 rounded-full"></div>
          <div className="absolute bottom-1/3 right-1/2 w-1.5 h-1.5 bg-white/25 rounded-full"></div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-bold">Revenue Growth Analysis</h1>
            </div>
            <p className="text-blue-100 text-lg">
              Comprehensive revenue analytics and growth insights from PRD v8.1
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="relative">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-200"></div>
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent absolute top-0 left-0"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-purple-600 animate-pulse" />
              </div>
            </div>
          </div>
        ) : growthData ? (
          <>
            {/* Overall Growth Metrics */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">Growth Overview</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Revenue Growth */}
                <div className="group bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-green-500 rounded-lg group-hover:scale-110 transition-transform">
                      <DollarSign className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-semibold text-green-800">Revenue Growth</span>
                  </div>
                  <div className="space-y-2">
                    <div className="text-2xl font-bold text-green-600">
                      {growthData.totalGrowth.percentGrowth > 0 ? '+' : ''}{growthData.totalGrowth.percentGrowth.toFixed(1)}%
                    </div>
                    <div className="text-sm text-green-700">
                      ₹{growthData.totalGrowth.currentTotal.toLocaleString()} total
                    </div>
                  </div>
                </div>

                {/* Active Clubs */}
                <div className="group bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-blue-500 rounded-lg group-hover:scale-110 transition-transform">
                      <Users className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-semibold text-blue-800">Active Clubs</span>
                  </div>
                  <div className="space-y-2">
                    <div className="text-2xl font-bold text-blue-600">
                      {growthData.clubAnalysis.totalActiveClubs}
                    </div>
                    <div className="text-sm text-blue-700">
                      {growthData.clubAnalysis.l2Clubs} L2 • {growthData.clubAnalysis.l1Clubs} L1
                    </div>
                  </div>
                </div>

                {/* Average Events */}
                <div className="group bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-purple-500 rounded-lg group-hover:scale-110 transition-transform">
                      <Calendar className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-semibold text-purple-800">Events/Week</span>
                  </div>
                  <div className="space-y-2">
                    <div className="text-2xl font-bold text-purple-600">
                      {growthData.clubAnalysis.avgEventsPerWeek.toFixed(1)}
                    </div>
                    <div className="text-sm text-purple-700">
                      Average per club
                    </div>
                  </div>
                </div>

                {/* Top Activity */}
                <div className="group bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-6 border border-orange-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-orange-500 rounded-lg group-hover:scale-110 transition-transform">
                      <Star className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-semibold text-orange-800">Top Activity</span>
                  </div>
                  <div className="space-y-2">
                    <div className="text-lg font-bold text-orange-600 capitalize">
                      {growthData.topActivities[0]?.activity || 'N/A'}
                    </div>
                    <div className="text-sm text-orange-700">
                      ₹{growthData.topActivities[0]?.revenue.toLocaleString() || '0'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly Revenue Trend */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800">Monthly Revenue Trend</h3>
              </div>

              <div className="space-y-4">
                {growthData.monthlyData.map((month, index) => {
                  const maxRevenue = Math.max(...growthData.monthlyData.map(m => m.total_revenue_rupees))
                  const percentage = (month.total_revenue_rupees / maxRevenue) * 100

                  return (
                    <div key={month.month} className="group">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-700 capitalize">
                          {new Date(month.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </span>
                        <span className="font-bold text-gray-900">
                          ₹{month.total_revenue_rupees.toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-1000 ease-out group-hover:from-purple-500 group-hover:to-pink-500"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Top Activities by Revenue */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg">
                  <Activity className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800">Top Activities by Revenue</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {growthData.topActivities.map((activity, index) => (
                  <div key={activity.activity} className="group bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                        {index + 1}
                      </div>
                      <span className="font-semibold text-gray-800 capitalize">{activity.activity}</span>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-600">Revenue</span>
                          <span className="font-bold text-gray-900">₹{activity.revenue.toLocaleString()}</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-600">Growth</span>
                          <span className={`font-bold ${activity.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {activity.growth >= 0 ? '+' : ''}{activity.growth.toFixed(1)}%
                          </span>
                        </div>
                        <div className="bg-gray-300 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${
                              activity.growth >= 0 ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-red-400 to-red-500'
                            }`}
                            style={{ width: `${Math.min(Math.abs(activity.growth), 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actionable Insights */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg">
                  <Target className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800">Actionable Insights</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Growth momentum insight */}
                <div className="bg-white rounded-xl p-5 border border-purple-200 shadow-md hover:shadow-lg transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-purple-500 rounded-lg">
                      <Zap className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-bold text-purple-800">Top Performer</span>
                  </div>
                  <p className="text-sm text-purple-700 leading-relaxed">
                    🏆 Analyze your best-performing club's strategy.
                    <br /><br />
                    <span className="font-semibold">Action:</span> Document and replicate successful approaches across other clubs.
                  </p>
                </div>

                {/* Revenue velocity insight */}
                <div className="bg-white rounded-xl p-5 border border-indigo-200 shadow-md hover:shadow-lg transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-indigo-500 rounded-lg">
                      <BarChart3 className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-bold text-indigo-800">Growth Velocity</span>
                  </div>
                  <p className="text-sm text-indigo-700 leading-relaxed">
                    ⚡ Period comparison shows {growthData.totalGrowth.percentGrowth > 0 ? 'positive' : 'mixed'} momentum.
                    <br /><br />
                    <span className="font-semibold">Next:</span> Set targets for next quarter based on current trends.
                  </p>
                </div>

                {/* Market opportunity insight */}
                <div className="bg-white rounded-xl p-5 border border-teal-200 shadow-md hover:shadow-lg transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-teal-500 rounded-lg">
                      <Activity className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-bold text-teal-800">Market Opportunity</span>
                  </div>
                  <p className="text-sm text-teal-700 leading-relaxed">
                    🎯 Growth composition reveals expansion opportunities.
                    <br /><br />
                    <span className="font-semibold">Focus:</span> Scale activities showing consistent growth patterns.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}