import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Headphones,
  Plus,
  Search,
  Clock,
  CheckCircle,
  AlertTriangle,
  MessageSquare,
  Phone,
  RefreshCw,
  X,
  ChevronDown,
  ChevronRight,
  FileText,
  Play,
  Timer,
  Users,
  Building2,
  Smartphone,
  User as UserIcon,
  FolderOpen,
  Inbox,
  Archive,
  Settings,
  TrendingUp,
  MoreVertical,
  Send,
  PhoneOff,
  Pencil,
  Save,
  Trash2,
  Link,
  Loader2
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// Types
interface QueryType {
  id: number;
  stakeholder_type: string;
  name: string;
  parent_id: number | null;
  default_sla_hours: number;
}

interface CSQuery {
  id: number;
  ticket_number: string;
  stakeholder_type: string;
  query_type_id: number;
  query_subtype_id: number | null;
  source: string;
  user_id: number;
  user_name: string;
  user_contact: string;
  user_email: string | null;
  subject: string;
  description: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  sla_hours: number;
  attachments: any[];
  comments: any[];
  resolution_notes: string | null;
  created_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  query_type_name: string;
  query_subtype_name: string | null;
  slack_channel: string | null;
  slack_channel_name: string | null;
  slack_sent_at: string | null;
  has_contact_info: boolean;
}

interface SlackChannel {
  value: string;
  label: string;
  channel: string;
}

interface Stats {
  total: number;
  open: number;
  in_progress: number;
  pending: number;
  resolved: number;
  closed: number;
  no_contact: number;
  by_stakeholder: Record<string, number>;
  by_priority: Record<string, number>;
}

interface PollingStatus {
  active: boolean;
  lastProcessedDate: string | null;
  intervalMs: number;
}

interface Club {
  id: number;
  uuid: string;
  name: string;
  activity: string;
}

interface Host {
  id: number;
  uuid: string;
  name: string;
  phone: string;
  email: string;
  type: string;
}

// Helper functions
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function calculateTAT(created: string, resolved: string | null): string {
  const endDate = resolved ? new Date(resolved) : new Date();
  const createdDate = new Date(created);
  const diffHours = Math.floor((endDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60));
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d ${diffHours % 24}h`;
}

function calculateTATHours(created: string, resolved: string | null): number {
  const endDate = resolved ? new Date(resolved) : new Date();
  const createdDate = new Date(created);
  return (endDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
}

function getSLAStatus(created: string, slaHours: number, status: string): 'ok' | 'warning' | 'breach' {
  // If resolved or closed, SLA doesn't apply
  if (status === 'resolved' || status === 'resolution_communicated') return 'ok';
  const now = new Date();
  const createdDate = new Date(created);
  const elapsed = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
  if (elapsed > slaHours) return 'breach';
  if (elapsed > slaHours * 0.75) return 'warning';
  return 'ok';
}

function formatTATDisplay(hours: number): string {
  if (hours < 1) return '< 1h';
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return `${days}d ${remainingHours}h`;
}

const statusColors: Record<string, string> = {
  created: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  ticket_communicated: 'bg-orange-100 text-orange-700 border-orange-200',
  resolved: 'bg-green-100 text-green-700 border-green-200',
  resolution_communicated: 'bg-gray-100 text-gray-600 border-gray-200'
};

const sourceIcons: Record<string, React.ReactNode> = {
  app: <Smartphone className="h-4 w-4" />,
  website: <Building2 className="h-4 w-4" />,
  whatsapp: <MessageSquare className="h-4 w-4" />,
  playstore: <Smartphone className="h-4 w-4" />,
  appstore: <Smartphone className="h-4 w-4" />
};

const stakeholderConfig: Record<string, { icon: React.ReactNode; color: string; bgColor: string; borderColor: string; label: string }> = {
  user: {
    icon: <UserIcon className="h-5 w-5" />,
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    label: 'Users'
  },
  leader: {
    icon: <Users className="h-5 w-5" />,
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    label: 'Leaders'
  },
  venue: {
    icon: <Building2 className="h-5 w-5" />,
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    label: 'Venues'
  }
};

// Status options for dropdown - workflow: created → in_progress → ticket_communicated → resolved → resolution_communicated
const statusOptions = [
  { value: 'created', label: 'Created', color: 'text-blue-600' },
  { value: 'in_progress', label: 'In Progress', color: 'text-yellow-600' },
  { value: 'ticket_communicated', label: 'Ticket Communicated', color: 'text-orange-600' },
  { value: 'resolved', label: 'Resolved', color: 'text-green-600' },
  { value: 'resolution_communicated', label: 'Resolution Communicated', color: 'text-gray-600' }
];

// Slack channel options
const slackChannelOptions: SlackChannel[] = [
  { value: 'bugs', label: 'Tech/Bugs', channel: '#bugs' },
  { value: 'marketing', label: 'Marketing', channel: '#marketing' },
  { value: 'finance', label: 'Finance', channel: '#finance' },
  { value: 'ops', label: 'Ops', channel: '#quality-ops-external' },
  { value: 'safety', label: 'Safety', channel: '#safety-concerns' },
  { value: 'random', label: 'General', channel: '#customer-support' }
];

// Ticket Row Component
function TicketRow({
  query,
  onSelect,
  onStatusUpdate,
  onSendToSlack
}: {
  query: CSQuery;
  onSelect: () => void;
  onStatusUpdate: (id: number, status: string) => void;
  onSendToSlack: (id: number, channelType: string) => void;
}) {
  const slaStatus = getSLAStatus(query.created_at, query.sla_hours, query.status);
  const [sendingToSlack, setSendingToSlack] = useState(false);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const newStatus = e.target.value;
    if (newStatus && newStatus !== query.status) {
      onStatusUpdate(query.id, newStatus);
    }
  };

  const handleSlackSend = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const channelType = e.target.value;
    if (!channelType) return;

    setSendingToSlack(true);
    try {
      await onSendToSlack(query.id, channelType);
    } finally {
      setSendingToSlack(false);
      // Reset dropdown
      e.target.value = '';
    }
  };

  return (
    <tr
      className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={onSelect}
    >
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-indigo-600">
            {query.ticket_number}
          </span>
          {slaStatus === 'breach' && (
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
          )}
          {slaStatus === 'warning' && (
            <Clock className="h-3.5 w-3.5 text-amber-500" />
          )}
          {query.slack_channel && (
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-[10px] font-medium" title={`Sent to ${query.slack_channel_name}`}>
              {query.slack_channel_name}
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-1.5 text-gray-500">
          {sourceIcons[query.source]}
          <span className="text-xs">{query.source}</span>
        </div>
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
              {query.user_name || '-'}
            </p>
            <p className="text-xs text-gray-500">{query.user_contact || <span className="text-red-400">No contact</span>}</p>
          </div>
          {!query.has_contact_info && (
            <span className="p-1 bg-red-100 rounded" title="No contact info">
              <PhoneOff className="h-3 w-3 text-red-500" />
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3">
        <p className="text-sm text-gray-700 truncate max-w-[250px]">
          {query.query_type_name}
          {query.query_subtype_name && ` > ${query.query_subtype_name}`}
        </p>
      </td>
      <td className="py-2.5 px-3">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[query.status]}`}>
          {query.status.replace('_', ' ')}
        </span>
      </td>
      <td className="py-2.5 px-3">
        <span className={`text-sm font-medium ${
          slaStatus === 'breach' ? 'text-red-600' :
          slaStatus === 'warning' ? 'text-amber-600' : 'text-gray-600'
        }`}>
          {calculateTAT(query.created_at, query.resolved_at)}
        </span>
      </td>
      <td className="py-2.5 px-3 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 justify-end">
          {/* Send to Slack dropdown - always show to allow re-sending */}
          <select
            defaultValue=""
            onChange={handleSlackSend}
            disabled={sendingToSlack}
            className={`text-xs px-1.5 py-1 border rounded cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400 disabled:opacity-50 w-24 ${
              query.slack_channel
                ? 'bg-green-50 hover:bg-green-100 text-green-700'
                : 'bg-purple-50 hover:bg-purple-100 text-purple-700'
            }`}
            title={query.slack_channel ? `Sent to ${query.slack_channel_name}. Click to resend.` : 'Send to Slack'}
          >
            <option value="" disabled>
              {sendingToSlack ? '...' : query.slack_channel ? `✓ ${query.slack_channel_name}` : '📤 Slack'}
            </option>
            {slackChannelOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {query.slack_channel === opt.value ? `↻ ${opt.label}` : opt.label}
              </option>
            ))}
          </select>

          {/* Status dropdown */}
          <select
            value={query.status}
            onChange={handleStatusChange}
            className="text-xs px-1.5 py-1 border rounded bg-white hover:bg-gray-50 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 w-28"
          >
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </td>
    </tr>
  );
}

// Collapsible Query Section Component
function QuerySection({
  title,
  icon,
  queries,
  isOpen,
  onToggle,
  onSelectQuery,
  onStatusUpdate,
  onSendToSlack,
  color
}: {
  title: string;
  icon: React.ReactNode;
  queries: CSQuery[];
  isOpen: boolean;
  onToggle: () => void;
  onSelectQuery: (q: CSQuery) => void;
  onStatusUpdate: (id: number, status: string) => void;
  onSendToSlack: (id: number, channelType: string) => void;
  color: string;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-2.5 ${color} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {icon}
          <span className="font-medium">{title}</span>
          <span className="px-2 py-0.5 bg-white/50 rounded-full text-xs font-semibold">
            {queries.length}
          </span>
        </div>
      </button>

      {isOpen && queries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="py-2 px-3 font-medium">Ticket</th>
                <th className="py-2 px-3 font-medium">Source</th>
                <th className="py-2 px-3 font-medium">User</th>
                <th className="py-2 px-3 font-medium">Category</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium">TAT</th>
                <th className="py-2 px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queries.map(query => (
                <TicketRow
                  key={query.id}
                  query={query}
                  onSelect={() => onSelectQuery(query)}
                  onStatusUpdate={onStatusUpdate}
                  onSendToSlack={onSendToSlack}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isOpen && queries.length === 0 && (
        <div className="py-8 text-center text-gray-400">
          <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No queries</p>
        </div>
      )}
    </div>
  );
}

// Stakeholder Section Component
function StakeholderSection({
  type,
  queries,
  expandedSections,
  onToggleSection,
  onSelectQuery,
  onStatusUpdate,
  onSendToSlack
}: {
  type: 'user' | 'leader' | 'venue';
  queries: CSQuery[];
  expandedSections: Record<string, boolean>;
  onToggleSection: (key: string) => void;
  onSelectQuery: (q: CSQuery) => void;
  onStatusUpdate: (id: number, status: string) => void;
  onSendToSlack: (id: number, channelType: string) => void;
}) {
  const config = stakeholderConfig[type];
  const typeQueries = queries.filter(q => q.stakeholder_type === type);
  // Open = created, in_progress, ticket_communicated, resolved (not yet communicated to user)
  const openQueries = typeQueries.filter(q => ['created', 'in_progress', 'ticket_communicated', 'resolved'].includes(q.status));
  // Closed = only resolution_communicated (final state - resolution communicated to user)
  const closedQueries = typeQueries.filter(q => q.status === 'resolution_communicated');

  const sectionKey = `${type}`;
  const isExpanded = expandedSections[sectionKey] !== false;

  return (
    <div className={`rounded-xl border-2 ${config.borderColor} overflow-hidden`}>
      <button
        onClick={() => onToggleSection(sectionKey)}
        className={`w-full flex items-center justify-between px-5 py-4 ${config.bgColor} hover:opacity-95 transition-all`}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className={`h-5 w-5 ${config.color}`} />
          ) : (
            <ChevronRight className={`h-5 w-5 ${config.color}`} />
          )}
          <div className={`p-2 rounded-lg bg-white shadow-sm ${config.color}`}>
            {config.icon}
          </div>
          <div className="text-left">
            <h3 className={`text-lg font-bold ${config.color}`}>{config.label}</h3>
            <p className="text-xs text-gray-500">
              {openQueries.length} open, {closedQueries.length} closed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${config.bgColor} ${config.color} border ${config.borderColor}`}>
            {typeQueries.length} total
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-3 bg-white">
          <QuerySection
            title="Open Queries"
            icon={<FolderOpen className="h-4 w-4" />}
            queries={openQueries}
            isOpen={expandedSections[`${type}-open`] !== false}
            onToggle={() => onToggleSection(`${type}-open`)}
            onSelectQuery={onSelectQuery}
            onStatusUpdate={onStatusUpdate}
            onSendToSlack={onSendToSlack}
            color="bg-blue-50 text-blue-700"
          />

          <QuerySection
            title="Closed Queries"
            icon={<Archive className="h-4 w-4" />}
            queries={closedQueries}
            isOpen={expandedSections[`${type}-closed`] === true}
            onToggle={() => onToggleSection(`${type}-closed`)}
            onSelectQuery={onSelectQuery}
            onStatusUpdate={onStatusUpdate}
            onSendToSlack={onSendToSlack}
            color="bg-gray-100 text-gray-600"
          />
        </div>
      )}
    </div>
  );
}

// TAT Modal Component
function TATModal({
  queries,
  onClose
}: {
  queries: CSQuery[];
  onClose: () => void;
}) {
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [selectedStakeholder, setSelectedStakeholder] = useState<string | null>(null);

  const filteredQueries = useMemo(() => {
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    toDate.setHours(23, 59, 59, 999);

    return queries.filter(q => {
      const created = new Date(q.created_at);
      return created >= fromDate && created <= toDate;
    });
  }, [queries, dateRange]);

  const calculateAvgTAT = (qs: CSQuery[]) => {
    // TAT is calculated only when ticket is fully closed (resolution_communicated)
    const closedQueries = qs.filter(q => q.closed_at);
    if (closedQueries.length === 0) return null;
    const totalHours = closedQueries.reduce((sum, q) => sum + calculateTATHours(q.created_at, q.closed_at), 0);
    return totalHours / closedQueries.length;
  };

  const overallTAT = calculateAvgTAT(filteredQueries);
  const userTAT = calculateAvgTAT(filteredQueries.filter(q => q.stakeholder_type === 'user'));
  const leaderTAT = calculateAvgTAT(filteredQueries.filter(q => q.stakeholder_type === 'leader'));
  const venueTAT = calculateAvgTAT(filteredQueries.filter(q => q.stakeholder_type === 'venue'));

  const getStakeholderStats = (type: string) => {
    const qs = filteredQueries.filter(q => q.stakeholder_type === type);
    // Count as closed only when resolution_communicated (closed_at is set)
    const closed = qs.filter(q => q.closed_at).length;
    const total = qs.length;
    return { resolved: closed, total, pending: total - closed };
  };

  const userStats = getStakeholderStats('user');
  const leaderStats = getStakeholderStats('leader');
  const venueStats = getStakeholderStats('venue');

  // Get category-wise TAT breakdown for selected stakeholder
  const getCategoryBreakdown = (stakeholderType: string) => {
    const qs = filteredQueries.filter(q => q.stakeholder_type === stakeholderType);
    const categoryMap = new Map<string, { total: number; closed: number; totalHours: number }>();

    qs.forEach(q => {
      const category = q.query_type_name || 'Other';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { total: 0, closed: 0, totalHours: 0 });
      }
      const cat = categoryMap.get(category)!;
      cat.total++;
      // TAT calculated only when resolution_communicated (closed_at is set)
      if (q.closed_at) {
        cat.closed++;
        cat.totalHours += calculateTATHours(q.created_at, q.closed_at);
      }
    });

    return Array.from(categoryMap.entries())
      .map(([name, data]) => ({
        name,
        total: data.total,
        resolved: data.closed,
        avgTAT: data.closed > 0 ? data.totalHours / data.closed : null
      }))
      .sort((a, b) => b.total - a.total);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-amber-100 rounded-xl">
              <Timer className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Turn Around Time (TAT)</h2>
              <p className="text-sm text-gray-500">Average resolution time by stakeholder</p>
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">From:</label>
              <input
                type="date"
                value={dateRange.from}
                onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                className="px-3 py-1.5 border rounded-lg text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">To:</label>
              <input
                type="date"
                value={dateRange.to}
                onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                className="px-3 py-1.5 border rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Overall TAT */}
          <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
            <p className="text-sm text-amber-700 font-medium mb-1">Overall Average TAT</p>
            <p className="text-3xl font-bold text-amber-700">
              {overallTAT ? formatTATDisplay(overallTAT) : 'No resolved queries'}
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Based on {filteredQueries.filter(q => q.resolved_at).length} resolved queries
            </p>
          </div>

          {/* Stakeholder Breakdown */}
          <div className="grid grid-cols-3 gap-4">
            {/* Users */}
            <button
              onClick={() => setSelectedStakeholder(selectedStakeholder === 'user' ? null : 'user')}
              className={`p-4 rounded-xl border text-left transition-all ${
                selectedStakeholder === 'user'
                  ? 'bg-indigo-100 border-indigo-400 ring-2 ring-indigo-300'
                  : 'bg-indigo-50 border-indigo-200 hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <UserIcon className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-semibold text-indigo-700">Users</span>
                <ChevronRight className={`h-3 w-3 text-indigo-400 ml-auto transition-transform ${selectedStakeholder === 'user' ? 'rotate-90' : ''}`} />
              </div>
              <p className="text-2xl font-bold text-indigo-700">
                {userTAT ? formatTATDisplay(userTAT) : '-'}
              </p>
              <p className="text-xs text-indigo-600 mt-1">
                {userStats.resolved}/{userStats.total} resolved
              </p>
              <div className="mt-2 pt-2 border-t border-indigo-200">
                <p className="text-xs text-indigo-500">Avg Resolution Time</p>
                <p className="text-sm font-semibold text-indigo-700">
                  {userTAT ? formatTATDisplay(userTAT) : 'No data'}
                </p>
              </div>
            </button>

            {/* Leaders */}
            <button
              onClick={() => setSelectedStakeholder(selectedStakeholder === 'leader' ? null : 'leader')}
              className={`p-4 rounded-xl border text-left transition-all ${
                selectedStakeholder === 'leader'
                  ? 'bg-purple-100 border-purple-400 ring-2 ring-purple-300'
                  : 'bg-purple-50 border-purple-200 hover:border-purple-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-semibold text-purple-700">Leaders</span>
                <ChevronRight className={`h-3 w-3 text-purple-400 ml-auto transition-transform ${selectedStakeholder === 'leader' ? 'rotate-90' : ''}`} />
              </div>
              <p className="text-2xl font-bold text-purple-700">
                {leaderTAT ? formatTATDisplay(leaderTAT) : '-'}
              </p>
              <p className="text-xs text-purple-600 mt-1">
                {leaderStats.resolved}/{leaderStats.total} resolved
              </p>
              <div className="mt-2 pt-2 border-t border-purple-200">
                <p className="text-xs text-purple-500">Avg Resolution Time</p>
                <p className="text-sm font-semibold text-purple-700">
                  {leaderTAT ? formatTATDisplay(leaderTAT) : 'No data'}
                </p>
              </div>
            </button>

            {/* Venues */}
            <button
              onClick={() => setSelectedStakeholder(selectedStakeholder === 'venue' ? null : 'venue')}
              className={`p-4 rounded-xl border text-left transition-all ${
                selectedStakeholder === 'venue'
                  ? 'bg-teal-100 border-teal-400 ring-2 ring-teal-300'
                  : 'bg-teal-50 border-teal-200 hover:border-teal-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-4 w-4 text-teal-600" />
                <span className="text-sm font-semibold text-teal-700">Venues</span>
                <ChevronRight className={`h-3 w-3 text-teal-400 ml-auto transition-transform ${selectedStakeholder === 'venue' ? 'rotate-90' : ''}`} />
              </div>
              <p className="text-2xl font-bold text-teal-700">
                {venueTAT ? formatTATDisplay(venueTAT) : '-'}
              </p>
              <p className="text-xs text-teal-600 mt-1">
                {venueStats.resolved}/{venueStats.total} resolved
              </p>
              <div className="mt-2 pt-2 border-t border-teal-200">
                <p className="text-xs text-teal-500">Avg Resolution Time</p>
                <p className="text-sm font-semibold text-teal-700">
                  {venueTAT ? formatTATDisplay(venueTAT) : 'No data'}
                </p>
              </div>
            </button>
          </div>

          {/* Category Breakdown - shows when stakeholder is selected */}
          {selectedStakeholder && (
            <div className="mt-4 p-4 bg-gray-50 rounded-xl border">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Category-wise TAT for {selectedStakeholder.charAt(0).toUpperCase() + selectedStakeholder.slice(1)}s
              </h3>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3">Category</th>
                      <th className="text-center py-2 px-3">Total</th>
                      <th className="text-center py-2 px-3">Resolved</th>
                      <th className="text-right py-2 px-3">Avg TAT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getCategoryBreakdown(selectedStakeholder).map((cat, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-medium text-gray-700">{cat.name}</td>
                        <td className="py-2 px-3 text-center text-gray-600">{cat.total}</td>
                        <td className="py-2 px-3 text-center text-gray-600">{cat.resolved}</td>
                        <td className="py-2 px-3 text-right font-semibold text-gray-700">
                          {cat.avgTAT ? formatTATDisplay(cat.avgTAT) : '-'}
                        </td>
                      </tr>
                    ))}
                    {getCategoryBreakdown(selectedStakeholder).length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-gray-400">
                          No data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Add Category Modal Component
function AddCategoryModal({
  queryTypes,
  onClose,
  onSave
}: {
  queryTypes: QueryType[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    stakeholder_type: 'user',
    name: '',
    parent_id: '',
    default_sla_hours: '24'
  });
  const [saving, setSaving] = useState(false);

  const mainTypes = queryTypes.filter(t => t.stakeholder_type === form.stakeholder_type && t.parent_id === null);

  const handleSave = async () => {
    if (!form.name.trim()) return;

    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/cs/query-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stakeholder_type: form.stakeholder_type,
          name: form.name.trim(),
          parent_id: form.parent_id ? parseInt(form.parent_id) : null,
          default_sla_hours: parseInt(form.default_sla_hours)
        })
      });

      if (response.ok) {
        onSave();
        onClose();
      }
    } catch (error) {
      console.error('Failed to save category:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-green-100 rounded-xl">
              <Plus className="h-5 w-5 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Add Category</h2>
          </div>

          <div className="space-y-4">
            {/* Stakeholder Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stakeholder Type</label>
              <div className="flex gap-2">
                {['user', 'leader', 'venue'].map(type => (
                  <button
                    key={type}
                    onClick={() => setForm(f => ({ ...f, stakeholder_type: type, parent_id: '' }))}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      form.stakeholder_type === type
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Parent Category (optional - for subcategory) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parent Category <span className="text-gray-400">(leave empty for main category)</span>
              </label>
              <select
                value={form.parent_id}
                onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">-- Main Category --</option>
                {mainTypes.map(type => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {form.parent_id ? 'Subcategory Name' : 'Category Name'} *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder={form.parent_id ? 'e.g., Payment Failed' : 'e.g., Payment Issues'}
              />
            </div>

            {/* SLA Hours */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default SLA (hours)</label>
              <input
                type="number"
                value={form.default_sla_hours}
                onChange={e => setForm(f => ({ ...f, default_sla_hours: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                min="1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || saving}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Category'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Dashboard Component
export default function CustomerServiceDashboard() {
  const [queries, setQueries] = useState<CSQuery[]>([]);
  const [queryTypes, setQueryTypes] = useState<QueryType[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pollingStatus, setPollingStatus] = useState<PollingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // UI State
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'user': false,
    'user-open': true,
    'user-closed': false,
    'leader': false,
    'leader-open': true,
    'leader-closed': false,
    'venue': false,
    'venue-open': true,
    'venue-closed': false,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQuery, setSelectedQuery] = useState<CSQuery | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTATModal, setShowTATModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    stakeholder_type: 'user',
    source: 'whatsapp',
    query_type_id: '',
    query_subtype_id: '',
    user_name: '',
    user_contact: '',
    description: '',
    club_id: '',
    club_name: '',
    attachments: [] as string[]
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [clubs, setClubs] = useState<Club[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);

  // Edit mode state for detail modal
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editedDescription, setEditedDescription] = useState('');
  const [editedAttachments, setEditedAttachments] = useState<string[]>([]);
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [clubSearch, setClubSearch] = useState('');
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [loadingHosts, setLoadingHosts] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [queriesRes, typesRes, statsRes, pollingRes] = await Promise.all([
        fetch(`${API_BASE}/api/cs/queries?limit=500`),
        fetch(`${API_BASE}/api/cs/query-types`),
        fetch(`${API_BASE}/api/cs/stats`),
        fetch(`${API_BASE}/api/cs/polling/status`)
      ]);

      const queriesData = await queriesRes.json();
      const typesData = await typesRes.json();
      const statsData = await statsRes.json();
      const pollingData = await pollingRes.json();

      setQueries(queriesData.queries || []);
      setQueryTypes(typesData || []);
      setStats(statsData);
      setPollingStatus(pollingData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Fetch clubs when search changes (debounced)
  useEffect(() => {
    if (createForm.stakeholder_type !== 'leader') return;

    const timer = setTimeout(async () => {
      setLoadingClubs(true);
      try {
        const res = await fetch(`${API_BASE}/api/cs/clubs?search=${encodeURIComponent(clubSearch)}`);
        const data = await res.json();
        if (data.success) {
          setClubs(data.clubs || []);
        }
      } catch (error) {
        console.error('Failed to fetch clubs:', error);
      } finally {
        setLoadingClubs(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [clubSearch, createForm.stakeholder_type]);

  // Fetch hosts when club changes
  useEffect(() => {
    if (!createForm.club_id) {
      setHosts([]);
      return;
    }

    const fetchHosts = async () => {
      setLoadingHosts(true);
      try {
        const res = await fetch(`${API_BASE}/api/cs/clubs/${createForm.club_id}/hosts`);
        const data = await res.json();
        if (data.success) {
          setHosts(data.hosts || []);
        }
      } catch (error) {
        console.error('Failed to fetch hosts:', error);
      } finally {
        setLoadingHosts(false);
      }
    };

    fetchHosts();
  }, [createForm.club_id]);

  // Toggle section
  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter queries by search
  const filteredQueries = queries.filter(q => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      q.ticket_number.toLowerCase().includes(search) ||
      q.user_name?.toLowerCase().includes(search) ||
      q.user_contact?.toLowerCase().includes(search) ||
      q.subject?.toLowerCase().includes(search) ||
      q.description?.toLowerCase().includes(search)
    );
  });

  // Check if venue has any queries
  const hasVenueQueries = queries.some(q => q.stakeholder_type === 'venue');

  // Calculate overall TAT for display - only when resolution_communicated (closed_at is set)
  const overallAvgTAT = useMemo(() => {
    const closedQueries = queries.filter(q => q.closed_at);
    if (closedQueries.length === 0) return null;
    const totalHours = closedQueries.reduce((sum, q) => sum + calculateTATHours(q.created_at, q.closed_at), 0);
    return totalHours / closedQueries.length;
  }, [queries]);

  // Sync now
  const syncNow = async () => {
    setSyncing(true);
    try {
      await fetch(`${API_BASE}/api/cs/polling/trigger`, { method: 'POST' });
      await fetchData();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  // Toggle polling
  const togglePolling = async () => {
    try {
      const endpoint = pollingStatus?.active ? 'stop' : 'start';
      await fetch(`${API_BASE}/api/cs/polling/${endpoint}`, { method: 'POST' });
      const res = await fetch(`${API_BASE}/api/cs/polling/status`);
      setPollingStatus(await res.json());
    } catch (error) {
      console.error('Toggle polling failed:', error);
    }
  };

  // Update query status
  const updateStatus = async (id: number, status: string) => {
    try {
      await fetch(`${API_BASE}/api/cs/queries/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      await fetchData();
    } catch (error) {
      console.error('Status update failed:', error);
    }
  };

  // Save query details (description, attachments)
  const saveQueryDetails = async () => {
    if (!selectedQuery) return;
    setSavingEdit(true);
    try {
      const response = await fetch(`${API_BASE}/api/cs/queries/${selectedQuery.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: editedDescription,
          attachments: editedAttachments
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Update selected query with new data
        setSelectedQuery(data.query);
        setIsEditingDetails(false);
        await fetchData();
      } else {
        alert('Failed to save changes');
      }
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save changes');
    } finally {
      setSavingEdit(false);
    }
  };

  // Start editing details
  const startEditingDetails = () => {
    if (selectedQuery) {
      setEditedDescription(selectedQuery.description || selectedQuery.subject || '');
      setEditedAttachments(selectedQuery.attachments || []);
      setNewAttachmentUrl('');
      setIsEditingDetails(true);
    }
  };

  // Cancel editing
  const cancelEditingDetails = () => {
    setIsEditingDetails(false);
    setEditedDescription('');
    setEditedAttachments([]);
    setNewAttachmentUrl('');
  };

  // Add attachment URL
  const addEditAttachment = () => {
    if (newAttachmentUrl.trim()) {
      setEditedAttachments([...editedAttachments, newAttachmentUrl.trim()]);
      setNewAttachmentUrl('');
    }
  };

  // Remove attachment
  const removeEditAttachment = (index: number) => {
    setEditedAttachments(editedAttachments.filter((_, i) => i !== index));
  };

  // Send ticket to Slack
  const sendToSlack = async (id: number, channelType: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/cs/slack/send/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_type: channelType })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        await fetchData();
      } else {
        console.error('Failed to send to Slack:', data.error);
        alert(data.error || 'Failed to send to Slack');
      }
    } catch (error) {
      console.error('Send to Slack failed:', error);
      alert('Failed to send to Slack');
    }
  };

  // Get query types for create form
  const getMainTypes = (stakeholder: string) =>
    queryTypes.filter(t => t.stakeholder_type === stakeholder && t.parent_id === null);

  const getSubTypes = (parentId: number) =>
    queryTypes.filter(t => t.parent_id === parentId);

  // Create query
  const createQuery = async () => {
    setCreateError(null);
    try {
      const response = await fetch(`${API_BASE}/api/cs/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          subject: createForm.description.slice(0, 100),
          query_type_id: parseInt(createForm.query_type_id),
          query_subtype_id: createForm.query_subtype_id ? parseInt(createForm.query_subtype_id) : null,
          club_id: createForm.club_id ? parseInt(createForm.club_id) : null,
          club_name: createForm.club_name || null,
          attachments: createForm.attachments
        })
      });

      if (response.ok) {
        setShowCreateModal(false);
        setCreateForm({
          stakeholder_type: 'user',
          source: 'whatsapp',
          query_type_id: '',
          query_subtype_id: '',
          user_name: '',
          user_contact: '',
          description: '',
          club_id: '',
          club_name: '',
          attachments: []
        });
        setAttachmentUrl('');
        setClubSearch('');
        setClubs([]);
        setHosts([]);
        await fetchData();
      } else {
        const data = await response.json().catch(() => null);
        setCreateError(data?.error || `Failed to create query (${response.status})`);
      }
    } catch (error) {
      console.error('Create query failed:', error);
      setCreateError('Failed to connect to server. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 rounded-xl">
            <Headphones className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Customer Service</h1>
            <p className="text-sm text-gray-500">Manage queries from users, leaders & venues</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Auto-sync toggle */}
          <button
            onClick={togglePolling}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pollingStatus?.active
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${pollingStatus?.active ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            Auto-sync {pollingStatus?.active ? 'ON' : 'OFF'}
          </button>

          {/* Sync Now */}
          <button
            onClick={syncNow}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync Now
          </button>

          {/* New Query */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Query
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Queries</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.total || 0}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <FileText className="h-5 w-5 text-gray-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Open</p>
              <p className="text-2xl font-bold text-blue-600">{(stats?.open || 0) + (stats?.in_progress || 0) + (stats?.pending || 0) + (stats?.resolved || 0)}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Inbox className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Closed</p>
              <p className="text-2xl font-bold text-green-600">{stats?.closed || 0}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </div>
        {/* TAT Card */}
        <button
          onClick={() => setShowTATModal(true)}
          className="bg-white rounded-xl p-4 border shadow-sm hover:border-amber-300 hover:shadow-md transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg TAT</p>
              <p className="text-2xl font-bold text-amber-600">
                {overallAvgTAT ? formatTATDisplay(overallAvgTAT) : '-'}
              </p>
            </div>
            <div className="p-3 bg-amber-100 rounded-lg">
              <Timer className="h-5 w-5 text-amber-600" />
            </div>
          </div>
          <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Click for details
          </p>
        </button>
        {/* No Contact Card */}
        <div className="bg-white rounded-xl p-4 border shadow-sm border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">No Contact</p>
              <p className="text-2xl font-bold text-red-600">{stats?.no_contact || 0}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-lg">
              <PhoneOff className="h-5 w-5 text-red-600" />
            </div>
          </div>
          <p className="text-xs text-red-500 mt-1">Missing phone/email</p>
        </div>
      </div>

      {/* Stakeholder Sections */}
      <div className="space-y-4">
        <StakeholderSection
          type="user"
          queries={filteredQueries}
          expandedSections={expandedSections}
          onToggleSection={toggleSection}
          onSelectQuery={(q) => { setSelectedQuery(q); setShowDetailModal(true); }}
          onStatusUpdate={updateStatus}
          onSendToSlack={sendToSlack}
        />

        <StakeholderSection
          type="leader"
          queries={filteredQueries}
          expandedSections={expandedSections}
          onToggleSection={toggleSection}
          onSelectQuery={(q) => { setSelectedQuery(q); setShowDetailModal(true); }}
          onStatusUpdate={updateStatus}
          onSendToSlack={sendToSlack}
        />

        {/* Only show Venues if there are venue queries */}
        {hasVenueQueries && (
          <StakeholderSection
            type="venue"
            queries={filteredQueries}
            expandedSections={expandedSections}
            onToggleSection={toggleSection}
            onSelectQuery={(q) => { setSelectedQuery(q); setShowDetailModal(true); }}
            onStatusUpdate={updateStatus}
            onSendToSlack={sendToSlack}
          />
        )}
      </div>

      {/* Create Query Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { setShowCreateModal(false); setCreateError(null); }} />
          <div className="flex min-h-full items-center justify-center p-4 relative z-10">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
              <h2 className="text-xl font-bold text-gray-900 mb-6">New Query</h2>

              <div className="space-y-4">
                {/* Stakeholder Type */}
                <div className="flex gap-2">
                  {['user', 'leader', 'venue'].map(type => (
                    <button
                      key={type}
                      onClick={() => {
                        setCreateForm(f => ({
                          ...f,
                          stakeholder_type: type,
                          query_type_id: '',
                          query_subtype_id: '',
                          club_id: '',
                          club_name: '',
                          user_name: '',
                          user_contact: ''
                        }));
                        setClubSearch('');
                        setClubs([]);
                        setHosts([]);
                      }}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        createForm.stakeholder_type === type
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Source */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                  <select
                    value={createForm.source}
                    onChange={e => setCreateForm(f => ({ ...f, source: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="app">App</option>
                    <option value="website">Website</option>
                    <option value="playstore">Play Store</option>
                    <option value="appstore">App Store</option>
                  </select>
                </div>

                {/* Category with Add button */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">Category *</label>
                    <button
                      onClick={() => setShowAddCategoryModal(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Add Category
                    </button>
                  </div>
                  <select
                    value={createForm.query_type_id}
                    onChange={e => setCreateForm(f => ({ ...f, query_type_id: e.target.value, query_subtype_id: '' }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">Select Category</option>
                    {getMainTypes(createForm.stakeholder_type).map(type => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                  </select>
                </div>

                {/* Subcategory */}
                {createForm.query_type_id && getSubTypes(parseInt(createForm.query_type_id)).length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory</label>
                    <select
                      value={createForm.query_subtype_id}
                      onChange={e => setCreateForm(f => ({ ...f, query_subtype_id: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="">Select Subcategory (Optional)</option>
                      {getSubTypes(parseInt(createForm.query_type_id)).map(type => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Club Selection - Only for Leaders */}
                {createForm.stakeholder_type === 'leader' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Club Name</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={clubSearch}
                        onChange={e => {
                          setClubSearch(e.target.value);
                          setCreateForm(f => ({ ...f, club_id: '', club_name: '' }));
                        }}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        placeholder="Search for club..."
                      />
                      {loadingClubs && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
                        </div>
                      )}
                    </div>
                    {clubs.length > 0 && !createForm.club_id && clubSearch && (
                      <div className="mt-1 border rounded-lg max-h-40 overflow-y-auto bg-white shadow-lg">
                        {clubs.map(club => (
                          <button
                            key={club.id}
                            type="button"
                            onClick={() => {
                              setCreateForm(f => ({
                                ...f,
                                club_id: club.id.toString(),
                                club_name: club.name
                              }));
                              setClubSearch(club.name);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-b-0"
                          >
                            <span className="font-medium">{club.name}</span>
                            {club.activity && (
                              <span className="text-gray-500 ml-2 text-xs">({club.activity})</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {createForm.club_name && (
                      <p className="text-xs text-green-600 mt-1">Selected: {createForm.club_name}</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={createForm.user_name}
                      onChange={e => setCreateForm(f => ({ ...f, user_name: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="Name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                    <input
                      type="text"
                      value={createForm.user_contact}
                      onChange={e => setCreateForm(f => ({ ...f, user_contact: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="Phone number"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                  <textarea
                    value={createForm.description}
                    onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm h-24 resize-none"
                    placeholder="Describe the query..."
                  />
                </div>

                {/* Attachments */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Attachments (Image, PDF, or Link)</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={attachmentUrl}
                      onChange={e => setAttachmentUrl(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                      placeholder="Paste URL (image, PDF, or any link)..."
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (attachmentUrl.trim()) {
                          setCreateForm(f => ({ ...f, attachments: [...f.attachments, attachmentUrl.trim()] }));
                          setAttachmentUrl('');
                        }
                      }}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                    >
                      Add
                    </button>
                  </div>
                  {createForm.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {createForm.attachments.map((url, idx) => {
                        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url) || url.includes('image');
                        const isPdf = /\.pdf$/i.test(url);

                        return (
                          <div key={idx} className="relative group">
                            {isImage ? (
                              <img src={url} alt={`Attachment ${idx + 1}`} className="h-16 w-16 object-cover rounded border" />
                            ) : isPdf ? (
                              <div className="h-16 w-16 flex items-center justify-center bg-red-50 border border-red-200 rounded">
                                <FileText className="h-6 w-6 text-red-600" />
                              </div>
                            ) : (
                              <div className="h-16 w-16 flex items-center justify-center bg-blue-50 border border-blue-200 rounded">
                                <MessageSquare className="h-6 w-6 text-blue-600" />
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setCreateForm(f => ({ ...f, attachments: f.attachments.filter((_, i) => i !== idx) }))}
                              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {createError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => { setShowCreateModal(false); setCreateError(null); }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={createQuery}
                  disabled={!createForm.query_type_id || !createForm.user_contact || !createForm.description}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Query
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Query Detail Modal */}
      {showDetailModal && selectedQuery && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { setShowDetailModal(false); cancelEditingDetails(); }} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => { setShowDetailModal(false); cancelEditingDetails(); }}
                className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>

              {/* Header */}
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <FileText className="h-6 w-6 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-lg font-bold text-indigo-600">
                      {selectedQuery.ticket_number}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${stakeholderConfig[selectedQuery.stakeholder_type]?.bgColor} ${stakeholderConfig[selectedQuery.stakeholder_type]?.color}`}>
                      {selectedQuery.stakeholder_type}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusColors[selectedQuery.status]}`}>
                      {selectedQuery.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">Created {formatDate(selectedQuery.created_at)}</p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Phone className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Phone</p>
                    <p className="font-medium">
                      {selectedQuery.user_contact || <span className="text-red-500 text-sm">No contact</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <UserIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Name</p>
                    <p className="font-medium text-sm truncate max-w-[150px]" title={selectedQuery.user_name || ''}>
                      {selectedQuery.user_name || <span className="text-gray-400">N/A</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Timer className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">TAT</p>
                    <p className="font-medium">{calculateTAT(selectedQuery.created_at, selectedQuery.resolved_at)}</p>
                  </div>
                </div>
              </div>

              {/* No Contact Warning */}
              {!selectedQuery.has_contact_info && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                  <PhoneOff className="h-5 w-5 text-red-500" />
                  <p className="text-sm text-red-700">This ticket has no contact information - cannot reach the user</p>
                </div>
              )}

              {/* Category */}
              <div className="mb-4">
                <p className="text-sm text-gray-500 mb-1">Category</p>
                <p className="font-medium">
                  {selectedQuery.query_type_name}
                  {selectedQuery.query_subtype_name && ` > ${selectedQuery.query_subtype_name}`}
                </p>
              </div>

              {/* Description */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-gray-500">Description</p>
                  {!isEditingDetails && (
                    <button
                      onClick={startEditingDetails}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  )}
                </div>
                {isEditingDetails ? (
                  <textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    className="w-full p-4 bg-white border border-gray-300 rounded-lg text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    rows={5}
                    placeholder="Enter description..."
                  />
                ) : (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-gray-700 whitespace-pre-wrap">
                      {selectedQuery.description || selectedQuery.subject || 'No description provided'}
                    </p>
                  </div>
                )}
              </div>

              {/* Attachments */}
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">
                  Attachments ({isEditingDetails ? editedAttachments.length : (selectedQuery.attachments?.length || 0)})
                </p>

                {isEditingDetails ? (
                  <div className="space-y-3">
                    {/* Add new attachment */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newAttachmentUrl}
                        onChange={(e) => setNewAttachmentUrl(e.target.value)}
                        placeholder="Paste image/file URL..."
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        onKeyDown={(e) => e.key === 'Enter' && addEditAttachment()}
                      />
                      <button
                        onClick={addEditAttachment}
                        disabled={!newAttachmentUrl.trim()}
                        className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Link className="h-4 w-4" />
                      </button>
                    </div>

                    {/* List of attachments */}
                    {editedAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {editedAttachments.map((url, idx) => (
                          <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm">
                            <span className="truncate max-w-[200px]">{url}</span>
                            <button
                              onClick={() => removeEditAttachment(idx)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  selectedQuery.attachments && selectedQuery.attachments.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {selectedQuery.attachments.map((url: string, idx: number) => {
                        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url) || url.includes('image');
                        const isPdf = /\.pdf$/i.test(url);

                        if (isImage) {
                          return (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block"
                            >
                              <img
                                src={url}
                                alt={`Attachment ${idx + 1}`}
                                className="h-24 w-24 object-cover rounded-lg border hover:border-indigo-400 transition-colors cursor-pointer"
                              />
                            </a>
                          );
                        }

                        if (isPdf) {
                          return (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                            >
                              <FileText className="h-6 w-6 text-red-600" />
                              <span className="text-sm text-red-700 font-medium">PDF {idx + 1}</span>
                            </a>
                          );
                        }

                        // Generic link
                        return (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors max-w-xs"
                          >
                            <MessageSquare className="h-5 w-5 text-blue-600 flex-shrink-0" />
                            <span className="text-sm text-blue-700 truncate">{url.length > 40 ? url.slice(0, 40) + '...' : url}</span>
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No attachments</p>
                  )
                )}
              </div>

              {/* Edit Save/Cancel Buttons */}
              {isEditingDetails && (
                <div className="flex gap-3 mb-6">
                  <button
                    onClick={saveQueryDetails}
                    disabled={savingEdit}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {savingEdit ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={cancelEditingDetails}
                    disabled={savingEdit}
                    className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Timeline */}
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Timeline</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    <span className="text-gray-600">Created: {formatDate(selectedQuery.created_at)}</span>
                  </div>
                  {selectedQuery.first_response_at && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                      <span className="text-gray-600">First response: {formatDate(selectedQuery.first_response_at)}</span>
                    </div>
                  )}
                  {selectedQuery.resolved_at && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-gray-600">Resolved: {formatDate(selectedQuery.resolved_at)}</span>
                    </div>
                  )}
                  {selectedQuery.closed_at && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 bg-gray-500 rounded-full" />
                      <span className="text-gray-600">Closed: {formatDate(selectedQuery.closed_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              {selectedQuery.status !== 'closed' && (
                <div className="flex gap-3">
                  {selectedQuery.status === 'open' && (
                    <button
                      onClick={() => { updateStatus(selectedQuery.id, 'in_progress'); setShowDetailModal(false); }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                    >
                      <Play className="h-4 w-4" />
                      Start Working
                    </button>
                  )}
                  {selectedQuery.status === 'in_progress' && (
                    <button
                      onClick={() => { updateStatus(selectedQuery.id, 'resolved'); setShowDetailModal(false); }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Mark Resolved
                    </button>
                  )}
                  {selectedQuery.status === 'resolved' && (
                    <button
                      onClick={() => { updateStatus(selectedQuery.id, 'closed'); setShowDetailModal(false); }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700"
                    >
                      <Archive className="h-4 w-4" />
                      Close Ticket
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAT Modal */}
      {showTATModal && (
        <TATModal queries={queries} onClose={() => setShowTATModal(false)} />
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <AddCategoryModal
          queryTypes={queryTypes}
          onClose={() => setShowAddCategoryModal(false)}
          onSave={fetchData}
        />
      )}
    </div>
  );
}
