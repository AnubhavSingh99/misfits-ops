import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/start-club`
  : '/api/start-club';

const PIE_COLORS = ['#2563eb', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAnalysisData(rawData: AnalysisData): AnalysisData {
  const activityBreakdown = (rawData.activity_breakdown || []).map((row) => {
    const leads = toNumber(row.leads);
    const supplyReady = toNumber(row.supply_ready);
    const supplyInProgress = toNumber(row.supply_in_progress);
    const supplyEffective = toNumber(row.supply_effective, supplyReady + supplyInProgress);
    const requiredCount = toNumber(row.required_count, supplyEffective);
    const completedCount = toNumber(row.completed_count, supplyReady);
    const potentialLeads = toNumber(row.potential_leads);
    const completionPercentage = toNumber(
      row.completion_percentage,
      requiredCount > 0 ? Math.round((completedCount / requiredCount) * 100) : 0
    );
    const priorityTag = row.priority_tag || row.demand_tag || 'Low';

    return {
      ...row,
      leads,
      supply_ready: supplyReady,
      supply_in_progress: supplyInProgress,
      supply_effective: supplyEffective,
      backlog_count: toNumber(row.backlog_count),
      coverage_percentage: toNumber(row.coverage_percentage),
      demand_supply_gap: toNumber(row.demand_supply_gap, Math.max(leads - supplyEffective, 0)),
      required_count: requiredCount,
      completed_count: completedCount,
      completion_percentage: completionPercentage,
      priority_tag: priorityTag,
      potential_leads: potentialLeads,
    };
  });

  const cityBreakdown = (rawData.city_breakdown || []).map((row) => ({
    ...row,
    leads: toNumber(row.leads),
    percentage: toNumber(row.percentage),
    sub_area_breakdown: Array.isArray(row.sub_area_breakdown) ? row.sub_area_breakdown : [],
  }));

  const totalDemand = toNumber(rawData.demand_supply_summary?.total_demand, toNumber(rawData.total_leads));
  const totalSupplyReady = toNumber(rawData.demand_supply_summary?.total_supply_ready);
  const totalSupplyInProgress = toNumber(rawData.demand_supply_summary?.total_supply_in_progress);
  const totalSupplyEffective = toNumber(
    rawData.demand_supply_summary?.total_supply_effective,
    totalSupplyReady + totalSupplyInProgress
  );

  return {
    ...rawData,
    activity_breakdown: activityBreakdown,
    city_breakdown: cityBreakdown,
    demand_supply_summary: {
      ...rawData.demand_supply_summary,
      total_demand: totalDemand,
      total_supply_ready: totalSupplyReady,
      total_supply_in_progress: totalSupplyInProgress,
      total_supply_effective: totalSupplyEffective,
      total_supply_backlog: toNumber(rawData.demand_supply_summary?.total_supply_backlog),
      total_potential_leads: toNumber(rawData.demand_supply_summary?.total_potential_leads),
      total_gap: toNumber(rawData.demand_supply_summary?.total_gap, Math.max(totalDemand - totalSupplyEffective, 0)),
      ready_only_gap: toNumber(rawData.demand_supply_summary?.ready_only_gap, Math.max(totalDemand - totalSupplyReady, 0)),
      overall_coverage: toNumber(rawData.demand_supply_summary?.overall_coverage),
    },
  };
}

interface ActivityBreakdown {
  activity: string;
  leads: number;
  percentage: number;
  rank: number;
  demand_tag: 'High' | 'Medium' | 'Low';
  action: string;
  supply_ready: number;
  supply_in_progress: number;
  supply_effective: number;
  backlog_count: number;
  coverage_percentage: number;
  demand_supply_gap: number;
  required_count: number;
  completed_count: number;
  completion_percentage: number;
  priority_tag: 'High' | 'Medium' | 'Low';
  potential_leads: number;
}

interface CityBreakdown {
  city: string;
  leads: number;
  percentage: number;
  most_popular_activity: string;
  sub_area_breakdown: Array<{
    sub_area: string;
    leads: number;
    percentage: number;
  }>;
}

interface AnalysisData {
  total_leads: number;
  categories: {
    activities: string[];
    cities: string[];
  };
  demand_supply_summary: {
    total_demand: number;
    total_supply_ready: number;
    total_supply_in_progress: number;
    total_supply_effective: number;
    total_supply_backlog: number;
    total_potential_leads: number;
    total_gap: number;
    ready_only_gap: number;
    overall_coverage: number;
  };
  activity_breakdown: ActivityBreakdown[];
  city_breakdown: CityBreakdown[];
  activity_location_matrix: Array<{
    activity: string;
    by_city: Record<string, number>;
    row_total: number;
    row_percentage: number;
  }>;
  applying_rate_by_city: Array<{
    city: string;
    total_city_leads: number;
    rates: Array<{
      activity: string;
      leads: number;
      percentage: number;
    }>;
  }>;
  insights: {
    highest_demand_activity: string;
    lowest_demand_activity: string;
    top_city: string;
    weakest_city: string;
    best_combo: string;
    lowest_combo: string;
    largest_gap: string;
  };
}

export function Analytics() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError('');

      const res = await fetch(`${API_BASE}/admin/analysis-dashboard`);
      const payload = await res.json();
      if (payload.success) {
        setData(normalizeAnalysisData(payload.data));
      } else {
        setError(payload.error || 'Failed to load analysis data');
      }
    } catch {
      setError('Failed to load analysis data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const topCities = useMemo(
    () => (data?.city_breakdown || []).slice(0, 6),
    [data]
  );
  const priorityQueue = useMemo(
    () => (data?.activity_breakdown || [])
      .slice()
      .sort((a, b) => {
        const aRemaining = Math.max((a.required_count ?? a.supply_effective) - (a.completed_count ?? a.supply_ready), 0);
        const bRemaining = Math.max((b.required_count ?? b.supply_effective) - (b.completed_count ?? b.supply_ready), 0);
        return bRemaining - aRemaining || b.potential_leads - a.potential_leads;
      })
      .slice(0, 8),
    [data]
  );
  const topPriorityActivities = useMemo(
    () => priorityQueue.slice(0, 6),
    [priorityQueue]
  );
  const potentialLeadRows = useMemo(
    () => (data?.activity_breakdown || [])
      .filter((row) => row.potential_leads > 0)
      .slice()
      .sort((a, b) => b.potential_leads - a.potential_leads)
      .slice(0, 5),
    [data]
  );
  const othersDemand = useMemo(
    () => (data?.activity_breakdown || []).find((row) => row.activity.toLowerCase() === 'others'),
    [data]
  );
  const riskActivities = useMemo(
    () => (data?.activity_breakdown || [])
      .slice()
      .sort((a, b) => {
        const aGap = Math.max((a.required_count ?? a.supply_effective) - (a.completed_count ?? a.supply_ready), 0);
        const bGap = Math.max((b.required_count ?? b.supply_effective) - (b.completed_count ?? b.supply_ready), 0);
        return bGap - aGap || b.potential_leads - a.potential_leads;
      })
      .slice(0, 5),
    [data]
  );

  if (loading && !data) {
    return (
      <div className="p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
          Loading analysis dashboard...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error || 'Analysis data unavailable'}
        </div>
      </div>
    );
  }

  const totalDemand = data.demand_supply_summary.total_demand;
  const totalRequired = data.demand_supply_summary.total_supply_effective;
  const totalCompleted = data.demand_supply_summary.total_supply_ready;
  const totalPotential = data.demand_supply_summary.total_potential_leads || 0;
  const openGap = Math.max(totalRequired - totalCompleted, 0);
  const completionPct = totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;

  return (
    <div className="p-6 space-y-5">
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-sky-50 to-emerald-50 p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Start Your Club Analysis</h1>
            <p className="text-sm text-slate-600 mt-1">
              Simple view of what matters now, where risk is building, and what to act on.
            </p>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="self-start px-3 py-2 text-sm font-medium text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-60 flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Step 1: What Is Happening Now</div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <StatCard title="Applicants" value={String(totalDemand)} icon={<Users className="h-4 w-4 text-blue-600" />} />
          <StatCard title="Required" value={String(totalRequired)} icon={<Target className="h-4 w-4 text-indigo-600" />} />
          <StatCard title="Completed" value={String(totalCompleted)} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
          <StatCard title="Open Gap" value={String(openGap)} icon={<BarChart3 className="h-4 w-4 text-red-600" />} />
          <StatCard title="Potential Leads" value={String(totalPotential)} icon={<Clock3 className="h-4 w-4 text-amber-600" />} />
        </div>
        <div className="mt-3 text-xs text-slate-600">
          Completion is <span className="font-semibold text-slate-800">{completionPct}%</span>. Coverage is{' '}
          <span className="font-semibold text-slate-800">{data.demand_supply_summary.overall_coverage}%</span>.
          {othersDemand ? (
            <>
              {' '}`Others` has <span className="font-semibold text-slate-800">{othersDemand.leads}</span> applicants.
            </>
          ) : null}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Step 2: Where Risk Is Building</div>
          <h2 className="text-sm font-semibold text-slate-800">Top 5 activities with the largest requirement gap</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-4 py-2 text-left text-slate-600">Activity</th>
                <th className="px-3 py-2 text-right text-slate-600">Applicants</th>
                <th className="px-3 py-2 text-right text-slate-600">Required</th>
                <th className="px-3 py-2 text-right text-slate-600">Completed</th>
                <th className="px-3 py-2 text-right text-slate-600">Gap</th>
                <th className="px-4 py-2 text-left text-slate-600">Priority</th>
              </tr>
            </thead>
            <tbody>
              {riskActivities.map((row) => {
                const required = row.required_count ?? row.supply_effective;
                const completed = row.completed_count ?? row.supply_ready;
                const gap = Math.max(required - completed, 0);
                const priority = row.priority_tag || row.demand_tag;
                return (
                  <tr key={`risk-${row.activity}`} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{row.activity}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.leads}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{required}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{completed}</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-700">{gap}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${
                        priority === 'High'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : priority === 'Medium'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}>
                        {priority}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Step 3: What To Do Next</div>
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Action Queue</h2>
          <div className="space-y-2">
            {priorityQueue.slice(0, 5).map((row, idx) => {
              const required = row.required_count ?? row.supply_effective;
              const completed = row.completed_count ?? row.supply_ready;
              const remaining = Math.max(required - completed, 0);
              return (
                <div key={`action-${row.activity}`} className="border border-slate-100 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">#{idx + 1} priority</div>
                  <div className="text-sm font-semibold text-slate-800">{row.activity}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    Close <span className="font-semibold text-slate-800">{remaining}</span> remaining requirement{remaining === 1 ? '' : 's'}.
                    {row.potential_leads > 0 ? ` Potential leads available: ${row.potential_leads}.` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Potential Leads To Revisit</h2>
          <div className="space-y-2">
            {potentialLeadRows.length === 0 ? (
              <p className="text-xs text-slate-500">No on-hold potential leads right now.</p>
            ) : potentialLeadRows.map((row) => (
              <div key={`potential-${row.activity}`} className="border border-emerald-100 bg-emerald-50/40 rounded-lg p-2.5">
                <div className="text-sm font-semibold text-slate-800">{row.activity}</div>
                <div className="text-xs text-slate-600 mt-1">
                  Potential leads: {row.potential_leads} · Required: {row.required_count ?? row.supply_effective} · Completed: {row.completed_count ?? row.supply_ready}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <details className="bg-white border border-slate-200 rounded-xl p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Deep Dive (charts & full details)</summary>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Applicants vs Required (Top Priorities)</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topPriorityActivities}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="activity" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="leads" fill="#4f46e5" name="Applicants" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="required_count" fill="#0ea5e9" name="Required" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">City Lead Share</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={topCities} dataKey="leads" nameKey="city" cx="50%" cy="50%" outerRadius={108} label>
                      {topCities.map((entry, index) => (
                        <Cell key={entry.city} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Key Insights</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-700">
              <p>{data.insights.highest_demand_activity}</p>
              <p>{data.insights.top_city}</p>
              <p>{data.insights.largest_gap}</p>
              <p>{data.insights.best_combo}</p>
              <p>{data.insights.lowest_demand_activity}</p>
              <p>{data.insights.weakest_city}</p>
            </div>
          </div>
        </div>
      </details>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
        Priority is based on completion (`Completed / Required`). Potential leads are applications currently on hold.
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{title}</span>
        {icon}
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
