import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  RefreshCw, Upload, Search, ChevronDown, ChevronUp, X, Info,
  Users, MessageCircle, Phone, Calendar, CheckCircle, UserX, Ghost,
  Send, Eye, AlertTriangle, Clock, Plus, Edit3, XCircle, ChevronRight
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/shark-tank`
  : '/api/shark-tank';

// Pipeline stages config (inline to avoid extra file)
const PIPELINE_STAGES = [
  'NOT_CONTACTED', 'FOLLOWED', 'DM_SENT', 'IN_CONVERSATION',
  'CALL_SCHEDULED', 'CALL_DONE', 'CONVERTED', 'ONBOARDED',
  'NOT_INTERESTED', 'GHOSTED',
] as const;

const STAGE_CONFIG: Record<string, { label: string; shortLabel: string; bgColor: string; textColor: string; badgeClass: string }> = {
  NOT_CONTACTED: { label: 'Not Contacted', shortLabel: 'NC', bgColor: 'bg-slate-100', textColor: 'text-slate-600', badgeClass: 'bg-slate-50 text-slate-600 border-slate-200' },
  FOLLOWED: { label: 'Followed', shortLabel: 'FL', bgColor: 'bg-blue-100', textColor: 'text-blue-600', badgeClass: 'bg-blue-50 text-blue-600 border-blue-200' },
  DM_SENT: { label: 'DM Sent', shortLabel: 'DM', bgColor: 'bg-cyan-100', textColor: 'text-cyan-600', badgeClass: 'bg-cyan-50 text-cyan-600 border-cyan-200' },
  IN_CONVERSATION: { label: 'In Conversation', shortLabel: 'IC', bgColor: 'bg-teal-100', textColor: 'text-teal-600', badgeClass: 'bg-teal-50 text-teal-600 border-teal-200' },
  CALL_SCHEDULED: { label: 'Call Scheduled', shortLabel: 'CS', bgColor: 'bg-purple-100', textColor: 'text-purple-600', badgeClass: 'bg-purple-50 text-purple-600 border-purple-200' },
  CALL_DONE: { label: 'Call Done', shortLabel: 'CD', bgColor: 'bg-amber-100', textColor: 'text-amber-600', badgeClass: 'bg-amber-50 text-amber-600 border-amber-200' },
  CONVERTED: { label: 'Converted', shortLabel: 'CV', bgColor: 'bg-emerald-100', textColor: 'text-emerald-600', badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  ONBOARDED: { label: 'Onboarded', shortLabel: 'OB', bgColor: 'bg-green-100', textColor: 'text-green-600', badgeClass: 'bg-green-50 text-green-600 border-green-200' },
  NOT_INTERESTED: { label: 'Not Interested', shortLabel: 'NI', bgColor: 'bg-red-100', textColor: 'text-red-600', badgeClass: 'bg-red-50 text-red-600 border-red-200' },
  GHOSTED: { label: 'Ghosted', shortLabel: 'GH', bgColor: 'bg-gray-100', textColor: 'text-gray-500', badgeClass: 'bg-gray-50 text-gray-500 border-gray-200' },
};

interface Lead {
  id: number;
  name: string;
  instagram_url: string | null;
  instagram_handle: string | null;
  whatsapp_number: string | null;
  city: string | null;
  assigned_to: string | null;
  message_template_id: number | null;
  pipeline_stage: string;
  flag: string | null;
  missive_conversation_id: string | null;
  call_link: string | null;
  call_scheduled_at: string | null;
  last_activity_at: string;
  notes: any[];
  activity_log: any[];
  activity: string | null;
  days: string | null;
  timings: string | null;
  area: string | null;
  venue: string | null;
  followers: number | null;
  leader_name: string | null;
  type: string | null;
  lead_quality: string | null;
  manual_mode: boolean;
  created_at: string;
  updated_at: string;
}

interface PendingReply {
  id: number;
  lead_id: number;
  reply_text: string;
  send_at: string;
  status: string;
  created_at: string;
  lead_name: string;
  instagram_handle: string | null;
  city: string | null;
}

interface Stats {
  by_stage: { pipeline_stage: string; count: number }[];
  by_city: { city: string; count: number }[];
  total: number;
  converted: number;
  conversion_rate: string;
}

const STAGE_ICONS: Record<string, any> = {
  NOT_CONTACTED: Users,
  FOLLOWED: Eye,
  DM_SENT: Send,
  IN_CONVERSATION: MessageCircle,
  CALL_SCHEDULED: Calendar,
  CALL_DONE: Phone,
  CONVERTED: CheckCircle,
  ONBOARDED: CheckCircle,
  NOT_INTERESTED: UserX,
  GHOSTED: Ghost,
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SharkTankCRM() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  // Sorting
  const [sortField, setSortField] = useState<string>('last_activity_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [activityFilter, setActivityFilter] = useState('');
  const [showGhosted, setShowGhosted] = useState(false);
  const [showNotInterested, setShowNotInterested] = useState(false);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisHierarchy, setAnalysisHierarchy] = useState<'city-activity' | 'activity-city'>('city-activity');
  const [expandedAnalysisRows, setExpandedAnalysisRows] = useState<Set<string>>(new Set());

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  // Pending replies
  const [pendingReplies, setPendingReplies] = useState<PendingReply[]>([]);
  const [hidePending, setHidePending] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<number | null>(null);
  const [editingReplyText, setEditingReplyText] = useState('');

  // Add lead modal
  const [showAddLead, setShowAddLead] = useState(false);
  const [showStageLegend, setShowStageLegend] = useState(false);
  const [addLeadForm, setAddLeadForm] = useState({
    name: '', instagram_handle: '', city: '', leader_name: '',
    whatsapp_number: '', activity: '', area: '',
  });
  const [addLeadError, setAddLeadError] = useState('');
  const [addLeadSaving, setAddLeadSaving] = useState(false);

  // Note form
  const [noteText, setNoteText] = useState('');

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const [leadsRes, statsRes, repliesRes] = await Promise.all([
        fetch(`${API_BASE}/leads`),
        fetch(`${API_BASE}/leads/stats`),
        fetch(`${API_BASE}/pending-replies`),
      ]);
      const leadsData = await leadsRes.json();
      const statsData = await statsRes.json();
      const repliesData = await repliesRes.json();
      if (leadsData.success) setLeads(leadsData.data);
      if (statsData.success) setStats(statsData.data);
      if (repliesData.success) setPendingReplies(repliesData.data);
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPendingReplies = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/pending-replies`);
      const data = await res.json();
      if (data.success) setPendingReplies(data.data);
    } catch (err) {
      console.error('Failed to fetch pending replies:', err);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Close stage legend on outside click
  useEffect(() => {
    if (!showStageLegend) return;
    const handler = (e: MouseEvent) => {
      if (legendRef.current && !legendRef.current.contains(e.target as Node)) {
        setShowStageLegend(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showStageLegend]);

  // SSE: real-time updates from server
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/events`);

    eventSource.addEventListener('lead_updated', () => {
      fetchLeads();
    });
    eventSource.addEventListener('reply_created', () => {
      fetchPendingReplies();
    });
    eventSource.addEventListener('reply_sent', () => {
      fetchPendingReplies();
      fetchLeads();
    });

    eventSource.onerror = () => {
      // SSE will auto-reconnect
    };

    return () => eventSource.close();
  }, [fetchLeads, fetchPendingReplies]);

  // Fallback poll pending replies every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchPendingReplies, 15000);
    return () => clearInterval(interval);
  }, [fetchPendingReplies]);

  // Tick for countdown timers
  const [, setTick] = useState(0);
  useEffect(() => {
    if (pendingReplies.length === 0) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [pendingReplies.length]);

  // Pending reply actions
  const sendReplyNow = async (replyId: number) => {
    try {
      await fetch(`${API_BASE}/pending-replies/${replyId}/send-now`, { method: 'POST' });
      fetchPendingReplies();
      fetchLeads();
    } catch (err) {
      console.error('Failed to send reply:', err);
    }
  };

  const cancelReplyAction = async (replyId: number) => {
    try {
      await fetch(`${API_BASE}/pending-replies/${replyId}/cancel`, { method: 'POST' });
      fetchPendingReplies();
    } catch (err) {
      console.error('Failed to cancel reply:', err);
    }
  };

  const saveEditedReply = async (replyId: number) => {
    if (!editingReplyText.trim()) return;
    try {
      await fetch(`${API_BASE}/pending-replies/${replyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_text: editingReplyText }),
      });
      setEditingReplyId(null);
      setEditingReplyText('');
      fetchPendingReplies();
    } catch (err) {
      console.error('Failed to edit reply:', err);
    }
  };

  // Analysis modal data: hierarchical grouping
  const analysisData = useMemo(() => {
    if (!showAnalysis) return [];
    const grouped: Record<string, { total: number; converted: number; sub: Record<string, { total: number; converted: number }> }> = {};
    for (const l of leads) {
      const primary = analysisHierarchy === 'city-activity' ? (l.city || 'Unknown') : (l.activity || 'Unknown');
      const secondary = analysisHierarchy === 'city-activity' ? (l.activity || 'Unknown') : (l.city || 'Unknown');
      if (!grouped[primary]) grouped[primary] = { total: 0, converted: 0, sub: {} };
      grouped[primary].total++;
      if (['CONVERTED', 'ONBOARDED'].includes(l.pipeline_stage)) grouped[primary].converted++;
      if (!grouped[primary].sub[secondary]) grouped[primary].sub[secondary] = { total: 0, converted: 0 };
      grouped[primary].sub[secondary].total++;
      if (['CONVERTED', 'ONBOARDED'].includes(l.pipeline_stage)) grouped[primary].sub[secondary].converted++;
    }
    return Object.entries(grouped)
      .map(([name, data]) => ({
        name,
        total: data.total,
        converted: data.converted,
        sub: Object.entries(data.sub)
          .map(([subName, subData]) => ({ name: subName, ...subData }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total);
  }, [leads, showAnalysis, analysisHierarchy]);

  // Call schedule grouped by date
  const [expandedCallDate, setExpandedCallDate] = useState<string | null>(null);
  const callSchedule = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const removedFromSchedule = new Set(['CALL_DONE', 'CONVERTED', 'NOT_INTERESTED', 'ONBOARDED']);
    const scheduled = leads.filter(l => {
      if (!l.call_scheduled_at) return false;
      if (removedFromSchedule.has(l.pipeline_stage)) return false;
      return new Date(l.call_scheduled_at) >= today;
    }).sort((a, b) => new Date(a.call_scheduled_at!).getTime() - new Date(b.call_scheduled_at!).getTime());

    const grouped: Record<string, Lead[]> = {};
    for (const lead of scheduled) {
      const dateKey = new Date(lead.call_scheduled_at!).toLocaleDateString('en-IN', { dateStyle: 'medium' });
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(lead);
    }
    return grouped;
  }, [leads]);

  const callDateLabel = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayFormatted = today.toLocaleDateString('en-IN', { dateStyle: 'medium' });
    const tomorrowFormatted = tomorrow.toLocaleDateString('en-IN', { dateStyle: 'medium' });
    if (dateStr === todayFormatted) return `Today — ${dateStr}`;
    if (dateStr === tomorrowFormatted) return `Tomorrow — ${dateStr}`;
    return dateStr;
  };

  // Unique cities and activities from data
  const cities = useMemo(() => {
    const unique = [...new Set(leads.map(l => l.city).filter(Boolean))] as string[];
    return unique.sort();
  }, [leads]);

  const activities = useMemo(() => {
    const unique = [...new Set(leads.map(l => l.activity).filter(Boolean))] as string[];
    return unique.sort();
  }, [leads]);

  const assignees = useMemo(() => {
    const unique = new Set(leads.map(l => l.assigned_to).filter(Boolean) as string[]);
    unique.add('Soumya');
    return [...unique].sort();
  }, [leads]);

  // Filtered leads
  const STAGE_ORDER: Record<string, number> = {
    NOT_CONTACTED: 0, FOLLOWED: 1, DM_SENT: 2, IN_CONVERSATION: 3,
    CALL_SCHEDULED: 4, CALL_DONE: 5, CONVERTED: 6, ONBOARDED: 7,
    NOT_INTERESTED: 8, GHOSTED: 9,
  };

  const filteredLeads = useMemo(() => {
    const filtered = leads.filter(lead => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches = [lead.name, lead.instagram_handle, lead.leader_name, lead.city, lead.area]
          .filter(Boolean)
          .some(f => f!.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (cityFilter && (lead.city || '') !== cityFilter) return false;
      if (stageFilter && lead.pipeline_stage !== stageFilter) return false;
      if (activityFilter && (lead.activity || '') !== activityFilter) return false;
      if (assigneeFilter && (lead.assigned_to || '') !== assigneeFilter) return false;
      if (!showGhosted && lead.pipeline_stage === 'GHOSTED') return false;
      if (!showNotInterested && lead.pipeline_stage === 'NOT_INTERESTED') return false;
      if (showFlaggedOnly && !lead.flag && !lead.manual_mode) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'pipeline_stage') {
        cmp = (STAGE_ORDER[a.pipeline_stage] ?? 99) - (STAGE_ORDER[b.pipeline_stage] ?? 99);
      } else if (sortField === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '');
      } else if (sortField === 'city') {
        cmp = (a.city || '').localeCompare(b.city || '');
      } else if (sortField === 'last_activity_at') {
        cmp = new Date(a.last_activity_at || 0).getTime() - new Date(b.last_activity_at || 0).getTime();
      } else if (sortField === 'lead_quality') {
        cmp = (a.lead_quality || '').localeCompare(b.lead_quality || '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [leads, searchQuery, cityFilter, stageFilter, activityFilter, assigneeFilter, showGhosted, showNotInterested, showFlaggedOnly, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // CSV Upload
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/leads/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      setUploadResult(data.data || data);
      fetchLeads();
    } catch (err) {
      setUploadResult({ error: 'Upload failed' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Update lead
  const updateLead = async (id: number, updates: any) => {
    try {
      // Auto-assign Soumya for converted leads
      if (updates.pipeline_stage === 'CONVERTED') {
        updates = { ...updates, assigned_to: 'Soumya' };
      }
      const res = await fetch(`${API_BASE}/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        setLeads(prev => prev.map(l => l.id === id ? data.data : l));
        const statsRes = await fetch(`${API_BASE}/leads/stats`);
        const statsData = await statsRes.json();
        if (statsData.success) setStats(statsData.data);
      }
    } catch (err) {
      console.error('Failed to update lead:', err);
    }
  };

  // Add note
  const addNote = async (leadId: number) => {
    if (!noteText.trim()) return;
    await updateLead(leadId, { note: noteText.trim() });
    setNoteText('');
  };

  // Add lead
  const handleAddLead = async () => {
    if (!addLeadForm.name.trim()) {
      setAddLeadError('Name is required');
      return;
    }
    setAddLeadSaving(true);
    setAddLeadError('');
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addLeadForm.name.trim(),
          instagram_handle: addLeadForm.instagram_handle.trim() || undefined,
          city: addLeadForm.city.trim() || undefined,
          leader_name: addLeadForm.leader_name.trim() || undefined,
          whatsapp_number: addLeadForm.whatsapp_number.trim() || undefined,
          activity: addLeadForm.activity.trim() || undefined,
          area: addLeadForm.area.trim() || undefined,
        }),
      });
      const data: any = await res.json();
      if (!res.ok || !data.success) {
        setAddLeadError(data.error || 'Failed to add lead');
        return;
      }
      setShowAddLead(false);
      setAddLeadForm({ name: '', instagram_handle: '', city: '', leader_name: '', whatsapp_number: '', activity: '', area: '' });
      fetchLeads();
    } catch (err) {
      setAddLeadError('Failed to add lead');
    } finally {
      setAddLeadSaving(false);
    }
  };

  const getStageCount = (stage: string) => {
    if (!stats) return 0;
    const found = stats.by_stage.find(s => s.pipeline_stage === stage);
    return found?.count || 0;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[1500px] mx-auto px-6 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Shark Tank Outreach CRM</h1>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv"
              onChange={handleUpload}
              className="hidden"
            />
            <button
              onClick={() => { setShowAddLead(true); setAddLeadError(''); }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Plus size={16} />
              Add Lead
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Upload size={16} />
              {uploading ? 'Uploading...' : 'Upload CSV'}
            </button>
            <button
              onClick={fetchLeads}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Analysis Modal */}
      {showAnalysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowAnalysis(false); setExpandedAnalysisRows(new Set()); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Analysis</h3>
              <div className="flex items-center gap-2">
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => { setAnalysisHierarchy('city-activity'); setExpandedAnalysisRows(new Set()); }}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${analysisHierarchy === 'city-activity' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    City → Activity
                  </button>
                  <button
                    onClick={() => { setAnalysisHierarchy('activity-city'); setExpandedAnalysisRows(new Set()); }}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${analysisHierarchy === 'activity-city' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Activity → City
                  </button>
                </div>
                <button onClick={() => { setShowAnalysis(false); setExpandedAnalysisRows(new Set()); }} className="text-gray-400 hover:text-gray-600 ml-2">
                  <X size={20} />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="px-6 py-4 overflow-y-auto flex-1">
              {analysisData.length === 0 ? (
                <p className="text-sm text-gray-500">No data found.</p>
              ) : (
                <div className="space-y-1">
                  {analysisData.map((row) => {
                    const isExpanded = expandedAnalysisRows.has(row.name);
                    return (
                      <div key={row.name}>
                        <button
                          onClick={() => {
                            setExpandedAnalysisRows(prev => {
                              const next = new Set(prev);
                              if (next.has(row.name)) next.delete(row.name);
                              else next.add(row.name);
                              return next;
                            });
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
                        >
                          <ChevronRight size={14} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          <span
                            className="font-medium text-gray-900 flex-1 hover:text-teal-700 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (analysisHierarchy === 'city-activity') {
                                setCityFilter(row.name === 'Unknown' ? '' : row.name);
                              } else {
                                setActivityFilter(row.name === 'Unknown' ? '' : row.name);
                              }
                              setShowAnalysis(false);
                              setExpandedAnalysisRows(new Set());
                            }}
                          >{row.name}</span>
                          <span className="text-sm text-gray-600 tabular-nums w-16 text-right">{row.total} leads</span>
                          <span className={`text-sm tabular-nums w-20 text-right font-medium ${row.converted > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{row.converted} conv</span>
                        </button>
                        {isExpanded && (
                          <div className="ml-8 mr-3 mb-2 border border-gray-100 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                  <th className="py-1.5 px-3 text-left text-xs font-medium text-gray-500">{analysisHierarchy === 'city-activity' ? 'Activity' : 'City'}</th>
                                  <th className="py-1.5 px-3 text-right text-xs font-medium text-gray-500">Leads</th>
                                  <th className="py-1.5 px-3 text-right text-xs font-medium text-gray-500">Converted</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.sub.map((s) => (
                                  <tr key={s.name} className="border-b border-gray-50">
                                    <td
                                      className="py-1.5 px-3 text-gray-700 hover:text-teal-700 hover:underline cursor-pointer"
                                      onClick={() => {
                                        if (analysisHierarchy === 'city-activity') {
                                          setActivityFilter(s.name === 'Unknown' ? '' : s.name);
                                        } else {
                                          setCityFilter(s.name === 'Unknown' ? '' : s.name);
                                        }
                                        setShowAnalysis(false);
                                        setExpandedAnalysisRows(new Set());
                                      }}
                                    >{s.name}</td>
                                    <td className="py-1.5 px-3 text-right text-gray-700 tabular-nums">{s.total}</td>
                                    <td className="py-1.5 px-3 text-right tabular-nums">
                                      <span className={s.converted > 0 ? 'text-emerald-600 font-medium' : 'text-gray-400'}>{s.converted}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between text-sm font-semibold shrink-0">
              <span className="text-gray-900">Total</span>
              <div className="flex gap-6">
                <span className="text-gray-900 tabular-nums">{analysisData.reduce((s, r) => s + r.total, 0)} leads</span>
                <span className="text-emerald-600 tabular-nums">{analysisData.reduce((s, r) => s + r.converted, 0)} converted</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {showAddLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddLead(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Add Lead</h2>
              <button onClick={() => setShowAddLead(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {addLeadError && (
              <div className="mb-4 px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg">{addLeadError}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                <input
                  type="text"
                  value={addLeadForm.name}
                  onChange={(e) => setAddLeadForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Community / lead name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Instagram Handle</label>
                <input
                  type="text"
                  value={addLeadForm.instagram_handle}
                  onChange={(e) => setAddLeadForm(f => ({ ...f, instagram_handle: e.target.value }))}
                  placeholder="@handle or URL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                  <input
                    type="text"
                    value={addLeadForm.city}
                    onChange={(e) => setAddLeadForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Mumbai, Delhi..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Area</label>
                  <input
                    type="text"
                    value={addLeadForm.area}
                    onChange={(e) => setAddLeadForm(f => ({ ...f, area: e.target.value }))}
                    placeholder="Bandra, Connaught..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Leader Name</label>
                  <input
                    type="text"
                    value={addLeadForm.leader_name}
                    onChange={(e) => setAddLeadForm(f => ({ ...f, leader_name: e.target.value }))}
                    placeholder="Club leader"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Contact Number</label>
                  <input
                    type="text"
                    value={addLeadForm.whatsapp_number}
                    onChange={(e) => setAddLeadForm(f => ({ ...f, whatsapp_number: e.target.value }))}
                    placeholder="+91 98765..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Activity</label>
                <input
                  type="text"
                  value={addLeadForm.activity}
                  onChange={(e) => setAddLeadForm(f => ({ ...f, activity: e.target.value }))}
                  placeholder="Running, Yoga, Cycling..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowAddLead(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLead}
                disabled={addLeadSaving}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {addLeadSaving ? 'Adding...' : 'Add Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1500px] mx-auto px-6 py-6 space-y-6">
        {/* Upload result banner */}
        {uploadResult && (
          <div className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm ${uploadResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            <span>
              {uploadResult.error
                ? uploadResult.error
                : `Imported ${uploadResult.imported} leads, skipped ${uploadResult.skipped} duplicates (${uploadResult.total} total rows)`
              }
            </span>
            <button onClick={() => setUploadResult(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Call Schedule Section */}
        <div>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
              Call Schedule ({Object.values(callSchedule).flat().length})
            </h2>
            {Object.keys(callSchedule).length === 0 && (
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-6 text-center text-sm text-gray-400">
                No calls scheduled yet
              </div>
            )}
            <div className="space-y-2">
              {Object.entries(callSchedule).map(([dateStr, calls]) => {
                const overlaps: string[] = [];
                for (let i = 0; i < calls.length; i++) {
                  for (let j = i + 1; j < calls.length; j++) {
                    const t1 = new Date(calls[i].call_scheduled_at!).getTime();
                    const t2 = new Date(calls[j].call_scheduled_at!).getTime();
                    if (Math.abs(t1 - t2) < 30 * 60 * 1000) {
                      overlaps.push(`${calls[i].name} & ${calls[j].name}`);
                    }
                  }
                }
                return (
                <div key={dateStr} className={`bg-white border rounded-xl overflow-hidden shadow-sm ${overlaps.length > 0 ? 'border-red-200' : 'border-purple-100'}`}>
                  <button
                    onClick={() => setExpandedCallDate(expandedCallDate === dateStr ? null : dateStr)}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-purple-50/50 transition-colors"
                  >
                    <Calendar size={16} className="text-purple-600" />
                    <span className="text-sm font-semibold text-gray-800">{callDateLabel(dateStr)}</span>
                    <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                      {calls.length} {calls.length === 1 ? 'call' : 'calls'}
                    </span>
                    {overlaps.length > 0 && (
                      <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        <AlertTriangle size={12} /> Overlap
                      </span>
                    )}
                    <div className="ml-auto">
                      {expandedCallDate === dateStr ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                  </button>
                  {expandedCallDate === dateStr && (
                    <div className="border-t border-purple-100 px-4 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {calls.map(lead => (
                        <div key={lead.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{lead.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {lead.instagram_handle && (
                                  <span className="text-xs text-teal-600">@{lead.instagram_handle}</span>
                                )}
                                {lead.city && (
                                  <span className="text-xs text-gray-400">{lead.city}</span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-1 rounded-md">
                              {new Date(lead.call_scheduled_at!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                          </div>
                          <div className="space-y-1.5 mt-3 text-sm">
                            {lead.leader_name && (
                              <div className="flex justify-between">
                                <span className="text-gray-500">Leader</span>
                                <span className="text-gray-900">{lead.leader_name}</span>
                              </div>
                            )}
                            {lead.whatsapp_number && (
                              <div className="flex justify-between">
                                <span className="text-gray-500">Contact</span>
                                <span className="text-gray-900">{lead.whatsapp_number}</span>
                              </div>
                            )}
                            {lead.activity && (
                              <div className="flex justify-between">
                                <span className="text-gray-500">Activity</span>
                                <span className="text-gray-900">{lead.activity}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                            {lead.call_link && (
                              <a
                                href={lead.call_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
                              >
                                <Phone size={12} /> Join Call
                              </a>
                            )}
                            <button
                              onClick={() => setExpandedId(lead.id)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <Eye size={12} /> View Lead
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
        </div>

        {/* Pending Replies Section */}
        {pendingReplies.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Pending Replies ({pendingReplies.length})
              </h2>
              <button
                onClick={() => setHidePending(!hidePending)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                {hidePending ? 'Show' : 'Hide'}
              </button>
            </div>
            {!hidePending && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {pendingReplies.map(reply => {
                  const isEditing = editingReplyId === reply.id;
                  const sendAt = new Date(reply.send_at);
                  const now = Date.now();
                  const remainMs = sendAt.getTime() - now;
                  const remainSecs = Math.max(0, Math.floor(remainMs / 1000));
                  const mins = Math.floor(remainSecs / 60);
                  const secs = remainSecs % 60;
                  const countdown = remainSecs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : 'Sending...';
                  const urgency = remainSecs < 15 ? 'text-red-600' : remainSecs < 30 ? 'text-amber-600' : 'text-gray-500';

                  return (
                    <div key={reply.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{reply.lead_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {reply.instagram_handle && (
                              <span className="text-xs text-teal-600">@{reply.instagram_handle}</span>
                            )}
                            {reply.city && (
                              <span className="text-xs text-gray-400">{reply.city}</span>
                            )}
                          </div>
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-mono font-semibold ${urgency}`}>
                          <Clock size={12} />
                          {countdown}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={editingReplyText}
                            onChange={(e) => setEditingReplyText(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEditedReply(reply.id)}
                              className="flex-1 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingReplyId(null); setEditingReplyText(''); }}
                              className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-gray-600 line-clamp-3 mt-1 leading-relaxed">
                            "{reply.reply_text}"
                          </p>
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                            <button
                              onClick={() => { setEditingReplyId(reply.id); setEditingReplyText(reply.reply_text); }}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                            >
                              <Edit3 size={12} /> Edit
                            </button>
                            <button
                              onClick={() => sendReplyNow(reply.id)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded-md transition-colors font-medium"
                            >
                              <ChevronRight size={12} /> Send Now
                            </button>
                            <button
                              onClick={() => cancelReplyAction(reply.id)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors ml-auto"
                            >
                              <XCircle size={12} /> Cancel
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Pipeline Summary Tiles */}
        {stats && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Pipeline Summary</h2>
              <span className="text-sm font-semibold text-gray-700">
                Conv Rate: {stats.conversion_rate}%
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-2">
              {PIPELINE_STAGES.map(stage => {
                const config = STAGE_CONFIG[stage];
                const Icon = STAGE_ICONS[stage] || Users;
                const count = getStageCount(stage);
                return (
                  <div
                    key={stage}
                    className={`rounded-xl border border-gray-100 p-3 ${config.bgColor}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={14} className={config.textColor} />
                      <span className={`text-xs font-medium ${config.textColor} truncate`}>{config.label}</span>
                    </div>
                    <div className={`text-xl font-bold ${config.textColor}`}>{count}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3">
              <button
                onClick={() => setShowAnalysis(true)}
                className="cursor-pointer px-4 py-2.5 rounded-lg text-xs transition-all bg-white border border-gray-200 hover:border-teal-400 hover:shadow-md hover:-translate-y-0.5 group flex items-center gap-2"
              >
                <span className="font-semibold text-gray-800 group-hover:text-teal-700">Analysis</span>
                <ChevronRight size={12} className="text-gray-400 group-hover:text-teal-500 transition-colors" />
              </button>
            </div>
          </div>
        )}

        {/* Lead Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div ref={legendRef} className="flex items-center gap-1.5 relative">
                <span className="text-sm font-medium text-gray-700">
                  Leads ({filteredLeads.length})
                </span>
                <button
                  onClick={() => setShowStageLegend(!showStageLegend)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Stage legend"
                >
                  <Info size={14} />
                </button>
                {showStageLegend && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[200px]">
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Stage Legend</div>
                    <div className="space-y-1">
                      {PIPELINE_STAGES.map(s => {
                        const cfg = STAGE_CONFIG[s];
                        return (
                          <div key={s} className="flex items-center gap-2 text-xs">
                            <span className={`inline-flex items-center justify-center w-7 px-1 py-0.5 rounded font-semibold border ${cfg.badgeClass}`}>
                              {cfg.shortLabel}
                            </span>
                            <span className="text-gray-600">{cfg.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                    showFlaggedOnly
                      ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <AlertTriangle size={12} />
                  Flagged ({leads.filter(l => l.flag).length})
                </button>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGhosted}
                    onChange={(e) => setShowGhosted(e.target.checked)}
                    className="rounded"
                  />
                  Ghosted ({getStageCount('GHOSTED')})
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showNotInterested}
                    onChange={(e) => setShowNotInterested(e.target.checked)}
                    className="rounded"
                  />
                  Not Interested ({getStageCount('NOT_INTERESTED')})
                </label>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search name, handle, leader..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                )}
              </div>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
              >
                <option value="">All Stages</option>
                {PIPELINE_STAGES.map(s => (
                  <option key={s} value={s}>{STAGE_CONFIG[s]?.label || s}</option>
                ))}
              </select>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
              >
                <option value="">All Cities</option>
                {cities.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
              >
                <option value="">All Activities</option>
                {activities.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
              >
                <option value="">All Assignees</option>
                {assignees.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-8"></th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700" onClick={() => toggleSort('name')}>
                    <span className="inline-flex items-center gap-1">Name {sortField === 'name' && (sortDir === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>)}</span>
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700" onClick={() => toggleSort('city')}>
                    <span className="inline-flex items-center gap-1">City {sortField === 'city' && (sortDir === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>)}</span>
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Area</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Activity</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">IG Handle</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Leader</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Contact</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700" onClick={() => toggleSort('pipeline_stage')}>
                    <span className="inline-flex items-center gap-1">Stage {sortField === 'pipeline_stage' && (sortDir === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>)}</span>
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Flag</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700" onClick={() => toggleSort('last_activity_at')}>
                    <span className="inline-flex items-center gap-1">Last Activity {sortField === 'last_activity_at' && (sortDir === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>)}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map(lead => {
                  const isExpanded = expandedId === lead.id;
                  const stageConfig = STAGE_CONFIG[lead.pipeline_stage] || STAGE_CONFIG.NOT_CONTACTED;
                  const hasPendingReply = pendingReplies.some(r => r.lead_id === lead.id);

                  return (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      isExpanded={isExpanded}
                      stageConfig={stageConfig}
                      hasPendingReply={hasPendingReply}
                      onToggle={() => setExpandedId(isExpanded ? null : lead.id)}
                      onUpdate={updateLead}
                      noteText={isExpanded ? noteText : ''}
                      onNoteChange={setNoteText}
                      onAddNote={() => addNote(lead.id)}
                    />
                  );
                })}
                {filteredLeads.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-gray-400 text-sm">
                      {loading ? 'Loading...' : 'No leads found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Separate component for lead row + expanded detail
function LeadRow({
  lead, isExpanded, stageConfig, hasPendingReply, onToggle, onUpdate, noteText, onNoteChange, onAddNote
}: {
  lead: Lead;
  isExpanded: boolean;
  stageConfig: any;
  hasPendingReply: boolean;
  onToggle: () => void;
  onUpdate: (id: number, updates: any) => Promise<void>;
  noteText: string;
  onNoteChange: (text: string) => void;
  onAddNote: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-gray-100 cursor-pointer transition-colors ${
          isExpanded ? 'bg-teal-50/30' : 'hover:bg-gray-50/80'
        }`}
      >
        <td className="px-4 py-2.5 text-gray-400">
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-900">{lead.name}</span>
            {hasPendingReply && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700" title="Pending reply">
                <MessageCircle size={10} /> Reply
              </span>
            )}
            {lead.call_scheduled_at && lead.pipeline_stage === 'CALL_SCHEDULED' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700" title={`Call: ${new Date(lead.call_scheduled_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}`}>
                <Calendar size={10} /> Call
              </span>
            )}
            {lead.pipeline_stage === 'CONVERTED' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
                Converted
              </span>
            )}
            {lead.pipeline_stage === 'ONBOARDED' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                Live
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-600">{lead.city || '-'}</td>
        <td className="px-4 py-2.5 text-sm text-gray-600">{lead.area || '-'}</td>
        <td className="px-4 py-2.5 text-sm text-gray-600">{lead.activity || '-'}</td>
        <td className="px-4 py-2.5">
          {lead.instagram_handle ? (
            <a
              href={lead.instagram_url || `https://instagram.com/${lead.instagram_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-teal-600 hover:text-teal-700 hover:underline"
            >
              @{lead.instagram_handle}
            </a>
          ) : (
            <span className="text-sm text-gray-400">-</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-600">{lead.leader_name || '-'}</td>
        <td className="px-4 py-2.5 text-sm text-gray-600">{lead.whatsapp_number || '-'}</td>
        <td className="px-4 py-2.5">
          <select
            value={lead.pipeline_stage}
            onChange={(e) => { e.stopPropagation(); onUpdate(lead.id, { pipeline_stage: e.target.value }); }}
            onClick={(e) => e.stopPropagation()}
            className={`appearance-none cursor-pointer px-2 py-0.5 rounded-md text-xs font-semibold border ${stageConfig.badgeClass} focus:outline-none focus:ring-2 focus:ring-teal-500 pr-5 bg-[length:12px] bg-[right_4px_center] bg-no-repeat`}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")` }}
          >
            {PIPELINE_STAGES.map(s => (
              <option key={s} value={s}>{STAGE_CONFIG[s]?.label || s}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-2.5">
          {lead.flag === 'weird_message' && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle size={12} /> Weird
            </span>
          )}
          {lead.flag === 'vague_time' && (
            <span className="inline-flex items-center gap-1 text-xs text-orange-500">
              <Clock size={12} /> Vague
            </span>
          )}
          {lead.flag === 'needs_attention' && (
            <span className="inline-flex items-center gap-1 text-xs text-red-500">
              <AlertTriangle size={12} /> Attn
            </span>
          )}
          {!lead.flag && !lead.manual_mode && <span className="text-gray-300">-</span>}
          {lead.manual_mode && (
            <span className="inline-flex items-center gap-1 text-xs text-red-500 font-semibold">
              M
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(lead.last_activity_at)}</td>
      </tr>

      {/* Expanded Detail Row */}
      {isExpanded && (
        <tr>
          <td colSpan={12} className="px-4 py-0">
            <div className="bg-white border border-gray-200 rounded-lg my-2 p-5 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left: Lead Info + Stage */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Lead Info</h3>

                  <div>
                    <label className="text-xs text-gray-500">Stage</label>
                    <select
                      value={lead.pipeline_stage}
                      onChange={(e) => onUpdate(lead.id, { pipeline_stage: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      {PIPELINE_STAGES.map(s => (
                        <option key={s} value={s}>{STAGE_CONFIG[s]?.label || s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500">Flag</label>
                    <select
                      value={lead.flag || ''}
                      onChange={(e) => onUpdate(lead.id, { flag: e.target.value || null })}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">None</option>
                      <option value="weird_message">Weird Message</option>
                      <option value="vague_time">Vague Time</option>
                      <option value="needs_attention">Needs Attention</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                    <label className="text-xs text-gray-500">Automation</label>
                    <button
                      onClick={() => onUpdate(lead.id, { manual_mode: !lead.manual_mode })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${lead.manual_mode ? 'bg-gray-300' : 'bg-teal-500'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${lead.manual_mode ? 'translate-x-1' : 'translate-x-[18px]'}`} />
                    </button>
                    <span className={`text-xs font-medium ${lead.manual_mode ? 'text-red-500' : 'text-teal-600'}`}>
                      {lead.manual_mode ? 'OFF (Manual)' : 'ON'}
                    </span>
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    <label className="text-xs text-gray-500">Contact Number</label>
                    <input
                      type="text"
                      defaultValue={lead.whatsapp_number || ''}
                      placeholder="Add contact number..."
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== (lead.whatsapp_number || '')) {
                          onUpdate(lead.id, { whatsapp_number: val || null });
                        }
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    <label className="text-xs text-gray-500">Call Scheduled At</label>
                    <input
                      type="datetime-local"
                      defaultValue={lead.call_scheduled_at ? new Date(new Date(lead.call_scheduled_at).getTime() - new Date(lead.call_scheduled_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          onUpdate(lead.id, { call_scheduled_at: new Date(e.target.value).toISOString() });
                        }
                      }}
                      className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div className="space-y-2 text-sm">
                    {lead.instagram_handle && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Instagram</span>
                        <a href={lead.instagram_url || '#'} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                          @{lead.instagram_handle}
                        </a>
                      </div>
                    )}
                    {lead.leader_name && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Leader</span>
                        <span className="text-gray-900">{lead.leader_name}</span>
                      </div>
                    )}
                    {lead.activity && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Activity</span>
                        <span className="text-gray-900">{lead.activity}</span>
                      </div>
                    )}
                    {lead.venue && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Venue</span>
                        <span className="text-gray-900">{lead.venue}</span>
                      </div>
                    )}
                    {lead.days && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Days</span>
                        <span className="text-gray-900">{lead.days}</span>
                      </div>
                    )}
                    {lead.timings && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Timings</span>
                        <span className="text-gray-900">{lead.timings}</span>
                      </div>
                    )}
                    {lead.followers && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Followers</span>
                        <span className="text-gray-900">{lead.followers.toLocaleString()}</span>
                      </div>
                    )}
                    {lead.type && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Type</span>
                        <span className="text-gray-900">{lead.type}</span>
                      </div>
                    )}
                    {lead.lead_quality && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Quality</span>
                        <span className="text-gray-900">{lead.lead_quality}</span>
                      </div>
                    )}
                  </div>

                  {(lead.call_scheduled_at || lead.call_link || lead.missive_conversation_id) && (
                    <div className="pt-3 border-t border-gray-200 space-y-2">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase">Call Info</h4>
                      {lead.call_scheduled_at && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Scheduled</span>
                          <span className="text-gray-900">
                            {new Date(lead.call_scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                      )}
                      {lead.call_link && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Meet</span>
                          <a href={lead.call_link} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                            Open Google Meet
                          </a>
                        </div>
                      )}
                      {lead.missive_conversation_id && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Missive</span>
                          <a href={`https://mail.missiveapp.com/#/conversations/${lead.missive_conversation_id}`} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                            Open Conversation
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Middle: Notes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Notes</h3>
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      placeholder="Add a note..."
                      value={noteText}
                      onChange={(e) => onNoteChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onAddNote()}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                      onClick={onAddNote}
                      className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {(lead.notes || []).slice().reverse().map((note: any, idx: number) => (
                      <div key={idx} className="bg-gray-50 rounded-lg p-3 text-sm">
                        <p className="text-gray-800">{note.text}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(note.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          {note.created_by && note.created_by !== 'user' ? ` — ${note.created_by}` : ''}
                        </p>
                      </div>
                    ))}
                    {(!lead.notes || lead.notes.length === 0) && (
                      <p className="text-sm text-gray-400 italic">No notes yet</p>
                    )}
                  </div>
                </div>

                {/* Right: Activity Log */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Activity Log</h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {(lead.activity_log || []).slice().reverse().map((entry: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0"></div>
                        <div>
                          <span className="text-gray-700">
                            {entry.action === 'stage_change' && (
                              <>
                                <span className="font-medium">{STAGE_CONFIG[entry.new_value]?.label || entry.new_value}</span>
                                {' \u2190 '}
                                <span className="text-gray-400">{STAGE_CONFIG[entry.old_value]?.label || entry.old_value}</span>
                              </>
                            )}
                            {entry.action === 'flag_change' && (
                              <>Flag: {entry.new_value}</>
                            )}
                            {entry.action === 'reschedule' && 'Rescheduled'}
                            {entry.action === 'created' && 'Created'}
                          </span>
                          <p className="text-xs text-gray-400">
                            {new Date(entry.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          </p>
                        </div>
                      </div>
                    ))}
                    {(!lead.activity_log || lead.activity_log.length === 0) && (
                      <p className="text-sm text-gray-400 italic">No activity yet</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
