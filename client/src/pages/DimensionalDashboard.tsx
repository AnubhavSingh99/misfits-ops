import React, { useState, useEffect } from 'react'
import {
  MapPin,
  Calendar,
  Layers,
  Activity,
  Building2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Download,
  Filter,
  Target,
  TrendingUp,
  Plus
} from 'lucide-react'
import { DimensionalTargetsService } from '../services/api'
import DimensionalTargetModal from '../components/DimensionalTargetModal'

type AggregationType = 'area' | 'city' | 'day_type' | 'format' | 'activity'

interface AggregationData {
  id: number
  name: string
  parent_name?: string
  total_target_meetups: number
  total_target_revenue: number
  club_count: number
  area_count?: number
  children?: AggregationData[]
}

export default function DimensionalDashboard() {
  // View state
  const [activeView, setActiveView] = useState<AggregationType>('city')
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // Data state
  const [data, setData] = useState<AggregationData[]>([])
  const [grandTotal, setGrandTotal] = useState({
    total_target_meetups: 0,
    total_target_revenue: 0,
    count: 0
  })
  const [summary, setSummary] = useState<any>(null)

  // Loading and error states
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [testClub, setTestClub] = useState<{ id: number; name: string } | null>(null)

  // Filter state
  const [filters, setFilters] = useState({
    activity: '',
    city: ''
  })
  const [filterOptions, setFilterOptions] = useState({
    activities: [] as Array<{ activity_id: number; activity_name: string }>,
    cities: [] as Array<{ city_id: number; city_name: string }>
  })

  // Load data when view changes
  useEffect(() => {
    loadData()
  }, [activeView])

  // Load filter options
  useEffect(() => {
    loadFilterOptions()
    loadSummary()
  }, [])

  const loadFilterOptions = async () => {
    try {
      const response = await DimensionalTargetsService.getFilterOptions()
      if (response.success) {
        setFilterOptions({
          activities: response.activities,
          cities: response.cities
        })
      }
    } catch (err) {
      console.error('Error loading filter options:', err)
    }
  }

  const loadSummary = async () => {
    try {
      const response = await DimensionalTargetsService.getDashboardSummary()
      if (response.success) {
        setSummary(response.summary)
      }
    } catch (err) {
      console.error('Error loading summary:', err)
    }
  }

  // Load a test club for adding targets
  const loadTestClub = async () => {
    try {
      const response = await fetch('/api/targets/activities/Badminton/clubs')
      const data = await response.json()
      if (data.success && data.clubs?.length > 0) {
        const club = data.clubs[0]
        setTestClub({ id: club.club_pk, name: club.club_name })
      }
    } catch (err) {
      console.error('Error loading test club:', err)
    }
  }

  const handleAddTarget = async () => {
    if (!testClub) {
      await loadTestClub()
    }
    setShowAddModal(true)
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      setExpandedRows(new Set())

      let response
      switch (activeView) {
        case 'area':
          response = await DimensionalTargetsService.getDashboardByArea()
          if (response.success) {
            setData(response.data?.map(item => ({
              id: item.area_id,
              name: item.area_name,
              parent_name: item.city_name,
              total_target_meetups: item.total_target_meetups,
              total_target_revenue: item.total_target_revenue,
              club_count: item.club_count
            })) || [])
            setGrandTotal({
              total_target_meetups: response.grand_total?.total_target_meetups || 0,
              total_target_revenue: response.grand_total?.total_target_revenue || 0,
              count: response.grand_total?.area_count || 0
            })
          }
          break

        case 'city':
          response = await DimensionalTargetsService.getDashboardByCity()
          if (response.success) {
            setData(response.data?.map(item => ({
              id: item.city_id,
              name: item.city_name,
              total_target_meetups: item.total_target_meetups,
              total_target_revenue: item.total_target_revenue,
              club_count: item.club_count,
              area_count: item.area_count,
              children: item.areas?.map(a => ({
                id: a.area_id,
                name: a.area_name,
                total_target_meetups: a.total_target_meetups,
                total_target_revenue: a.total_target_revenue,
                club_count: a.club_count
              }))
            })) || [])
            setGrandTotal({
              total_target_meetups: response.grand_total?.total_target_meetups || 0,
              total_target_revenue: response.grand_total?.total_target_revenue || 0,
              count: response.grand_total?.city_count || 0
            })
          }
          break

        case 'day_type':
          response = await DimensionalTargetsService.getDashboardByDayType()
          if (response.success) {
            setData(response.data?.map(item => ({
              id: item.day_type_id,
              name: item.day_type,
              total_target_meetups: item.total_target_meetups,
              total_target_revenue: item.total_target_revenue,
              club_count: item.club_count
            })) || [])
            setGrandTotal({
              total_target_meetups: response.grand_total?.total_target_meetups || 0,
              total_target_revenue: response.grand_total?.total_target_revenue || 0,
              count: response.data?.length || 0
            })
          }
          break

        case 'format':
          response = await DimensionalTargetsService.getDashboardByFormat()
          if (response.success) {
            setData(response.data?.map(item => ({
              id: item.format_id,
              name: item.format_name,
              total_target_meetups: item.total_target_meetups,
              total_target_revenue: item.total_target_revenue,
              club_count: item.club_count
            })) || [])
            setGrandTotal({
              total_target_meetups: response.grand_total?.total_target_meetups || 0,
              total_target_revenue: response.grand_total?.total_target_revenue || 0,
              count: response.data?.length || 0
            })
          }
          break

        case 'activity':
          response = await DimensionalTargetsService.getDashboardByActivity()
          if (response.success) {
            setData(response.data?.map(item => ({
              id: item.activity_id,
              name: item.activity_name || `Activity ${item.activity_id}`,
              total_target_meetups: item.total_target_meetups,
              total_target_revenue: item.total_target_revenue,
              club_count: item.club_count
            })) || [])
            setGrandTotal({
              total_target_meetups: response.grand_total?.total_target_meetups || 0,
              total_target_revenue: response.grand_total?.total_target_revenue || 0,
              count: response.grand_total?.activity_count || 0
            })
          }
          break
      }
    } catch (err) {
      setError('Failed to load data')
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleRow = (id: number) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const exportToCSV = () => {
    const headers = ['Name', 'Parent', 'Target Meetups', 'Target Revenue', 'Club Count']
    const rows = data.map(item => [
      item.name,
      item.parent_name || '-',
      item.total_target_meetups,
      item.total_target_revenue,
      item.club_count
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dimensional-targets-${activeView}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const viewTabs = [
    { key: 'city', label: 'By City', icon: Building2 },
    { key: 'area', label: 'By Area', icon: MapPin },
    { key: 'day_type', label: 'By Day Type', icon: Calendar },
    { key: 'format', label: 'By Format', icon: Layers },
    { key: 'activity', label: 'By Activity', icon: Activity }
  ] as const

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dimensional Targets Dashboard</h1>
            <p className="text-gray-600 mt-1">View and analyze targets aggregated by different dimensions</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={loadData}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
            <button
              onClick={exportToCSV}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handleAddTarget}
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Target</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Target className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Total Target Meetups</div>
                <div className="text-xl font-bold text-gray-900">
                  {summary.total_target_meetups?.toLocaleString() || 0}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Total Target Revenue</div>
                <div className="text-xl font-bold text-gray-900">
                  ₹{((summary.total_target_revenue || 0) / 100).toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Building2 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Clubs with Targets</div>
                <div className="text-xl font-bold text-gray-900">
                  {summary.total_clubs_with_targets || 0}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Activity className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Launches with Targets</div>
                <div className="text-xl font-bold text-gray-900">
                  {summary.total_launches_with_targets || 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Tabs */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="border-b border-gray-200 px-6">
          <nav className="-mb-px flex space-x-6" aria-label="Tabs">
            {viewTabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveView(tab.key)}
                  className={`
                    py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2
                    ${activeView === tab.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Data Table */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12 text-gray-500">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Loading targets...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-600 mb-4">{error}</div>
              <button
                onClick={loadData}
                className="text-blue-600 hover:text-blue-800"
              >
                Try Again
              </button>
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Target className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">No targets found</p>
              <p className="text-sm mt-1">Start by adding dimensional targets to clubs or launches</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {activeView === 'city' ? 'City' :
                       activeView === 'area' ? 'Area' :
                       activeView === 'day_type' ? 'Day Type' :
                       activeView === 'format' ? 'Format' : 'Activity'}
                    </th>
                    {activeView === 'area' && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        City
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Clubs
                    </th>
                    {activeView === 'city' && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Areas
                      </th>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Target Meetups
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Target Revenue
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.map((row) => (
                    <React.Fragment key={row.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {row.children && row.children.length > 0 && (
                              <button
                                onClick={() => toggleRow(row.id)}
                                className="mr-2 text-gray-400 hover:text-gray-600"
                              >
                                {expandedRows.has(row.id) ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            <span className="text-sm font-medium text-gray-900">{row.name}</span>
                          </div>
                        </td>
                        {activeView === 'area' && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {row.parent_name}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.club_count}
                        </td>
                        {activeView === 'city' && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {row.area_count || 0}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {row.total_target_meetups.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          ₹{(row.total_target_revenue / 100).toLocaleString()}
                        </td>
                      </tr>

                      {/* Expanded Children (for City view) */}
                      {expandedRows.has(row.id) && row.children && row.children.map(child => (
                        <tr key={`${row.id}-${child.id}`} className="bg-gray-50">
                          <td className="px-6 py-3 whitespace-nowrap">
                            <div className="flex items-center pl-8">
                              <span className="text-sm text-gray-600">{child.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                            {child.club_count}
                          </td>
                          {activeView === 'city' && (
                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                              -
                            </td>
                          )}
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                            {child.total_target_meetups.toLocaleString()}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                            ₹{(child.total_target_revenue / 100).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}

                  {/* Grand Total Row */}
                  <tr className="bg-gray-100 font-semibold">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      TOTAL ({grandTotal.count} {activeView === 'city' ? 'cities' :
                             activeView === 'area' ? 'areas' :
                             activeView === 'day_type' ? 'day types' :
                             activeView === 'format' ? 'formats' : 'activities'})
                    </td>
                    {activeView === 'area' && (
                      <td className="px-6 py-4 whitespace-nowrap"></td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {data.reduce((sum, r) => sum + r.club_count, 0)}
                    </td>
                    {activeView === 'city' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {data.reduce((sum, r) => sum + (r.area_count || 0), 0)}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {grandTotal.total_target_meetups.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      ₹{(grandTotal.total_target_revenue / 100).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/scaling-targets"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <Target className="h-5 w-5 text-blue-600" />
              <div>
                <div className="font-medium text-gray-900">Manage Club Targets</div>
                <div className="text-sm text-gray-500">Add or edit dimensional targets for clubs</div>
              </div>
            </div>
          </a>

          <button
            onClick={() => DimensionalTargetsService.syncDimensions().then(() => {
              alert('Dimensions synced successfully!')
              loadData()
            })}
            className="p-4 border border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors text-left"
          >
            <div className="flex items-center space-x-3">
              <RefreshCw className="h-5 w-5 text-green-600" />
              <div>
                <div className="font-medium text-gray-900">Sync Dimensions</div>
                <div className="text-sm text-gray-500">Update areas and cities from production</div>
              </div>
            </div>
          </button>

          <a
            href="/scaling"
            className="p-4 border border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <Activity className="h-5 w-5 text-purple-600" />
              <div>
                <div className="font-medium text-gray-900">Activity Overview</div>
                <div className="text-sm text-gray-500">View activity-level scaling targets</div>
              </div>
            </div>
          </a>
        </div>
      </div>

      {/* Add Target Modal */}
      {showAddModal && testClub && (
        <DimensionalTargetModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSave={() => {
            setShowAddModal(false)
            loadData()
            loadSummary()
          }}
          mode="club"
          entityId={testClub.id}
          entityName={testClub.name}
          activityName="Badminton"
        />
      )}
    </div>
  )
}
