// Main Dashboard - Real-time Revenue Pipeline & System State
// Built according to PRD v8.1 Section 3.1

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Target,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  Building2,
  Zap,
  ArrowUp,
  ArrowDown,
  Minus,
  Calendar
} from 'lucide-react';
import { SystemState, TeamPerformance, FilterOptions } from '../types/core';
import { api } from '../services/api';
import { healthEngine } from '../services/healthEngine';
import RealDataService from '../services/realDataService';
import { LineChart } from '../components/LineChart';

interface DashboardProps {}

export function Dashboard({}: DashboardProps) {
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [teamPerformance, setTeamPerformance] = useState<TeamPerformance[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isLive, setIsLive] = useState(false);

  // Trend graphs state
  const [trendData, setTrendData] = useState({
    revenue: [],
    meetups: [],
    attendance: []
  });
  const [trendFilters, setTrendFilters] = useState({
    period: 'wow', // wow, mom, yearly
    startDate: '',
    endDate: ''
  });

  // Fetch system state on mount
  useEffect(() => {
    loadDashboardData();

    // Set up real-time updates (WebSocket simulation)
    const interval = setInterval(() => {
      refreshSystemState();
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [filters]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load system state using real data service
      const state = await RealDataService.getSystemState();
      setSystemState(state);

      // Load team performance (try API, fallback to mock)
      try {
        const teams = await api.teams.getLeaderboard();
        setTeamPerformance(teams);
      } catch (error) {
        console.warn('Team leaderboard API failed, using mock data:', error);
        setTeamPerformance([]); // Will be handled by mock data in components
      }

      setLastUpdated(new Date().toISOString());
      setIsLive(true);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  };

  const refreshSystemState = async () => {
    try {
      // Use real data service for refresh
      const state = await RealDataService.getSystemState();
      setSystemState(state);
      setLastUpdated(new Date().toISOString());
      setIsLive(true);
    } catch (error) {
      console.error('Failed to refresh state:', error);
      setIsLive(false);
    }
  };

  const loadTrendData = async () => {
    try {
      const API_URL = process.env.NODE_ENV === 'production'
        ? 'https://misfits-backend-production.up.railway.app'
        : 'http://localhost:5001';

      const params = new URLSearchParams({
        period: trendFilters.period,
        ...(trendFilters.startDate && { startDate: trendFilters.startDate }),
        ...(trendFilters.endDate && { endDate: trendFilters.endDate })
      });

      console.log('Loading trend data from:', API_URL, 'with params:', params.toString());

      const [revenueRes, meetupsRes, attendanceRes] = await Promise.all([
        fetch(`${API_URL}/api/trends/revenue?${params}`),
        fetch(`${API_URL}/api/trends/meetups?${params}`),
        fetch(`${API_URL}/api/trends/attendance?${params}`)
      ]);

      // Handle each response individually
      let revenueData = { data: [] };
      let meetupsData = { data: [] };
      let attendanceData = { data: [] };

      try {
        revenueData = revenueRes.ok ? await revenueRes.json() : { data: [] };
      } catch (e) {
        console.error('Failed to parse revenue data:', e);
      }

      try {
        meetupsData = meetupsRes.ok ? await meetupsRes.json() : { data: [] };
      } catch (e) {
        console.error('Failed to parse meetups data:', e);
      }

      try {
        attendanceData = attendanceRes.ok ? await attendanceRes.json() : { data: [] };
      } catch (e) {
        console.error('Failed to parse attendance data:', e);
      }

      console.log('Loaded trend data:', {
        revenue: revenueData.data?.length || 0,
        meetups: meetupsData.data?.length || 0,
        attendance: attendanceData.data?.length || 0
      });

      setTrendData({
        revenue: revenueData.data || [],
        meetups: meetupsData.data || [],
        attendance: attendanceData.data || []
      });

    } catch (error) {
      console.error('Failed to load trend data:', error);
      // Don't clear existing data on error, just log it
    }
  };

  // Load trend data when filters change
  useEffect(() => {
    if (trendFilters.period) {
      loadTrendData();
    }
  }, [trendFilters]);

  const formatRevenue = (amount: number): string => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    return `₹${(amount / 1000).toFixed(0)}K`;
  };

  const getHealthColor = (health: 'green' | 'yellow' | 'red') => {
    switch (health) {
      case 'green': return 'text-green-600 bg-green-100';
      case 'yellow': return 'text-yellow-600 bg-yellow-100';
      case 'red': return 'text-red-600 bg-red-100';
    }
  };

  const getAlertSeverityColor = (severity: 'high' | 'medium' | 'low') => {
    switch (severity) {
      case 'high': return 'border-red-500 bg-red-50';
      case 'medium': return 'border-yellow-500 bg-yellow-50';
      case 'low': return 'border-blue-500 bg-blue-50';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-600 text-lg font-medium">Loading Misfits Operations...</div>
        </div>
      </div>
    );
  }

  if (!systemState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <div className="text-gray-800 text-xl font-bold mb-2">System Unavailable</div>
          <div className="text-gray-600 mb-4">Unable to connect to operations data</div>
          <button
            onClick={loadDashboardData}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30">
      <div className="max-w-7xl mx-auto p-6 space-y-8">

        {/* Header with Live Status */}
        <div className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-700 rounded-2xl p-8 text-white shadow-2xl overflow-hidden">
          {/* Background decorations */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-20 translate-x-20"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-16 -translate-x-16"></div>

          <div className="relative z-10">
            {/* Live Status */}
            <div className="absolute top-0 right-0 flex items-center gap-2 px-4 py-2 bg-white/20 rounded-full backdrop-blur-sm">
              <div className={`w-3 h-3 rounded-full ${isLive ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
              <span className="text-sm font-semibold">{isLive ? 'LIVE' : 'OFFLINE'}</span>
              {isLive && <Zap className="h-4 w-4 text-green-400" />}
            </div>

            {/* Main Header */}
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <TrendingUp className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-4xl font-black mb-2">Misfits Operations</h1>
                <p className="text-blue-100 text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Real-time Revenue & Health Monitoring • Last updated: {new Date(lastUpdated).toLocaleTimeString()}
                </p>
              </div>
            </div>

            {/* Revenue Pipeline - PRD Section 3.1 */}
            <div className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/20">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Target className="h-6 w-6" />
                  <h2 className="text-2xl font-bold">Revenue Pipeline</h2>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black">
                    {formatRevenue(systemState.current_revenue)} / {formatRevenue(systemState.target_revenue)}
                  </div>
                  <div className="text-blue-200 text-lg">
                    {systemState.progress_percentage.toFixed(1)}% achieved
                  </div>
                </div>
              </div>

              <div className="relative mb-4">
                <div className="w-full bg-white/20 rounded-full h-6 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-green-400 to-emerald-400 h-6 rounded-full transition-all duration-1000 ease-out shadow-lg relative"
                    style={{ width: `${Math.min(systemState.progress_percentage, 100)}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="text-sm text-blue-200">
                  Gap: {formatRevenue(systemState.target_revenue - systemState.current_revenue)} to target
                </div>
                <div className={`px-4 py-2 rounded-full text-sm font-bold ${
                  systemState.progress_percentage >= 80
                    ? 'bg-green-500/20 text-green-100 border border-green-400/30'
                    : systemState.progress_percentage >= 60
                      ? 'bg-yellow-500/20 text-yellow-100 border border-yellow-400/30'
                      : 'bg-red-500/20 text-red-100 border border-red-400/30'
                }`}>
                  {systemState.progress_percentage >= 80 ? '🎯 On Track' :
                   systemState.progress_percentage >= 60 ? '⚡ Push Needed' : '🚨 Critical Gap'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Key Metrics - PRD Based */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* Active Clubs */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Building2 className="h-8 w-8 text-blue-600" />
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-blue-900">{systemState.health_distribution.total}</div>
                <div className="text-sm font-semibold text-blue-600">Active Clubs</div>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">From production DB</span>
              <span className="text-blue-700 font-medium">
                0.0%
              </span>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-2 mt-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `0%` }}
              ></div>
            </div>
          </div>

          {/* Health Distribution */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-100 rounded-xl">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-green-900">{systemState.health_distribution.green}</div>
                <div className="text-sm font-semibold text-green-600">Healthy</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-green-700">🟢 {systemState.health_distribution.green}</span>
                <span className="text-yellow-600">🟡 {systemState.health_distribution.yellow}</span>
                <span className="text-red-600">🔴 {systemState.health_distribution.red}</span>
              </div>
              <div className="text-xs text-gray-600 mb-1">
                {((systemState.health_distribution.green / systemState.health_distribution.total) * 100).toFixed(1)}% of total active clubs
              </div>
              <div className="flex w-full h-2 rounded-full overflow-hidden">
                <div
                  className="bg-green-500"
                  style={{ width: `${(systemState.health_distribution.green / systemState.health_distribution.total) * 100}%` }}
                ></div>
                <div
                  className="bg-yellow-500"
                  style={{ width: `${(systemState.health_distribution.yellow / systemState.health_distribution.total) * 100}%` }}
                ></div>
                <div
                  className="bg-red-500"
                  style={{ width: `${(systemState.health_distribution.red / systemState.health_distribution.total) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Critical Alerts */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-red-100 rounded-xl">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-red-900">{systemState.health_distribution.red}</div>
                <div className="text-sm font-semibold text-red-600">Critical Alerts</div>
              </div>
            </div>
            <div className="text-xs text-gray-600">
              {((systemState.health_distribution.red / systemState.health_distribution.total) * 100).toFixed(1)}% of active clubs • Requires immediate attention
            </div>
          </div>

        </div>

        {/* Critical Alerts Section */}
        {systemState.critical_alerts.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-red-200">
            <div className="flex items-center gap-3 mb-6">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <h2 className="text-2xl font-bold text-gray-900">Critical Alerts</h2>
              <span className="bg-red-100 text-red-800 text-sm px-3 py-1 rounded-full font-semibold">
                {systemState.critical_alerts.length} active
              </span>
            </div>

            <div className="space-y-4">
              {systemState.critical_alerts.slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border-l-4 ${getAlertSeverityColor(alert.severity)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-800 uppercase">
                          {alert.type}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          alert.severity === 'high' ? 'bg-red-100 text-red-700' :
                          alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {alert.severity}
                        </span>
                      </div>
                      <p className="text-gray-700 font-medium">{alert.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors ml-4">
                      Investigate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team Performance Leaderboard */}
        {teamPerformance.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <Users className="h-6 w-6 text-blue-600" />
              <h2 className="text-2xl font-bold text-gray-900">Team Performance</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {teamPerformance.map((team, index) => (
                <div key={team.team} className="relative group">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 group-hover:shadow-lg transition-all duration-300">
                    {/* Rank Badge */}
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {team.rank}
                    </div>

                    <div className="mb-4">
                      <h3 className="text-lg font-bold text-gray-900 capitalize mb-1">
                        Team {team.team}
                      </h3>
                      <p className="text-sm text-gray-600">{team.leader_name}</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Clubs</span>
                        <span className="font-semibold">{team.total_clubs}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Revenue</span>
                        <span className="font-semibold">{formatRevenue(team.total_revenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Points</span>
                        <span className="font-semibold text-blue-600">{team.points.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Achievement</span>
                        <span className={`font-semibold ${
                          team.achievement_percent >= 80 ? 'text-green-600' :
                          team.achievement_percent >= 60 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {team.achievement_percent.toFixed(1)}%
                        </span>
                      </div>

                      {/* Health Distribution */}
                      <div className="pt-2 border-t border-gray-200">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-green-600">🟢 {team.green_clubs}</span>
                          <span className="text-yellow-600">🟡 {team.yellow_clubs}</span>
                          <span className="text-red-600">🔴 {team.red_clubs}</span>
                        </div>
                        <div className="flex w-full h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-green-500"
                            style={{ width: `${(team.green_clubs / team.total_clubs) * 100}%` }}
                          ></div>
                          <div
                            className="bg-yellow-500"
                            style={{ width: `${(team.yellow_clubs / team.total_clubs) * 100}%` }}
                          ></div>
                          <div
                            className="bg-red-500"
                            style={{ width: `${(team.red_clubs / team.total_clubs) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* System Health Summary */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-6 border border-green-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <h2 className="text-xl font-bold text-gray-900">System Health</h2>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Last health check</div>
              <div className="font-semibold text-gray-900">
                {new Date(systemState.last_updated).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{systemState.health_distribution.green}</div>
              <div className="text-sm text-gray-600">Healthy Meetups</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{systemState.health_distribution.yellow}</div>
              <div className="text-sm text-gray-600">Need Attention</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{systemState.health_distribution.red}</div>
              <div className="text-sm text-gray-600">Critical Issues</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{systemState.updates_count_today}</div>
              <div className="text-sm text-gray-600">Today's Updates</div>
            </div>
          </div>
        </div>

        {/* Trend Analysis Section */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Trend Analysis</h2>
            <div className="flex items-center gap-4">
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={trendFilters.period}
                onChange={(e) => setTrendFilters({...trendFilters, period: e.target.value})}
              >
                <option value="wow">Week over Week</option>
                <option value="mom">Month over Month</option>
                <option value="yearly">Yearly</option>
              </select>
              <input
                type="date"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Start Date"
                value={trendFilters.startDate}
                onChange={(e) => setTrendFilters({...trendFilters, startDate: e.target.value})}
              />
              <input
                type="date"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="End Date"
                value={trendFilters.endDate}
                onChange={(e) => setTrendFilters({...trendFilters, endDate: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue Trend */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
              <h3 className="text-lg font-semibold text-green-800 mb-4">Revenue Trend</h3>
              <div className="h-48 bg-white rounded-lg p-4 border border-green-200">
                {trendData.revenue.length > 0 ? (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm font-medium text-gray-600">Total Revenue</span>
                      <span className="text-lg font-bold text-green-600">
                        {formatRevenue(trendData.revenue.reduce((sum: number, item: any) => sum + (item.revenue_rupees || 0), 0))}
                      </span>
                    </div>
                    <LineChart
                      data={trendData.revenue.map((item: any) => ({
                        period: item.period,
                        value: item.revenue_rupees || 0
                      }))}
                      color="#16a34a"
                      label=""
                      formatter={formatRevenue}
                    />
                  </div>
                ) : (
                  <div className="text-center text-gray-500 mt-16">
                    <TrendingUp className="h-8 w-8 mx-auto mb-2" />
                    <p>Loading revenue data...</p>
                  </div>
                )}
              </div>
            </div>

            {/* Meetup Trend */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
              <h3 className="text-lg font-semibold text-blue-800 mb-4">Meetup Trend</h3>
              <div className="h-48 bg-white rounded-lg p-4 border border-blue-200">
                {trendData.meetups.length > 0 ? (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm font-medium text-gray-600">Total Meetups</span>
                      <span className="text-lg font-bold text-blue-600">
                        {trendData.meetups.reduce((sum: number, item: any) => sum + (item.meetup_count || 0), 0)}
                      </span>
                    </div>
                    <LineChart
                      data={trendData.meetups.map((item: any) => ({
                        period: item.period,
                        value: item.meetup_count || 0
                      }))}
                      color="#2563eb"
                      label=""
                      formatter={(v) => `${v} meetups`}
                    />
                  </div>
                ) : (
                  <div className="text-center text-gray-500 mt-16">
                    <Calendar className="h-8 w-8 mx-auto mb-2" />
                    <p>Loading meetup data...</p>
                  </div>
                )}
              </div>
            </div>

            {/* Attendance Trend */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
              <h3 className="text-lg font-semibold text-purple-800 mb-4">Attendance Trend</h3>
              <div className="h-48 bg-white rounded-lg p-4 border border-purple-200">
                {trendData.attendance.length > 0 ? (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm font-medium text-gray-600">Total Attendees</span>
                      <span className="text-lg font-bold text-purple-600">
                        {trendData.attendance.reduce((sum: number, item: any) => sum + (item.total_attendees || 0), 0)}
                      </span>
                    </div>
                    <LineChart
                      data={trendData.attendance.map((item: any) => ({
                        period: item.period,
                        value: item.total_attendees || 0
                      }))}
                      color="#7c3aed"
                      label=""
                      formatter={(v) => `${v} people`}
                    />
                  </div>
                ) : (
                  <div className="text-center text-gray-500 mt-16">
                    <Users className="h-8 w-8 mx-auto mb-2" />
                    <p>Loading attendance data...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}