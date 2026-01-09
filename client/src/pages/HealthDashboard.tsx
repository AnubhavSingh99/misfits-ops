import React, { useState, useEffect } from 'react';
import {
  Activity,
  Users,
  Calendar,
  DollarSign,
  Star,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Filter,
  Download,
  Eye,
  MapPin,
  BarChart3,
  Info,
  X
} from 'lucide-react';
import ScalingPlanner from '../components/ScalingPlanner';
import { API_URL } from '../config/api';
import { getTeamForClub, TEAMS, TeamKey } from '../../../shared/teamConfig';

interface ClubHealth {
  id: number;
  name: string;
  activity: string;
  city: string;
  area: string;
  club_status: 'ACTIVE' | 'INACTIVE';
  capacity: number;
  capacity_health?: 'Green' | 'Yellow' | 'Red' | 'Gray';
  repeat_rate: number;
  rating: number;
  revenue: number;
  health_status: 'healthy' | 'at_risk' | 'critical' | 'dormant' | 'inactive';
  health_score: number;
  last_event: string;
  total_events: number;
  avg_attendance: number;
  is_new_club?: boolean;
  week_over_week_change: {
    capacity: number;
    repeat: number;
    rating: number;
    revenue: number;
  };
  last_week_metrics?: {
    capacity: number;
    repeat_rate: number;
    rating: number;
  };
  two_weeks_ago_metrics?: {
    capacity: number;
    repeat_rate: number;
    rating: number;
  };
}

interface HealthMetrics {
  total_clubs: number;
  healthy_clubs: number;
  at_risk_clubs: number;
  critical_clubs: number;
  dormant_clubs?: number;
  avg_health_score: number;
  total_revenue: number;
  total_events: number;
  avg_rating: number;

  // Meetup-based metrics
  total_meetups: number;
  active_meetups: number;
  meetup_target: number;
  meetup_achievement_pct: number;

  // Week-over-week data
  total_last_week_events?: number;
  total_two_weeks_ago_events?: number;
  week_over_week_change?: number;
}

// No mock data - using only real database data

export function HealthDashboard() {
  const [clubs, setClubs] = useState<ClubHealth[]>([]);
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedActivity, setSelectedActivity] = useState<string>('all');
  const [selectedHealthStatus, setSelectedHealthStatus] = useState<string>('all');
  const [selectedClubStatus, setSelectedClubStatus] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('health_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showTrends, setShowTrends] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showHealthInfo, setShowHealthInfo] = useState(false);

  useEffect(() => {
    fetchHealthData();

    // Set up auto-refresh every 30 seconds if enabled
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchHealthData();
      }, 30000); // 30 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedClubStatus, autoRefresh]);

  const fetchHealthData = async () => {
    try {
      setLoading(true);

      // Construct URL with club status filter
      const statusParam = selectedClubStatus !== 'all' ? `?status=${selectedClubStatus}` : '?status=all';
      const response = await fetch(`${API_URL}/api/health/clubs${statusParam}`);

      if (response.ok) {
        const data = await response.json();
        console.log('Health data received:', data);
        setClubs(data.clubs || []);
        setMetrics(data.metrics || null);
      } else {
        const errorData = await response.json();
        console.error('Health API error:', errorData);
        throw new Error(errorData.message || 'Failed to fetch health data');
      }
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Health data fetch failed:', error);
      // No fallback - show empty state with error message
      setClubs([]);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-100';
      case 'at_risk':
        return 'text-yellow-600 bg-yellow-100';
      case 'critical':
        return 'text-red-600 bg-red-100';
      case 'dormant':
        return 'text-orange-600 bg-orange-100';
      case 'inactive':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4" />;
      case 'at_risk':
        return <AlertTriangle className="h-4 w-4" />;
      case 'critical':
        return <XCircle className="h-4 w-4" />;
      case 'dormant':
        return <Activity className="h-4 w-4" />;
      case 'inactive':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getTrendIcon = (change: number) => {
    if (change > 0) {
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    } else if (change < 0) {
      return <TrendingDown className="h-4 w-4 text-red-600" />;
    }
    return <BarChart3 className="h-4 w-4 text-gray-600" />;
  };

  const isClubBelowThreshold = (club: ClubHealth) => {
    const capacityBelow = club.capacity < 75;
    const repeatBelow = !club.is_new_club && club.repeat_rate < 65;
    const ratingBelow = club.rating < 4.0;
    return capacityBelow || repeatBelow || ratingBelow;
  };

  const filteredClubs = clubs
    .filter(club => selectedCity === 'all' || club.city === selectedCity)
    .filter(club => selectedActivity === 'all' || club.activity === selectedActivity)
    .filter(club => selectedHealthStatus === 'all' || club.health_status === selectedHealthStatus)
    .filter(club => selectedTeam === 'all' || getTeamForClub(club.activity, club.city) === selectedTeam)
    .sort((a, b) => {
      let aValue = a[sortBy as keyof ClubHealth];
      let bValue = b[sortBy as keyof ClubHealth];

      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

  const uniqueCities = Array.from(new Set(clubs.map(club => club.city)));
  const uniqueActivities = Array.from(new Set(clubs.map(club => club.activity)));

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  // Empty state when no data
  if (!loading && clubs.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Health Dashboard</h1>
            <p className="text-gray-600 mt-1">Monitor club health across 4 key metrics</p>
          </div>
          <button
            onClick={fetchHealthData}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Connection
          </button>
        </div>

        {/* Show filters even when no data */}
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filters:</span>
            </div>

            <select
              value={selectedClubStatus}
              onChange={(e) => setSelectedClubStatus(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="all">All Club Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="text-center py-12">
          <Activity className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No Clubs Found</h3>
          <p className="mt-1 text-sm text-gray-500">
            No clubs match the selected filters. Try changing the club status filter above.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold text-gray-900">Health Dashboard</h1>
            <button
              onClick={() => setShowHealthInfo(true)}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
              title="How is health score calculated?"
            >
              <Info className="h-5 w-5" />
            </button>
          </div>
          <p className="text-gray-600 mt-1">Monitor club health across 4 key metrics</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowTrends(!showTrends)}
            className={`inline-flex items-center px-4 py-2 border rounded-md text-sm font-medium ${showTrends ? 'bg-blue-50 text-blue-700 border-blue-200' : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'}`}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Week-over-Week Trends
          </button>
          <button
            onClick={fetchHealthData}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {/* Auto-refresh toggle */}
          <div className="flex items-center space-x-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Auto-refresh (30s)</span>
            </label>
            {lastUpdated && (
              <span className="text-xs text-gray-500">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
          <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Health Metrics Overview */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Clubs</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.total_clubs}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">Active clubs monitored</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Healthy Clubs</p>
                <p className="text-2xl font-bold text-green-600">{metrics.healthy_clubs}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {Math.round((metrics.healthy_clubs / metrics.total_clubs) * 100)}% of total
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">At Risk</p>
                <p className="text-2xl font-bold text-yellow-600">{metrics.at_risk_clubs}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">Need attention</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Critical</p>
                <p className="text-2xl font-bold text-red-600">{metrics.critical_clubs}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">Immediate action needed</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Dormant</p>
                <p className="text-2xl font-bold text-orange-600">{metrics.dormant_clubs || 0}</p>
              </div>
              <Activity className="h-8 w-8 text-orange-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">No meetup last week</p>
          </div>

          {/* Meetup-based Metrics */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Last Week Events</p>
                <p className="text-2xl font-bold text-blue-600">{metrics.total_last_week_events || 0}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
            <div className="mt-2 flex items-center space-x-2">
              {(metrics.week_over_week_change || 0) >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
              <span className={`text-xs ${(metrics.week_over_week_change || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(metrics.week_over_week_change || 0) > 0 ? '+' : ''}{metrics.week_over_week_change || 0} vs 2 weeks ago ({metrics.total_two_weeks_ago_events || 0})
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Total events (incl. cancelled)</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>

          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="all">All Teams</option>
            <option value="blue">🔵 Blue (Shashwat)</option>
            <option value="yellow">🟡 Yellow (CD)</option>
            <option value="green">🟢 Green (Saurabh)</option>
          </select>

          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="all">All Cities</option>
            {uniqueCities.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>

          <select
            value={selectedActivity}
            onChange={(e) => setSelectedActivity(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="all">All Activities</option>
            {uniqueActivities.map(activity => (
              <option key={activity} value={activity}>{activity}</option>
            ))}
          </select>

          <select
            value={selectedHealthStatus}
            onChange={(e) => setSelectedHealthStatus(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="all">All Health Status</option>
            <option value="healthy">Healthy</option>
            <option value="at_risk">At Risk</option>
            <option value="critical">Critical</option>
            <option value="dormant">Dormant</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            value={selectedClubStatus}
            onChange={(e) => setSelectedClubStatus(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="all">All Club Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="health_score">Health Score</option>
            <option value="name">Club Name</option>
            <option value="capacity">Capacity</option>
            <option value="repeat_rate">Repeat Rate</option>
            <option value="rating">Rating</option>
          </select>

          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-1 border border-gray-300 rounded text-sm bg-gray-50 hover:bg-gray-100"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Club Health Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">
              Club Health Overview ({filteredClubs.length} clubs)
            </h2>
            <div className="text-sm text-gray-500">
              Based on last week data (Mon-Sun) • Revenue not included in health scoring
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Club
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Health Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Capacity % (≥75% Green)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Repeat Rate % (≥65% Green)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rating (≥4.0 Green)
                </th>
                {showTrends && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Week-over-Week Trends
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredClubs.map((club) => (
                <tr key={club.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{club.name}</div>
                      <div className="text-sm text-gray-500 flex items-center">
                        <MapPin className="h-3 w-3 mr-1" />
                        {club.area}, {club.city} • {club.activity}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getHealthStatusColor(club.health_status)}`}>
                      {getHealthIcon(club.health_status)}
                      <span className="ml-1 capitalize">{club.health_status.replace('_', ' ')}</span>
                    </span>
                    <div className="text-xs text-gray-500 mt-1">Score: {club.health_score}</div>
                    {club.two_weeks_ago_metrics && (
                      <div className="text-xs text-gray-400 mt-1">
                        {/* Calculate previous health score using same engine logic */}
                        Previous: {(() => {
                          const hasData = club.two_weeks_ago_metrics.capacity > 0 || club.two_weeks_ago_metrics.repeat_rate > 0 || club.two_weeks_ago_metrics.rating > 0;
                          if (!hasData) return 'N/A';

                          if (club.is_new_club) {
                            return Math.round((club.two_weeks_ago_metrics.capacity / 100) * 60 + (club.two_weeks_ago_metrics.rating / 5) * 40);
                          } else {
                            return Math.round((club.two_weeks_ago_metrics.capacity / 100) * 30 + (club.two_weeks_ago_metrics.repeat_rate / 100) * 40 + (club.two_weeks_ago_metrics.rating / 5) * 30);
                          }
                        })()}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <div className="text-sm font-medium text-gray-900">{club.capacity}%</div>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                        club.capacity_health === 'Green'
                          ? 'bg-green-500 text-white'
                          : club.capacity_health === 'Yellow'
                          ? 'bg-yellow-500 text-white'
                          : 'bg-red-500 text-white'
                      }`}>
                        {club.capacity_health || 'Red'}
                      </span>
                      {club.week_over_week_change && getTrendIcon(club.week_over_week_change.capacity)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Registrations/Slots Opened
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <div className="text-sm font-medium text-gray-900">
                        {club.is_new_club ? 'N/A' : `${club.repeat_rate}%`}
                      </div>
                      {!club.is_new_club && club.week_over_week_change && getTrendIcon(club.week_over_week_change.repeat)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {club.is_new_club ? 'New Club (≤2mo)' : 'Returning Attendees'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <Star className="h-4 w-4 text-yellow-400" />
                      <div className="text-sm font-medium text-gray-900">{club.rating}</div>
                      {club.week_over_week_change && getTrendIcon(club.week_over_week_change.rating)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Avg Last Week Ratings
                    </div>
                  </td>
                  {showTrends && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      {isClubBelowThreshold(club) ? (
                        <div className="space-y-2">
                          {club.capacity < 75 && (
                            <div className="text-xs">
                              <span className="text-gray-500">Capacity:</span>
                              <span className="ml-1 text-red-600">{club.two_weeks_ago_metrics?.capacity || 'N/A'}%</span>
                              <span className="mx-1">→</span>
                              <span className="text-red-600">{club.capacity}%</span>
                              <span className="ml-1 text-xs text-red-500">
                                ({club.week_over_week_change?.capacity > 0 ? '+' : ''}{club.week_over_week_change?.capacity})
                              </span>
                            </div>
                          )}
                          {!club.is_new_club && club.repeat_rate < 65 && (
                            <div className="text-xs">
                              <span className="text-gray-500">Repeat:</span>
                              <span className="ml-1 text-red-600">{club.two_weeks_ago_metrics?.repeat_rate || 'N/A'}%</span>
                              <span className="mx-1">→</span>
                              <span className="text-red-600">{club.repeat_rate}%</span>
                              <span className="ml-1 text-xs text-red-500">
                                ({club.week_over_week_change?.repeat > 0 ? '+' : ''}{club.week_over_week_change?.repeat})
                              </span>
                            </div>
                          )}
                          {club.rating < 4.0 && (
                            <div className="text-xs">
                              <span className="text-gray-500">Rating:</span>
                              <span className="ml-1 text-red-600">{club.two_weeks_ago_metrics?.rating || 'N/A'}</span>
                              <span className="mx-1">→</span>
                              <span className="text-red-600">{club.rating}</span>
                              <span className="ml-1 text-xs text-red-500">
                                ({club.week_over_week_change?.rating > 0 ? '+' : ''}{club.week_over_week_change?.rating?.toFixed(1)})
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-green-600">All metrics above threshold</div>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-blue-600 hover:text-blue-900 mr-3">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button className="text-gray-600 hover:text-gray-900">
                      <BarChart3 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>


      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Interventions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <h4 className="font-medium text-red-900">Critical Clubs ({metrics?.critical_clubs || 0})</h4>
            <p className="text-sm text-red-700 mt-1">Need immediate action</p>
            <button className="mt-2 text-sm text-red-600 font-medium hover:text-red-800">
              View Action Plan →
            </button>
          </div>

          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <h4 className="font-medium text-yellow-900">At-Risk Clubs ({metrics?.at_risk_clubs || 0})</h4>
            <p className="text-sm text-yellow-700 mt-1">Proactive support needed</p>
            <button className="mt-2 text-sm text-yellow-600 font-medium hover:text-yellow-800">
              Schedule Check-in →
            </button>
          </div>

          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <h4 className="font-medium text-green-900">Healthy Clubs ({metrics?.healthy_clubs || 0})</h4>
            <p className="text-sm text-green-700 mt-1">Growth opportunities</p>
            <button className="mt-2 text-sm text-green-600 font-medium hover:text-green-800">
              Explore Scaling →
            </button>
          </div>
        </div>
      </div>

      {/* Health Score Info Modal */}
      {showHealthInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Health Score Calculation</h2>
              <button
                onClick={() => setShowHealthInfo(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">How Health Score is Calculated</h3>
                <p className="text-gray-600 mb-4">
                  Health scores are calculated differently for new clubs (≤2 months) and established clubs:
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-3">New Clubs (≤2 months)</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Capacity Utilization:</span>
                      <span className="font-medium">60%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Rating:</span>
                      <span className="font-medium">40%</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Repeat Rate:</span>
                      <span>0% (excluded)</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Revenue:</span>
                      <span>0% (excluded)</span>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-3">Established Clubs ({'>'}2 months)</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Capacity Utilization:</span>
                      <span className="font-medium">30%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Repeat Rate:</span>
                      <span className="font-medium">40%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Rating:</span>
                      <span className="font-medium">30%</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Revenue:</span>
                      <span>0% (excluded)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Health Status Thresholds</h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 bg-green-500 rounded"></div>
                    <span className="font-medium text-green-700">Healthy:</span>
                    <span className="text-gray-600">Score 115+ with no critical issues</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                    <span className="font-medium text-yellow-700">At Risk:</span>
                    <span className="text-gray-600">Score 100-114 or one metric below threshold</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 bg-red-500 rounded"></div>
                    <span className="font-medium text-red-700">Critical:</span>
                    <span className="text-gray-600">Score below 100 or multiple critical issues</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Metric Definitions</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium">Capacity Utilization:</span>
                    <span className="text-gray-600 ml-2">Percentage of event slots filled by registered attendees</span>
                  </div>
                  <div>
                    <span className="font-medium">Repeat Rate:</span>
                    <span className="text-gray-600 ml-2">Percentage of last week's attendees who had previously attended the club's events before</span>
                  </div>
                  <div>
                    <span className="font-medium">Average Rating:</span>
                    <span className="text-gray-600 ml-2">Member satisfaction rating from event feedback (1-5 scale)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}