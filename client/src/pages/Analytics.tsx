import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  MapPin,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

const PIE_COLORS = ['#4f46e5', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

interface ActivityBreakdown {
  activity: string;
  leads: number;
  percentage: number;
  rank: number;
  demand_tag: 'High' | 'Medium' | 'Low';
  action: string;
  supply_ready: number;
  demand_supply_gap: number;
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
    total_gap: number;
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
        setData(payload.data);
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

  const topActivities = useMemo(
    () => (data?.activity_breakdown || []).slice(0, 8),
    [data]
  );
  const topCities = useMemo(
    () => (data?.city_breakdown || []).slice(0, 6),
    [data]
  );
  const biggestGap = useMemo(
    () => (data?.activity_breakdown || []).slice().sort((a, b) => b.demand_supply_gap - a.demand_supply_gap)[0],
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Start Your Club Analysis</h1>
          <p className="text-sm text-slate-500 mt-1">Auto-generated from live dashboard data (no file upload)</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-60 flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Leads" value={String(data.total_leads)} icon={<Users className="h-4 w-4 text-indigo-500" />} />
        <StatCard
          title="Top Demand Activity"
          value={data.activity_breakdown[0]?.activity || '-'}
          sub={`${data.activity_breakdown[0]?.leads || 0} leads`}
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
        />
        <StatCard
          title="Top City"
          value={data.city_breakdown[0]?.city || '-'}
          sub={`${data.city_breakdown[0]?.leads || 0} leads`}
          icon={<MapPin className="h-4 w-4 text-sky-500" />}
        />
        <StatCard
          title="Biggest Gap"
          value={biggestGap?.activity || '-'}
          sub={biggestGap ? `${biggestGap.demand_supply_gap} pending` : '0 pending'}
          icon={<BarChart3 className="h-4 w-4 text-rose-500" />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Activity Demand Distribution</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topActivities}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="activity" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="leads" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">City Lead Share</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={topCities} dataKey="leads" nameKey="city" cx="50%" cy="50%" outerRadius={100} label>
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

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Demand vs Supply Action Panel</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-4 py-2 text-left text-slate-600">Activity</th>
                <th className="px-4 py-2 text-right text-slate-600">Demand</th>
                <th className="px-4 py-2 text-right text-slate-600">Supply Ready</th>
                <th className="px-4 py-2 text-right text-slate-600">Gap</th>
                <th className="px-4 py-2 text-left text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.activity_breakdown.map((row) => (
                <tr key={row.activity} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{row.activity}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{row.leads}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{row.supply_ready}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{row.demand_supply_gap}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${
                      row.demand_tag === 'High'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : row.demand_tag === 'Medium'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {row.action}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Activity x City Matrix</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-4 py-2 text-left text-slate-600">Activity</th>
                {data.categories.cities.map((city) => (
                  <th key={city} className="px-3 py-2 text-right text-slate-600">{city}</th>
                ))}
                <th className="px-4 py-2 text-right text-slate-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.activity_location_matrix.map((row) => (
                <tr key={row.activity} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{row.activity}</td>
                  {data.categories.cities.map((city) => (
                    <td key={`${row.activity}-${city}`} className="px-3 py-2 text-right text-slate-700">
                      {row.by_city[city] || 0}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold text-slate-800">{row.row_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Applying Rate by City</h2>
          <div className="space-y-3">
            {data.applying_rate_by_city.slice(0, 6).map((cityRow) => (
              <div key={cityRow.city} className="border border-slate-100 rounded-lg p-3">
                <div className="text-sm font-semibold text-slate-800 mb-2">{cityRow.city}</div>
                <div className="space-y-1">
                  {cityRow.rates.filter((r) => r.leads > 0).slice(0, 5).map((rate) => (
                    <div key={`${cityRow.city}-${rate.activity}`} className="flex justify-between text-xs">
                      <span className="text-slate-600">{rate.activity}</span>
                      <span className="font-medium text-slate-700">{rate.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Key Insights</h2>
          <div className="space-y-2 text-sm text-slate-700">
            <p>{data.insights.highest_demand_activity}</p>
            <p>{data.insights.lowest_demand_activity}</p>
            <p>{data.insights.top_city}</p>
            <p>{data.insights.weakest_city}</p>
            <p>{data.insights.best_combo}</p>
            <p>{data.insights.lowest_combo}</p>
            <p>{data.insights.largest_gap}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, sub, icon }: { title: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</span>
        {icon}
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
