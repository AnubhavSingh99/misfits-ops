import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  RefreshCw, Search, ChevronDown, ChevronUp, ChevronRight,
  CheckCircle, Calendar, Phone, PhoneCall,
  FileText, Archive, Upload,
  ClipboardList, AlertTriangle, Home, UserX, User, UserPlus, Video,
  BarChart3, TrendingUp, Clock, XCircle, PauseCircle,
  Settings, Plus, Trash2, X, RotateCcw, Loader2, HelpCircle
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/start-club`
  : '/api/start-club';

// Status configuration (3-layer: Journey / Evaluation / Outcome)
const STATUS_CONFIG: Record<string, { label: string; shortLabel: string; badgeClass: string }> = {
  // Layer 1: Journey
  ACTIVE: { label: 'Active', shortLabel: 'AC', badgeClass: 'bg-blue-50 text-blue-600 border-blue-200' },
  ABANDONED: { label: 'Abandoned', shortLabel: 'AB', badgeClass: 'bg-orange-50 text-orange-600 border-orange-200' },
  NOT_INTERESTED: { label: 'Not Interested', shortLabel: 'NI', badgeClass: 'bg-red-50 text-red-600 border-red-200' },
  // Layer 2: Evaluation
  SUBMITTED: { label: 'Submitted', shortLabel: 'SM', badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  UNDER_REVIEW: { label: 'Under Review', shortLabel: 'UR', badgeClass: 'bg-amber-50 text-amber-600 border-amber-200' },
  ON_HOLD: { label: 'On Hold', shortLabel: 'OH', badgeClass: 'bg-violet-50 text-violet-600 border-violet-200' },
  INTERVIEW_PENDING: { label: 'Interview Pending', shortLabel: 'IP', badgeClass: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  INTERVIEW_SCHEDULED: { label: 'Interview Scheduled', shortLabel: 'IS', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  INTERVIEW_DONE: { label: 'Interview Done', shortLabel: 'ID', badgeClass: 'bg-purple-50 text-purple-600 border-purple-200' },
  // Layer 3: Outcome
  SELECTED: { label: 'Selected', shortLabel: 'SL', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
  CLUB_CREATED: { label: 'Club Created', shortLabel: 'CC', badgeClass: 'bg-green-50 text-green-600 border-green-200' },
  REJECTED: { label: 'Rejected', shortLabel: 'RJ', badgeClass: 'bg-red-50 text-red-600 border-red-200' },
};

// 5 section tabs (3-layer model)
const SECTIONS = [
  { id: 'followup', label: 'Follow Up', icon: PhoneCall, statuses: ['ACTIVE', 'ABANDONED'] },
  { id: 'submitted', label: 'Submitted', icon: ClipboardList, statuses: ['SUBMITTED', 'UNDER_REVIEW'] },
  { id: 'interview', label: 'Interview Phase', icon: Calendar, statuses: ['INTERVIEW_PENDING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE'] },
  { id: 'selected', label: 'Selected', icon: CheckCircle, statuses: ['SELECTED', 'CLUB_CREATED'] },
  { id: 'dropped', label: 'Dropped', icon: UserX, statuses: ['NOT_INTERESTED', 'ON_HOLD', 'REJECTED'] },
];

// Subsections per tab for structured hierarchy display
type SubsectionConfig = {
  id: string; label: string; borderClass: string; bgClass: string; headerClass: string; countClass: string;
  filter: (app: Application) => boolean;
  isGroup?: boolean;    // Group header (not a leaf subsection with its own leads)
  parentGroup?: string; // Indent under this group header
};

const SECTION_SUBSECTIONS: Record<string, SubsectionConfig[]> = {
  followup: [
    { id: 'active', label: 'Active (In Progress)', borderClass: 'border-l-blue-400', bgClass: 'bg-blue-50/60', headerClass: 'text-blue-700', countClass: 'bg-blue-100 text-blue-700',
      filter: (app: Application) => app.status === 'ACTIVE' },
    { id: 'screening', label: 'Screening', borderClass: 'border-l-red-400', bgClass: 'bg-red-50/60', headerClass: 'text-red-700', countClass: 'bg-red-100 text-red-700',
      filter: (app: Application) => app.status === 'ABANDONED' && app.last_screen === 'questionnaire' },
    { id: 'activity', label: 'Activity', borderClass: 'border-l-orange-400', bgClass: 'bg-orange-50/60', headerClass: 'text-orange-700', countClass: 'bg-orange-100 text-orange-700',
      filter: (app: Application) => app.status === 'ABANDONED' && app.last_screen === 'city_activity' },
    { id: 'basics', label: 'Basics', borderClass: 'border-l-amber-400', bgClass: 'bg-amber-50/60', headerClass: 'text-amber-700', countClass: 'bg-amber-100 text-amber-700',
      filter: (app: Application) => app.status === 'ABANDONED' && app.last_screen === 'name' },
    { id: 'login', label: 'Login', borderClass: 'border-l-slate-400', bgClass: 'bg-slate-50/60', headerClass: 'text-slate-600', countClass: 'bg-slate-100 text-slate-600',
      filter: (app: Application) => app.status === 'ABANDONED' && ['login', 'otp'].includes(app.last_screen || '') },
    { id: 'story', label: 'Story', borderClass: 'border-l-slate-300', bgClass: 'bg-slate-50/40', headerClass: 'text-slate-500', countClass: 'bg-slate-50 text-slate-500',
      filter: (app: Application) => app.status === 'ABANDONED' && (app.last_screen === 'story' || app.last_screen === 'awareness' || !app.last_screen) },
  ],
  submitted: [
    { id: 'new', label: 'New', borderClass: 'border-l-emerald-400', bgClass: 'bg-emerald-50/60', headerClass: 'text-emerald-700', countClass: 'bg-emerald-100 text-emerald-700',
      filter: (app: Application) => app.status === 'SUBMITTED' },
    { id: 'under_review', label: 'Under Review', borderClass: 'border-l-amber-400', bgClass: 'bg-amber-50/60', headerClass: 'text-amber-700', countClass: 'bg-amber-100 text-amber-700',
      filter: (app: Application) => app.status === 'UNDER_REVIEW' },
  ],
  interview: [
    { id: 'pending', label: 'Pending Schedule', borderClass: 'border-l-indigo-300', bgClass: 'bg-indigo-50/40', headerClass: 'text-indigo-600', countClass: 'bg-indigo-100 text-indigo-600',
      filter: (app: Application) => app.status === 'INTERVIEW_PENDING' },
    { id: 'scheduled', label: 'Scheduled', borderClass: 'border-l-indigo-400', bgClass: 'bg-indigo-50/60', headerClass: 'text-indigo-700', countClass: 'bg-indigo-100 text-indigo-700',
      filter: (app: Application) => app.status === 'INTERVIEW_SCHEDULED' },
    { id: 'done', label: 'Done', borderClass: 'border-l-indigo-500', bgClass: 'bg-indigo-50/80', headerClass: 'text-indigo-800', countClass: 'bg-indigo-200 text-indigo-800',
      filter: (app: Application) => app.status === 'INTERVIEW_DONE' },
  ],
  selected: [
    { id: 'selected', label: 'Selected', borderClass: 'border-l-purple-400', bgClass: 'bg-purple-50/60', headerClass: 'text-purple-700', countClass: 'bg-purple-100 text-purple-700',
      filter: (app: Application) => app.status === 'SELECTED' },
    { id: 'onboarded', label: 'Onboarded', borderClass: 'border-l-green-500', bgClass: 'bg-green-50/40', headerClass: 'text-green-800', countClass: 'bg-green-100 text-green-800', isGroup: true,
      filter: (app: Application) => app.status === 'CLUB_CREATED' },
    { id: 'onboarded_incomplete', label: 'Incomplete', borderClass: 'border-l-amber-400', bgClass: 'bg-amber-50/60', headerClass: 'text-amber-700', countClass: 'bg-amber-100 text-amber-700', parentGroup: 'onboarded',
      filter: (app: Application) => app.status === 'CLUB_CREATED' && !app.contract_url },
    { id: 'onboarded_complete', label: 'Complete', borderClass: 'border-l-green-400', bgClass: 'bg-green-50/60', headerClass: 'text-green-700', countClass: 'bg-green-100 text-green-700', parentGroup: 'onboarded',
      filter: (app: Application) => app.status === 'CLUB_CREATED' && !!app.contract_url },
  ],
  dropped: [
    { id: 'not_interested', label: 'Not Interested', borderClass: 'border-l-slate-400', bgClass: 'bg-slate-50/60', headerClass: 'text-slate-600', countClass: 'bg-slate-100 text-slate-600',
      filter: (app: Application) => app.status === 'NOT_INTERESTED' },
    { id: 'on_hold', label: 'On Hold', borderClass: 'border-l-violet-400', bgClass: 'bg-violet-50/60', headerClass: 'text-violet-700', countClass: 'bg-violet-100 text-violet-700',
      filter: (app: Application) => app.status === 'ON_HOLD' },
    { id: 'rejected_screening', label: 'Rejected (Screening)', borderClass: 'border-l-red-400', bgClass: 'bg-red-50/60', headerClass: 'text-red-700', countClass: 'bg-red-100 text-red-700',
      filter: (app: Application) => app.status === 'REJECTED' && ['SUBMITTED', 'UNDER_REVIEW', 'ON_HOLD'].includes(app.rejected_from_status || '') },
    { id: 'rejected_interview', label: 'Rejected (Interview)', borderClass: 'border-l-orange-400', bgClass: 'bg-orange-50/60', headerClass: 'text-orange-700', countClass: 'bg-orange-100 text-orange-700',
      filter: (app: Application) => app.status === 'REJECTED' && app.rejected_from_status === 'INTERVIEW_DONE' },
    { id: 'rejected_other', label: 'Rejected (Other)', borderClass: 'border-l-red-300', bgClass: 'bg-red-50/30', headerClass: 'text-red-500', countClass: 'bg-red-50 text-red-500',
      filter: (app: Application) => app.status === 'REJECTED' && !app.rejected_from_status },
  ],
};

// Mapping from subsection → statuses (for linked filter behavior)
const SUBSECTION_TO_STATUSES: Record<string, Record<string, string[]>> = {
  followup: { active: ['ACTIVE'], screening: ['ABANDONED'], activity: ['ABANDONED'], basics: ['ABANDONED'], login: ['ABANDONED'], story: ['ABANDONED'] },
  submitted: { new: ['SUBMITTED'], under_review: ['UNDER_REVIEW'] },
  interview: { pending: ['INTERVIEW_PENDING'], scheduled: ['INTERVIEW_SCHEDULED'], done: ['INTERVIEW_DONE'] },
  selected: { selected: ['SELECTED'], onboarded: ['CLUB_CREATED'], onboarded_incomplete: ['CLUB_CREATED'], onboarded_complete: ['CLUB_CREATED'] },
  dropped: { not_interested: ['NOT_INTERESTED'], on_hold: ['ON_HOLD'], rejected_screening: ['REJECTED'], rejected_interview: ['REJECTED'], rejected_other: ['REJECTED'] },
};

// Reverse lookup: status → subsection (returns null if ambiguous)
function getSubsectionForStatus(sectionId: string, status: string): string | null {
  const mapping = SUBSECTION_TO_STATUSES[sectionId];
  if (!mapping) return null;
  const matches = Object.entries(mapping).filter(([, statuses]) => statuses.includes(status));
  return matches.length === 1 ? matches[0][0] : null;
}

const REJECTION_REASONS = [
  { value: 'insufficient_experience', label: 'Insufficient experience with the activity' },
  { value: 'low_commitment', label: 'Low time commitment or availability' },
  { value: 'unclear_motivation', label: 'Unclear motivation or objective' },
  { value: 'city_not_available', label: 'City not available for expansion' },
  { value: 'incomplete_responses', label: 'Incomplete or unclear responses' },
  { value: 'other', label: 'Other' },
];

interface RatingDimension {
  id: string;
  key: string;
  label: string;
  description: string;
  step: 'screening' | 'interview';
  sort_order: number;
}

interface Application {
  id: string;
  user_id: number | null;
  user_phone: string | null;
  name: string | null;
  status: string;
  exit_type: string | null;
  source: string;
  city: string | null;
  activity: string | null;
  awareness: string | null;
  archived: boolean;
  questionnaire_data: Record<string, any>;
  screening_ratings: Record<string, number> | null;
  interview_ratings: Record<string, number> | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  split_percentage: Record<string, number> | null;
  contract_url: string | null;
  contract_uploaded_at: string | null;
  signed_contract_url: string | null;
  signed_contract_uploaded_at: string | null;
  first_call_done: boolean;
  venue_sorted: boolean;
  marketing_launched: boolean;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  selected_at: string | null;
  club_created_at: string | null;
  rejected_from_status: string | null;
  last_screen: string | null;
  last_story_slide: number | null;
  last_question_index: number | null;
  last_question_section: string | null;
  total_questions: number | null;
  abandoned_at: string | null;
  toolkit_shared: boolean;
  admin_created: boolean;
  interview_scheduled_at: string | null;
  calendly_meet_link: string | null;
}

interface AnalyticsData {
  funnel: {
    total: number;
    submitted: number;
    under_review: number;
    interview_phase: number;
    selected: number;
    onboarded: number;
    rejected: number;
    on_hold: number;
    active_journey: number;
    abandoned: number;
    not_interested: number;
    dropped_early: number;
    rejected_screening: number;
    rejected_interview: number;
  };
  conversion: {
    submit_to_interview: number;
    interview_to_selected: number;
    selected_to_onboarded: number;
    overall: number;
  };
  tat: {
    submit_to_pick_hrs: string | null;
    pick_to_interview_hrs: string | null;
    interview_to_select_hrs: string | null;
    select_to_call_hrs: string | null;
    select_to_venue_hrs: string | null;
    select_to_launch_hrs: string | null;
    total_pipeline_hrs: string | null;
  };
  dropped_analysis: {
    rejection_reasons: { reason: string; count: number }[];
  };
}

interface DetailData extends Omit<Application, 'activity'> {
  activity: string | null;
  timeline: any[];
  activity_log: any[];
  past_applications: any[];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function computeDays(createdAt: string, clubCreatedAt: string | null): string {
  const start = new Date(createdAt);
  const end = clubCreatedAt ? new Date(clubCreatedAt) : new Date();
  const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
  return `${days}d`;
}

// ─── Rating Form Component ─────────────────────────────────────
function RatingForm({
  ratings,
  setRatings,
  label,
  dims,
}: {
  ratings: Record<string, number>;
  setRatings: (fn: (prev: Record<string, number>) => Record<string, number>) => void;
  label: string;
  dims: RatingDimension[];
}) {
  return (
    <div className="space-y-2.5">
      <h4 className="text-sm font-bold text-slate-700">{label}</h4>
      {dims.map(dim => (
        <div key={dim.key}>
          <div className="text-[11px] font-medium text-slate-500 mb-1">{dim.label}</div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setRatings(prev => ({ ...prev, [dim.key]: n }))}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                  ratings[dim.key] === n
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Rating Display Component ──────────────────────────────────
function RatingDisplay({ ratings, label, dims }: { ratings: Record<string, number>; label: string; dims?: RatingDimension[] }) {
  const dimKeys = new Set((dims || []).map(d => d.key));
  const extraKeys = Object.keys(ratings).filter(k => dims && !dimKeys.has(k));
  const maxScore = dims ? dims.length * 5 : Object.keys(ratings).length * 5;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</h4>
      {(dims || Object.keys(ratings).map(k => ({ key: k, label: k.replace(/_/g, ' ') }))).map(dim => {
        const val = ratings[dim.key] || 0;
        return (
          <div key={dim.key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-600">{dim.label}</span>
              <span className="text-xs font-bold text-slate-800">{val}/5</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="bg-indigo-500 rounded-full h-2 transition-all" style={{ width: `${(val / 5) * 100}%` }} />
            </div>
          </div>
        );
      })}
      {dims && extraKeys.map(key => {
        const val = ratings[key] || 0;
        return (
          <div key={key} className="opacity-50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-400">{key.replace(/_/g, ' ')}</span>
              <span className="text-xs font-bold text-slate-500">{val}/5</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="bg-slate-300 rounded-full h-2 transition-all" style={{ width: `${(val / 5) * 100}%` }} />
            </div>
          </div>
        );
      })}
      <div className="pt-2 border-t border-slate-100 text-sm font-bold text-slate-800">
        Total: {Object.values(ratings).reduce((a, b) => a + (b || 0), 0)}/{maxScore}
      </div>
    </div>
  );
}

// ─── Lead Row Component ─────────────────────────────────────────
function LeadRow({
  app, isExpanded, onToggle, sectionId,
  onRefresh, screeningDims, interviewDims,
  isSelected, onSelect,
}: {
  app: Application;
  isExpanded: boolean;
  onToggle: () => void;
  sectionId: string;
  onRefresh: () => void;
  screeningDims: RatingDimension[];
  interviewDims: RatingDimension[];
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
}) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'launch_details' | 'responses' | 'screening' | 'timeline' | 'notes'>(
    sectionId === 'selected' && (app.status === 'SELECTED' || app.status === 'CLUB_CREATED') ? 'launch_details' : 'responses'
  );

  // Screening ratings (pre-interview)
  const [screeningRatings, setScreeningRatings] = useState<Record<string, number>>({});
  // Interview ratings (post-interview)
  const [interviewRatings, setInterviewRatings] = useState<Record<string, number>>({});

  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  // Reviewer name (for pick flow)
  const [reviewerName, setReviewerName] = useState('');

  // Split percentage (configurable)
  const [splitMisfits, setSplitMisfits] = useState('70');
  const [splitLeader, setSplitLeader] = useState('30');

  // Notes
  const [noteText, setNoteText] = useState('');
  const [callDuration, setCallDuration] = useState('');
  const [callOutcome, setCallOutcome] = useState('connected');
  const [callNotes, setCallNotes] = useState('');

  // Fetch detail when expanded
  useEffect(() => {
    if (isExpanded && !detail) {
      setDetailLoading(true);
      fetch(`${API_BASE}/admin/${app.id}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setDetail(data.data);
            if (data.data.split_percentage) {
              setSplitMisfits(String(data.data.split_percentage.misfits || 70));
              setSplitLeader(String(data.data.split_percentage.leader || 30));
            }
          }
        })
        .catch(console.error)
        .finally(() => setDetailLoading(false));
    }
  }, [isExpanded, app.id, detail]);

  // Reset when collapsed
  useEffect(() => {
    if (!isExpanded) {
      setDetail(null);
      setScreeningRatings({});
      setInterviewRatings({});
      setRejectionReason('');
      setShowRejectForm(false);
      setReviewerName('');
      setSplitMisfits('70');
      setSplitLeader('30');
      setActiveTab(sectionId === 'selected' && (app.status === 'SELECTED' || app.status === 'CLUB_CREATED') ? 'launch_details' : 'responses');
    }
  }, [isExpanded]);

  const refetchDetail = () => {
    fetch(`${API_BASE}/admin/${app.id}`)
      .then(r => r.json())
      .then(data => { if (data.success) setDetail(data.data); })
      .catch(console.error);
  };

  // Review action (with screening ratings)
  const handleReview = async (action: string) => {
    const body: any = { action, ratings: screeningRatings };
    if (action === 'reject') body.rejection_reason = rejectionReason;
    const res = await fetch(`${API_BASE}/admin/${app.id}/review`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) { refetchDetail(); onRefresh(); } else alert(data.error);
  };

  // Pick for review (SUBMITTED → UNDER_REVIEW)
  const handlePick = async () => {
    if (!reviewerName.trim()) return;
    const res = await fetch(`${API_BASE}/admin/${app.id}/pick`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed_by: reviewerName.trim() }),
    });
    const data = await res.json();
    if (data.success) { refetchDetail(); onRefresh(); }
    else alert(data.error);
  };

  // Select (with interview ratings + custom split)
  const handleSelect = async () => {
    const misfitsPct = parseInt(splitMisfits);
    const leaderPct = parseInt(splitLeader);
    if (isNaN(misfitsPct) || isNaN(leaderPct) || misfitsPct + leaderPct !== 100) {
      alert('Split percentages must add up to 100');
      return;
    }
    const res = await fetch(`${API_BASE}/admin/${app.id}/select`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        split_percentage: { misfits: misfitsPct, leader: leaderPct },
        interview_ratings: interviewRatings,
      }),
    });
    const data = await res.json();
    if (data.success) { refetchDetail(); onRefresh(); } else alert(data.error);
  };

  const handleMilestone = async (field: string, value: boolean) => {
    const res = await fetch(`${API_BASE}/admin/${app.id}/milestones`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json();
    if (data.success) { refetchDetail(); onRefresh(); }
  };

  const handleStatusTransition = async (toStatus: string) => {
    const res = await fetch(`${API_BASE}/admin/${app.id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to_status: toStatus }),
    });
    const data = await res.json();
    if (data.success) { refetchDetail(); onRefresh(); } else alert(data.error);
  };

  const handleReject = async () => {
    if (!rejectionReason) return;
    const body: any = { rejection_reason: rejectionReason };
    // Include ratings if we're in review states
    if (['UNDER_REVIEW', 'ON_HOLD'].includes(detail?.status || '')) {
      body.ratings = screeningRatings;
    }
    // Include interview ratings if we're at INTERVIEW_DONE
    if (detail?.status === 'INTERVIEW_DONE') {
      body.interview_ratings = interviewRatings;
    }
    const res = await fetch(`${API_BASE}/admin/${app.id}/reject`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) { setShowRejectForm(false); setRejectionReason(''); refetchDetail(); onRefresh(); } else alert(data.error);
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    const res = await fetch(`${API_BASE}/admin/${app.id}/note`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: noteText }),
    });
    const data = await res.json();
    if (data.success) { setNoteText(''); refetchDetail(); }
  };

  const handleLogCall = async () => {
    const res = await fetch(`${API_BASE}/admin/${app.id}/call-log`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: callDuration, outcome: callOutcome, notes: callNotes }),
    });
    const data = await res.json();
    if (data.success) { setCallDuration(''); setCallNotes(''); refetchDetail(); }
  };

  const allScreeningRated = screeningDims.length > 0 && screeningDims.every(d => screeningRatings[d.key] >= 1 && screeningRatings[d.key] <= 5);
  const allInterviewRated = interviewDims.length > 0 && interviewDims.every(d => interviewRatings[d.key] >= 1 && interviewRatings[d.key] <= 5);
  const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.ACTIVE;
  const rowRef = useRef<HTMLTableRowElement>(null);

  // After expanding, keep the clicked row in view
  useEffect(() => {
    if (isExpanded && rowRef.current) {
      requestAnimationFrame(() => {
        rowRef.current?.scrollIntoView({ block: 'nearest' });
      });
    }
  }, [isExpanded]);

  return (
    <>
      {/* Main Row */}
      <tr
        ref={rowRef}
        onClick={onToggle}
        className={`border-b border-slate-100 cursor-pointer transition-colors ${
          isExpanded ? 'bg-indigo-50/40' : 'hover:bg-slate-50/80'
        }`}
      >
        {onSelect && (
          <td className="pl-4 pr-1 py-3" onClick={e => e.stopPropagation()}>
            <input type="checkbox" checked={isSelected || false} onChange={e => onSelect(app.id, e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 h-3.5 w-3.5 cursor-pointer" />
          </td>
        )}
        <td className="px-4 py-3">
          <div className="font-medium text-slate-800">
            {app.name || 'Anonymous'}
            {app.admin_created && <span className="ml-1.5 text-[9px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">Admin</span>}
          </div>
        </td>
        <td className="px-4 py-3 text-slate-500 text-xs">{app.user_phone || '-'}</td>
        <td className="px-4 py-3 text-slate-600">{app.city || '-'}</td>
        <td className="px-4 py-3 text-slate-600">{app.activity || '-'}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border ${cfg.badgeClass}`}>
            {cfg.label}
          </span>
          {app.reviewed_by && (
            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-0.5">
              <User className="h-2.5 w-2.5" /> {app.reviewed_by}
            </div>
          )}
        </td>
        {sectionId === 'followup' ? (
          <>
            <td className="px-4 py-3 text-xs text-slate-600">
              {app.last_screen === 'questionnaire' && app.last_question_index != null && app.total_questions
                ? <span className="font-medium">Q{app.last_question_index}/{app.total_questions} <span className="text-slate-400">({Math.round((app.last_question_index / app.total_questions) * 100)}%)</span></span>
                : app.last_screen === 'story' && app.last_story_slide
                  ? <span>Slide {app.last_story_slide}/4</span>
                  : <span className="text-slate-400 capitalize">{app.last_screen || '-'}</span>
              }
            </td>
            <td className="px-4 py-3 text-xs text-slate-500">
              {app.status === 'ACTIVE' ? (
                <>
                  {formatTimeAgo(app.updated_at)}
                  <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] border bg-blue-50 text-blue-600 border-blue-200">in progress</span>
                </>
              ) : (
                <>
                  {app.abandoned_at ? formatTimeAgo(app.abandoned_at) : formatTimeAgo(app.updated_at)}
                  {app.exit_type && (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] border ${app.exit_type === 'interested' ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {app.exit_type === 'interested' ? 'will return' : 'silent'}
                    </span>
                  )}
                </>
              )}
            </td>
          </>
        ) : (
          <td className="px-4 py-3 text-slate-500 text-xs font-medium">{computeDays(app.created_at, app.club_created_at)}</td>
        )}
        {sectionId === 'selected' && (
          <td className="px-4 py-3">
            <div className="flex gap-1">
              {app.status === 'SELECTED' ? (
                <>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${app.first_call_done ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-400 border-red-200'}`}>
                    {app.first_call_done ? '\u2713' : '\u2717'} Call
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${app.venue_sorted ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-400 border-red-200'}`}>
                    {app.venue_sorted ? '\u2713' : '\u2717'} Venue
                  </span>
                </>
              ) : (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${app.contract_url ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-400 border-red-200'}`}>
                  {app.contract_url ? '\u2713' : '\u2717'} Contract
                </span>
              )}
            </div>
          </td>
        )}
        <td className="px-4 py-3 text-slate-400">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
      </tr>

      {/* Expanded Detail Row */}
      {isExpanded && (
        <tr>
          <td colSpan={9} className="px-4 py-0">
            <div className="bg-white border border-slate-200 rounded-lg my-2 p-5 shadow-sm" onClick={e => e.stopPropagation()}>
              {detailLoading && !detail ? (
                <div className="text-center py-6 text-slate-400">Loading...</div>
              ) : detail ? (
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-800">{detail.name || 'Anonymous'}</h3>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                        <span>{detail.city}</span><span>·</span><span>{detail.activity}</span>
                        <span>·</span><span>Source: {detail.source}</span>
                        {detail.user_phone && (<><span>·</span><Phone className="h-3 w-3 inline" /> {detail.user_phone}</>)}
                        {detail.reviewed_by && (<><span>·</span><User className="h-3 w-3 inline" /> Reviewed by: {detail.reviewed_by}</>)}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border ${cfg.badgeClass}`}>
                        {cfg.label}
                      </span>
                      {detail.admin_created && (
                        <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1 ml-1">
                          <UserPlus className="h-2.5 w-2.5" /> Admin created
                        </div>
                      )}
                      {detail.interview_scheduled_at && detail.status === 'INTERVIEW_SCHEDULED' && (
                        <div className="text-[10px] text-indigo-600">
                          <Calendar className="h-2.5 w-2.5 inline mr-0.5" />
                          Interview: {formatDateTime(detail.interview_scheduled_at)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 border-b border-slate-200 mb-4">
                    {(sectionId === 'selected' && (app.status === 'SELECTED' || app.status === 'CLUB_CREATED')
                      ? (['launch_details', 'responses', 'screening', 'timeline', 'notes'] as const)
                      : (['responses', 'screening', 'timeline', 'notes'] as const)
                    ).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 text-xs font-medium transition-colors ${
                          activeTab === tab
                            ? 'text-indigo-600 border-b-2 border-indigo-600'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {tab === 'launch_details' ? 'Launch Details' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* LAUNCH DETAILS tab — SELECTED: milestones + editable split + contract */}
                  {activeTab === 'launch_details' && detail.status === 'SELECTED' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Milestones */}
                      <div className="px-3 py-2.5 bg-purple-50 rounded-lg border border-purple-200">
                        <h4 className="text-xs font-bold text-purple-700 mb-2">Post-Selection</h4>
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={detail.first_call_done} onChange={e => handleMilestone('first_call_done', e.target.checked)} className="rounded border-purple-300 text-purple-600 h-3.5 w-3.5" />
                            <span className={`text-xs ${detail.first_call_done ? 'text-purple-700 line-through' : 'text-slate-700'}`}>1st call done</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={detail.venue_sorted} onChange={e => handleMilestone('venue_sorted', e.target.checked)} className="rounded border-purple-300 text-purple-600 h-3.5 w-3.5" />
                            <span className={`text-xs ${detail.venue_sorted ? 'text-purple-700 line-through' : 'text-slate-700'}`}>Venue sorted</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={detail.toolkit_shared} onChange={e => handleMilestone('toolkit_shared', e.target.checked)} className="rounded border-purple-300 text-purple-600 h-3.5 w-3.5" />
                            <span className={`text-xs ${detail.toolkit_shared ? 'text-purple-700 line-through' : 'text-slate-700'}`}>Toolkit shared</span>
                          </label>
                          <div className="border-t border-purple-200 pt-1.5">
                            <label className={`flex items-center gap-2 ${detail.first_call_done && detail.venue_sorted && detail.split_percentage ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
                              <input type="checkbox" checked={detail.marketing_launched} disabled={!detail.first_call_done || !detail.venue_sorted || !detail.split_percentage} onChange={e => handleMilestone('marketing_launched', e.target.checked)} className="rounded border-green-300 text-green-600 h-3.5 w-3.5" />
                              <span className={`text-xs font-medium ${detail.marketing_launched ? 'text-green-700 line-through' : detail.first_call_done && detail.venue_sorted && detail.split_percentage ? 'text-green-700' : 'text-slate-400'}`}>Marketing Launch Ready</span>
                            </label>
                            {(!detail.first_call_done || !detail.venue_sorted || !detail.split_percentage) && (
                              <p className="text-[9px] text-slate-400 ml-5.5 mt-0.5">Complete call, venue & save split first</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Revenue Split (editable) */}
                      <div className="px-3 py-2.5 bg-indigo-50 rounded-lg border border-indigo-200">
                        <h4 className="text-xs font-bold text-indigo-700 mb-2">Revenue Split</h4>
                        <div className="flex items-end gap-1.5">
                          <div>
                            <div className="text-[9px] font-medium text-indigo-500 mb-0.5">Misfits %</div>
                            <input type="number" min="0" max="100" value={splitMisfits} onChange={e => { setSplitMisfits(e.target.value); const v = parseInt(e.target.value); if (!isNaN(v) && v >= 0 && v <= 100) setSplitLeader(String(100 - v)); }}
                              className="w-16 px-1.5 py-1 text-xs border border-indigo-200 rounded-md text-center" />
                          </div>
                          <span className="text-slate-400 font-bold pb-1 text-xs">/</span>
                          <div>
                            <div className="text-[9px] font-medium text-indigo-500 mb-0.5">Leader %</div>
                            <input type="number" min="0" max="100" value={splitLeader} onChange={e => { setSplitLeader(e.target.value); const v = parseInt(e.target.value); if (!isNaN(v) && v >= 0 && v <= 100) setSplitMisfits(String(100 - v)); }}
                              className="w-16 px-1.5 py-1 text-xs border border-indigo-200 rounded-md text-center" />
                          </div>
                          <button
                            onClick={async () => {
                              const m = parseInt(splitMisfits), l = parseInt(splitLeader);
                              if (m + l !== 100) return alert('Must add up to 100%');
                              const res = await fetch(`${API_BASE}/admin/${app.id}/split`, {
                                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ misfits_pct: m, leader_pct: l }),
                              });
                              const data = await res.json();
                              if (data.success) refetchDetail();
                              else alert(data.error);
                            }}
                            disabled={parseInt(splitMisfits) + parseInt(splitLeader) !== 100}
                            className="px-2.5 py-1 text-[10px] font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                        {parseInt(splitMisfits) + parseInt(splitLeader) !== 100 && (
                          <p className="text-[9px] text-red-500 mt-0.5">Must add up to 100%</p>
                        )}
                      </div>

                      {/* Contract (gated: split must be saved first) */}
                      <div className="px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                        <h4 className="text-xs font-bold text-slate-700">Contract</h4>
                        {!detail.split_percentage ? (
                          <p className="text-[10px] text-slate-400">Save revenue split first to upload contract</p>
                        ) : (
                          <>
                            {!detail.contract_url ? (
                              <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium text-purple-600 bg-white border border-purple-200 rounded-md hover:bg-purple-50 cursor-pointer">
                                <Upload className="h-3 w-3" /> Upload Contract
                                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={async (e) => {
                                  const file = e.target.files?.[0]; if (!file) return;
                                  const fd = new FormData(); fd.append('contract', file);
                                  const res = await fetch(`${API_BASE}/admin/${app.id}/upload-contract`, { method: 'POST', body: fd });
                                  const data = await res.json();
                                  if (data.success) refetchDetail(); else alert(data.error);
                                }} />
                              </label>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <FileText className="h-3 w-3 text-purple-500" />
                                <a href={detail.contract_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-purple-600 underline">View</a>
                                <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${detail.contract_url}`); alert('Link copied!'); }} className="px-1.5 py-0.5 text-[9px] font-medium text-purple-600 bg-white border border-purple-200 rounded hover:bg-purple-50">Copy</button>
                                <label className="px-1.5 py-0.5 text-[9px] font-medium text-orange-600 bg-white border border-orange-200 rounded hover:bg-orange-50 cursor-pointer ml-auto">
                                  Replace
                                  <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={async (e) => {
                                    const file = e.target.files?.[0]; if (!file) return;
                                    const fd = new FormData(); fd.append('contract', file);
                                    const res = await fetch(`${API_BASE}/admin/${app.id}/upload-contract`, { method: 'POST', body: fd });
                                    const data = await res.json();
                                    if (data.success) refetchDetail(); else alert(data.error);
                                  }} />
                                </label>
                              </div>
                            )}
                            {detail.contract_url && (
                              <>
                                <div className="border-t border-slate-200 pt-1.5">
                                  <div className="text-[10px] font-medium text-slate-600 mb-1">Signed Contract</div>
                                </div>
                                {!detail.signed_contract_url ? (
                                  <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium text-green-600 bg-white border border-green-200 rounded-md hover:bg-green-50 cursor-pointer">
                                    <Upload className="h-3 w-3" /> Upload Signed
                                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={async (e) => {
                                      const file = e.target.files?.[0]; if (!file) return;
                                      const fd = new FormData(); fd.append('contract', file);
                                      const res = await fetch(`${API_BASE}/admin/${app.id}/upload-signed-contract`, { method: 'POST', body: fd });
                                      const data = await res.json();
                                      if (data.success) { refetchDetail(); onRefresh(); } else alert(data.error);
                                    }} />
                                  </label>
                                ) : (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <CheckCircle className="h-3 w-3 text-green-500" />
                                    <a href={detail.signed_contract_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-green-600 underline">View Signed</a>
                                    <label className="px-1.5 py-0.5 text-[9px] font-medium text-orange-600 bg-white border border-orange-200 rounded hover:bg-orange-50 cursor-pointer ml-auto">
                                      Replace
                                      <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={async (e) => {
                                        const file = e.target.files?.[0]; if (!file) return;
                                        const fd = new FormData(); fd.append('contract', file);
                                        const res = await fetch(`${API_BASE}/admin/${app.id}/upload-signed-contract`, { method: 'POST', body: fd });
                                        const data = await res.json();
                                        if (data.success) { refetchDetail(); onRefresh(); } else alert(data.error);
                                      }} />
                                    </label>
                                  </div>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* LAUNCH DETAILS tab — CLUB_CREATED: read-only split + contract */}
                  {activeTab === 'launch_details' && detail.status === 'CLUB_CREATED' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Revenue Split (read-only) */}
                      <div className="px-3 py-2.5 bg-indigo-50 rounded-lg border border-indigo-200">
                        <h4 className="text-xs font-bold text-indigo-700 mb-2">Revenue Split</h4>
                        {detail.split_percentage ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-indigo-700">{detail.split_percentage.misfits}%</span>
                            <span className="text-[9px] text-indigo-500">Misfits</span>
                            <span className="text-slate-400 font-bold text-xs">/</span>
                            <span className="text-sm font-bold text-indigo-700">{detail.split_percentage.leader}%</span>
                            <span className="text-[9px] text-indigo-500">Leader</span>
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-400">Not set</p>
                        )}
                      </div>

                      {/* Contract */}
                      <div className="px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                        <h4 className="text-xs font-bold text-slate-700">Contract</h4>
                        {!detail.contract_url ? (
                          <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium text-purple-600 bg-white border border-purple-200 rounded-md hover:bg-purple-50 cursor-pointer">
                            <Upload className="h-3 w-3" /> Upload Contract
                            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={async (e) => {
                              const file = e.target.files?.[0]; if (!file) return;
                              const fd = new FormData(); fd.append('contract', file);
                              const res = await fetch(`${API_BASE}/admin/${app.id}/upload-contract`, { method: 'POST', body: fd });
                              const data = await res.json();
                              if (data.success) { refetchDetail(); onRefresh(); } else alert(data.error);
                            }} />
                          </label>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <FileText className="h-3 w-3 text-purple-500" />
                              <a href={detail.contract_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-purple-600 underline">View</a>
                              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${detail.contract_url}`); alert('Link copied!'); }} className="px-1.5 py-0.5 text-[9px] font-medium text-purple-600 bg-white border border-purple-200 rounded hover:bg-purple-50">Copy</button>
                              <label className="px-1.5 py-0.5 text-[9px] font-medium text-orange-600 bg-white border border-orange-200 rounded hover:bg-orange-50 cursor-pointer ml-auto">
                                Replace
                                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={async (e) => {
                                  const file = e.target.files?.[0]; if (!file) return;
                                  const fd = new FormData(); fd.append('contract', file);
                                  const res = await fetch(`${API_BASE}/admin/${app.id}/upload-contract`, { method: 'POST', body: fd });
                                  const data = await res.json();
                                  if (data.success) { refetchDetail(); onRefresh(); } else alert(data.error);
                                }} />
                              </label>
                            </div>
                            {detail.contract_url && (
                              <>
                                <div className="border-t border-slate-200 pt-1.5">
                                  <div className="text-[10px] font-medium text-slate-600 mb-1">Signed Contract</div>
                                </div>
                                {!detail.signed_contract_url ? (
                                  <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium text-green-600 bg-white border border-green-200 rounded-md hover:bg-green-50 cursor-pointer">
                                    <Upload className="h-3 w-3" /> Upload Signed
                                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={async (e) => {
                                      const file = e.target.files?.[0]; if (!file) return;
                                      const fd = new FormData(); fd.append('contract', file);
                                      const res = await fetch(`${API_BASE}/admin/${app.id}/upload-signed-contract`, { method: 'POST', body: fd });
                                      const data = await res.json();
                                      if (data.success) { refetchDetail(); onRefresh(); } else alert(data.error);
                                    }} />
                                  </label>
                                ) : (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <CheckCircle className="h-3 w-3 text-green-500" />
                                    <a href={detail.signed_contract_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-green-600 underline">View Signed</a>
                                    <label className="px-1.5 py-0.5 text-[9px] font-medium text-orange-600 bg-white border border-orange-200 rounded hover:bg-orange-50 cursor-pointer ml-auto">
                                      Replace
                                      <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={async (e) => {
                                        const file = e.target.files?.[0]; if (!file) return;
                                        const fd = new FormData(); fd.append('contract', file);
                                        const res = await fetch(`${API_BASE}/admin/${app.id}/upload-signed-contract`, { method: 'POST', body: fd });
                                        const data = await res.json();
                                        if (data.success) { refetchDetail(); onRefresh(); } else alert(data.error);
                                      }} />
                                    </label>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}


                  {/* Tab Content — 3 column grid (for non-launch_details tabs) */}
                  {activeTab !== 'launch_details' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* LEFT: Main tab content */}
                    <div className="md:col-span-2">
                      {/* RESPONSES */}
                      {activeTab === 'responses' && (
                        <div className="space-y-2.5">
                          {detail.questionnaire_data && Object.keys(detail.questionnaire_data).length > 0 ? (
                            Object.entries(detail.questionnaire_data).map(([key, value]) => (
                              <div key={key} className="mb-3">
                                <p className="text-xs font-medium text-slate-400 mb-0.5">
                                  {detail.question_map?.[key] || `Question ${key}`}
                                </p>
                                <p className="text-sm text-slate-800">{String(value)}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-400">No questionnaire data yet</p>
                          )}
                        </div>
                      )}

                      {/* SCREENING */}
                      {activeTab === 'screening' && (
                        <div className="space-y-6">
                          {detail.screening_ratings ? (
                            <RatingDisplay ratings={detail.screening_ratings} label="Screening Ratings (Pre-Interview)" dims={screeningDims} />
                          ) : (
                            <p className="text-sm text-slate-400">No screening ratings yet</p>
                          )}
                          {detail.interview_ratings ? (
                            <RatingDisplay ratings={detail.interview_ratings} label="Interview Ratings (Post-Interview)" dims={interviewDims} />
                          ) : (
                            ['INTERVIEW_DONE', 'SELECTED', 'CLUB_CREATED'].includes(detail.status) && (
                              <p className="text-sm text-slate-400">No interview ratings yet</p>
                            )
                          )}
                          {detail.rejection_reason && (
                            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                              <div className="text-xs font-medium text-red-600">Rejection Reason</div>
                              <div className="text-sm text-red-700">{REJECTION_REASONS.find(r => r.value === detail.rejection_reason)?.label || detail.rejection_reason}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* TIMELINE */}
                      {activeTab === 'timeline' && (
                        <div>
                          {detail.timeline.length === 0 ? (
                            <p className="text-sm text-slate-400">No status changes yet</p>
                          ) : (
                            detail.timeline.map((evt: any, i: number) => (
                              <div key={evt.id} className="flex gap-3">
                                <div className="flex flex-col items-center">
                                  <div className={`w-2 h-2 rounded-full mt-1.5 ${i === detail.timeline.length - 1 ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                                  {i < detail.timeline.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 my-1" />}
                                </div>
                                <div className="pb-3">
                                  <div className="text-xs text-slate-500">{formatDateTime(evt.created_at)}</div>
                                  <div className="text-sm text-slate-700">
                                    {evt.from_status
                                      ? <>{STATUS_CONFIG[evt.from_status]?.label || evt.from_status} → {STATUS_CONFIG[evt.to_status]?.label || evt.to_status}</>
                                      : <>Created → {STATUS_CONFIG[evt.to_status]?.label || evt.to_status}</>}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    by {evt.actor}
                                    {evt.metadata?.reviewed_by && <> · Picked by {evt.metadata.reviewed_by}</>}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* NOTES */}
                      {activeTab === 'notes' && (
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={noteText}
                              onChange={e => setNoteText(e.target.value)}
                              placeholder="Add a note..."
                              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                              onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                            />
                            <button onClick={handleAddNote} disabled={!noteText.trim()} className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">Add</button>
                          </div>
                          <div className="flex gap-2 items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <Phone className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                            <input type="text" value={callDuration} onChange={e => setCallDuration(e.target.value)} placeholder="Min" className="w-14 px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                            <select value={callOutcome} onChange={e => setCallOutcome(e.target.value)} className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white">
                              <option value="connected">Connected</option>
                              <option value="no_answer">No Answer</option>
                              <option value="busy">Busy</option>
                            </select>
                            <input type="text" value={callNotes} onChange={e => setCallNotes(e.target.value)} placeholder="Call notes..." className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                            <button onClick={handleLogCall} className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Log</button>
                          </div>
                          {detail.activity_log.map((act: any) => (
                            <div key={act.id} className="text-sm border-l-2 border-slate-200 pl-3">
                              <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
                                {act.type === 'note' ? <FileText className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                                <span className="capitalize">{act.type}</span>·<span>{formatDateTime(act.created_at)}</span>
                              </div>
                              <div className="text-slate-700">{act.content}</div>
                              {act.type === 'call' && act.metadata && (
                                <div className="text-xs text-slate-400">{act.metadata.duration && `${act.metadata.duration} min`}{act.metadata.outcome && ` · ${act.metadata.outcome}`}</div>
                              )}
                            </div>
                          ))}
                          {detail.past_applications.length > 0 && (
                            <div className="pt-3 border-t border-slate-100">
                              <div className="text-xs font-medium text-slate-500 mb-1">Past Applications ({detail.past_applications.length})</div>
                              {detail.past_applications.map((pa: any) => (
                                <div key={pa.id} className="flex items-center justify-between py-1 text-xs">
                                  <span className="text-slate-600">{pa.city} · {pa.activity}</span>
                                  <span className={`px-2 py-0.5 rounded-full border ${STATUS_CONFIG[pa.status]?.badgeClass || ''}`}>{STATUS_CONFIG[pa.status]?.shortLabel || pa.status}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* RIGHT: Action panel */}
                    <div className="space-y-4">
                      {/* SUBMITTED — Enter name + Pick for Review */}
                      {detail.status === 'SUBMITTED' && (
                        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                          <h4 className="text-sm font-bold text-emerald-700 mb-2">Pick for Review</h4>
                          <p className="text-xs text-emerald-600 mb-3">Enter your name and start reviewing this lead.</p>
                          <input
                            type="text"
                            value={reviewerName}
                            onChange={e => setReviewerName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handlePick()}
                            placeholder="Your name..."
                            className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 bg-white"
                          />
                          <button
                            onClick={handlePick}
                            disabled={!reviewerName.trim()}
                            className="w-full py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Pick for Review
                          </button>
                        </div>
                      )}

                      {/* UNDER_REVIEW — Review form (shows who picked it) */}
                      {detail.status === 'UNDER_REVIEW' && (
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                          {detail.reviewed_by && (
                            <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" /> Picked by: <span className="font-bold">{detail.reviewed_by}</span>
                            </div>
                          )}
                          <RatingForm ratings={screeningRatings} setRatings={setScreeningRatings} label="Screening Ratings" dims={screeningDims} />
                          {!allScreeningRated && (
                            <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Rate all dimensions to unlock actions
                            </p>
                          )}
                          <div className="space-y-2 mt-4">
                            <button onClick={() => handleReview('select_for_interview')} disabled={!allScreeningRated} className="w-full py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Select for Interview</button>
                            <button onClick={() => handleReview('on_hold')} disabled={!allScreeningRated} className="w-full py-2 text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed">On Hold</button>
                            {!showRejectForm ? (
                              <button onClick={() => setShowRejectForm(true)} disabled={!allScreeningRated} className="w-full py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed">Reject</button>
                            ) : (
                              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                                <select value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="w-full mb-2 px-2 py-1.5 text-xs border border-red-200 rounded-lg bg-white">
                                  <option value="">Select reason...</option>
                                  {REJECTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                                <div className="flex gap-2">
                                  <button onClick={handleReject} disabled={!rejectionReason} className="flex-1 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg disabled:opacity-50">Confirm</button>
                                  <button onClick={() => { setShowRejectForm(false); setRejectionReason(''); }} className="px-3 py-1.5 text-xs text-slate-600 bg-white border rounded-lg">Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ON_HOLD — Show review form (can reactivate) */}
                      {detail.status === 'ON_HOLD' && (
                        <div className="p-4 bg-violet-50 rounded-xl border border-violet-200">
                          <h4 className="text-sm font-bold text-violet-700 mb-2">On Hold</h4>
                          {detail.reviewed_by && (
                            <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" /> Picked by {detail.reviewed_by}
                            </div>
                          )}
                          <RatingForm ratings={screeningRatings} setRatings={setScreeningRatings} label="Screening Ratings" dims={screeningDims} />
                          {!allScreeningRated && (
                            <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Rate all dimensions to unlock actions
                            </p>
                          )}
                          <div className="space-y-2 mt-4">
                            <button onClick={() => handleReview('select_for_interview')} disabled={!allScreeningRated} className="w-full py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Select for Interview</button>
                            {!showRejectForm ? (
                              <button onClick={() => setShowRejectForm(true)} disabled={!allScreeningRated} className="w-full py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed">Reject</button>
                            ) : (
                              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                                <select value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="w-full mb-2 px-2 py-1.5 text-xs border border-red-200 rounded-lg bg-white">
                                  <option value="">Select reason...</option>
                                  {REJECTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                                <div className="flex gap-2">
                                  <button onClick={handleReject} disabled={!rejectionReason} className="flex-1 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg disabled:opacity-50">Confirm</button>
                                  <button onClick={() => { setShowRejectForm(false); setRejectionReason(''); }} className="px-3 py-1.5 text-xs text-slate-600 bg-white border rounded-lg">Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Interview actions */}
                      {detail.status === 'INTERVIEW_PENDING' && (
                        <div className="space-y-2">
                          <button onClick={() => handleStatusTransition('INTERVIEW_SCHEDULED')} className="w-full py-2 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100">
                            Mark Interview Scheduled
                          </button>
                          {!showRejectForm ? (
                            <button onClick={() => setShowRejectForm(true)} className="w-full py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">Reject</button>
                          ) : (
                            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                              <select value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="w-full mb-2 px-2 py-1.5 text-xs border border-red-200 rounded-lg bg-white">
                                <option value="">Select reason...</option>
                                {REJECTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                              </select>
                              <div className="flex gap-2">
                                <button onClick={handleReject} disabled={!rejectionReason} className="flex-1 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg disabled:opacity-50">Confirm</button>
                                <button onClick={() => { setShowRejectForm(false); setRejectionReason(''); }} className="px-3 py-1.5 text-xs text-slate-600 bg-white border rounded-lg">Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {detail.status === 'INTERVIEW_SCHEDULED' && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <button onClick={() => handleStatusTransition('INTERVIEW_DONE')} className="flex-1 py-2 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100">
                              Mark Interview Done
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm('Reschedule this interview? The lead will be moved back to Interview Pending.')) return;
                                const res = await fetch(`${API_BASE}/admin/${app.id}/reschedule`, {
                                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                });
                                const data = await res.json();
                                if (data.success) { refetchDetail(); onRefresh(); }
                                else alert(data.error);
                              }}
                              className="px-3 py-2 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 flex items-center gap-1"
                            >
                              <RotateCcw className="h-3 w-3" /> Reschedule
                            </button>
                          </div>
                          {!showRejectForm ? (
                            <button onClick={() => setShowRejectForm(true)} className="w-full py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">Reject</button>
                          ) : (
                            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                              <select value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="w-full mb-2 px-2 py-1.5 text-xs border border-red-200 rounded-lg bg-white">
                                <option value="">Select reason...</option>
                                {REJECTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                              </select>
                              <div className="flex gap-2">
                                <button onClick={handleReject} disabled={!rejectionReason} className="flex-1 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg disabled:opacity-50">Confirm</button>
                                <button onClick={() => { setShowRejectForm(false); setRejectionReason(''); }} className="px-3 py-1.5 text-xs text-slate-600 bg-white border rounded-lg">Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* INTERVIEW_DONE — Interview rating form + configurable split + Select/Reject */}
                      {detail.status === 'INTERVIEW_DONE' && (
                        <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                          <RatingForm ratings={interviewRatings} setRatings={setInterviewRatings} label="Interview Ratings" dims={interviewDims} />
                          {!allInterviewRated && (
                            <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Rate all dimensions to unlock actions
                            </p>
                          )}
                          <div className="space-y-2 mt-4">
                            {/* Configurable Split */}
                            <div className="space-y-1.5 mb-2">
                              <div className="text-xs font-medium text-purple-600">Revenue Split</div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <label className="text-[10px] text-slate-500">Misfits %</label>
                                  <input type="number" min="0" max="100" value={splitMisfits}
                                    onChange={e => { setSplitMisfits(e.target.value); const v = parseInt(e.target.value); if (!isNaN(v) && v >= 0 && v <= 100) setSplitLeader(String(100 - v)); }}
                                    className="w-full px-2 py-1.5 text-sm border border-purple-200 rounded-lg text-center bg-white" />
                                </div>
                                <span className="text-slate-400 font-bold mt-4">/</span>
                                <div className="flex-1">
                                  <label className="text-[10px] text-slate-500">Leader %</label>
                                  <input type="number" min="0" max="100" value={splitLeader}
                                    onChange={e => { setSplitLeader(e.target.value); const v = parseInt(e.target.value); if (!isNaN(v) && v >= 0 && v <= 100) setSplitMisfits(String(100 - v)); }}
                                    className="w-full px-2 py-1.5 text-sm border border-purple-200 rounded-lg text-center bg-white" />
                                </div>
                              </div>
                              {parseInt(splitMisfits) + parseInt(splitLeader) !== 100 && (
                                <p className="text-[10px] text-red-500">Must add up to 100%</p>
                              )}
                            </div>
                            <button
                              onClick={handleSelect}
                              disabled={!allInterviewRated || parseInt(splitMisfits) + parseInt(splitLeader) !== 100}
                              className="w-full py-2 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Select & Assign Split
                            </button>
                            {!showRejectForm ? (
                              <button
                                onClick={() => setShowRejectForm(true)}
                                disabled={!allInterviewRated}
                                className="w-full py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Reject
                              </button>
                            ) : (
                              <div className="p-3 bg-red-50 rounded-lg border border-red-200 mt-2">
                                <select value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="w-full mb-2 px-2 py-1.5 text-xs border border-red-200 rounded-lg bg-white">
                                  <option value="">Select reason...</option>
                                  {REJECTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                                <div className="flex gap-2">
                                  <button onClick={handleReject} disabled={!rejectionReason} className="flex-1 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg disabled:opacity-50">Confirm</button>
                                  <button onClick={() => { setShowRejectForm(false); setRejectionReason(''); }} className="px-3 py-1.5 text-xs text-slate-600 bg-white border rounded-lg">Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Milestones — SELECTED */}
                      {detail.status === 'SELECTED' && (
                        <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                          <h4 className="text-sm font-bold text-purple-700 mb-1">Post-Selection</h4>
                          {detail.split_percentage && (
                            <p className="text-xs text-purple-500 mb-3">Split: {detail.split_percentage.misfits}% Misfits / {detail.split_percentage.leader}% Leader</p>
                          )}
                          <div className="space-y-3">
                            {/* Milestone 1: 1st call */}
                            <label className="flex items-center gap-2.5 cursor-pointer">
                              <input type="checkbox" checked={detail.first_call_done} onChange={e => handleMilestone('first_call_done', e.target.checked)} className="rounded border-purple-300 text-purple-600" />
                              <span className={`text-sm ${detail.first_call_done ? 'text-purple-700 line-through' : 'text-slate-700'}`}>1st call done</span>
                            </label>
                            {/* Milestone 2: Venue */}
                            <label className="flex items-center gap-2.5 cursor-pointer">
                              <input type="checkbox" checked={detail.venue_sorted} onChange={e => handleMilestone('venue_sorted', e.target.checked)} className="rounded border-purple-300 text-purple-600" />
                              <span className={`text-sm ${detail.venue_sorted ? 'text-purple-700 line-through' : 'text-slate-700'}`}>Venue done</span>
                            </label>
                            {/* Milestone 2.5: Toolkit */}
                            <label className="flex items-center gap-2.5 cursor-pointer">
                              <input type="checkbox" checked={detail.toolkit_shared} onChange={e => handleMilestone('toolkit_shared', e.target.checked)} className="rounded border-purple-300 text-purple-600" />
                              <span className={`text-sm ${detail.toolkit_shared ? 'text-purple-700 line-through' : 'text-slate-700'}`}>Toolkit shared</span>
                            </label>
                            {/* Milestone 3: Contract */}
                            <div className="border-t border-purple-200 pt-3 space-y-2">
                              <div className="text-sm font-medium text-slate-700">Contract</div>
                              {/* Upload unsigned contract */}
                              {!detail.contract_url ? (
                                <div>
                                  <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-purple-600 bg-white border border-purple-200 rounded-lg hover:bg-purple-50 cursor-pointer">
                                    <Upload className="h-3.5 w-3.5" /> Upload Contract
                                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const formData = new FormData();
                                      formData.append('contract', file);
                                      const res = await fetch(`${API_BASE}/admin/${app.id}/upload-contract`, { method: 'POST', body: formData });
                                      const data = await res.json();
                                      if (data.success) refetchDetail();
                                      else alert(data.error);
                                    }} />
                                  </label>
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-3.5 w-3.5 text-purple-500" />
                                    <a href={detail.contract_url} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 underline hover:text-purple-700">
                                      View Contract
                                    </a>
                                    <button
                                      onClick={() => {
                                        const fullUrl = `${window.location.origin}${detail.contract_url}`;
                                        navigator.clipboard.writeText(fullUrl);
                                        alert('Link copied! Share on WhatsApp.');
                                      }}
                                      className="ml-auto px-2 py-1 text-[10px] font-medium text-purple-600 bg-white border border-purple-200 rounded hover:bg-purple-50"
                                    >
                                      Copy Link
                                    </button>
                                  </div>
                                  <div className="text-[10px] text-slate-400">Uploaded {formatDateTime(detail.contract_uploaded_at)}</div>
                                </div>
                              )}
                              {/* Upload signed contract */}
                              {detail.contract_url && (
                                <>
                                  {!detail.signed_contract_url ? (
                                    <div>
                                      <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-green-600 bg-white border border-green-200 rounded-lg hover:bg-green-50 cursor-pointer">
                                        <Upload className="h-3.5 w-3.5" /> Upload Signed Contract
                                        <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;
                                          const formData = new FormData();
                                          formData.append('contract', file);
                                          const res = await fetch(`${API_BASE}/admin/${app.id}/upload-signed-contract`, { method: 'POST', body: formData });
                                          const data = await res.json();
                                          if (data.success) { refetchDetail(); onRefresh(); }
                                          else alert(data.error);
                                        }} />
                                      </label>
                                      <p className="text-[10px] text-slate-400 mt-1">Upload after applicant signs and shares on WhatsApp</p>
                                    </div>
                                  ) : (
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                        <a href={detail.signed_contract_url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 underline hover:text-green-700">
                                          View Signed Contract
                                        </a>
                                      </div>
                                      <div className="text-[10px] text-slate-400">Signed {formatDateTime(detail.signed_contract_uploaded_at)}</div>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-purple-400 mt-3">All milestones + signed contract → Marketing Launch</p>
                        </div>
                      )}

                      {/* CLUB_CREATED badge */}
                      {detail.status === 'CLUB_CREATED' && (
                        <div className="p-4 bg-green-50 rounded-xl border border-green-200 text-center">
                          <Home className="h-8 w-8 text-green-500 mx-auto mb-2" />
                          <div className="text-sm font-bold text-green-700">Club Created</div>
                          <div className="text-xs text-green-500 mt-1">{formatDate(detail.club_created_at)}</div>
                        </div>
                      )}

                      {/* REJECTED — Show existing ratings (read-only) */}
                      {detail.status === 'REJECTED' && (
                        <div className="space-y-4">
                          {detail.screening_ratings && (
                            <div className="p-4 bg-red-50/50 rounded-xl border border-red-200">
                              <RatingDisplay ratings={detail.screening_ratings} label="Screening Ratings" dims={screeningDims} />
                            </div>
                          )}
                          {detail.interview_ratings && (
                            <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-200">
                              <RatingDisplay ratings={detail.interview_ratings} label="Interview Ratings" dims={interviewDims} />
                            </div>
                          )}
                          {detail.rejection_reason && (
                            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                              <div className="text-xs font-medium text-red-600 mb-0.5">Rejection Reason</div>
                              <div className="text-sm text-red-700">{REJECTION_REASONS.find(r => r.value === detail.rejection_reason)?.label || detail.rejection_reason}</div>
                            </div>
                          )}
                          {!detail.screening_ratings && !detail.interview_ratings && (
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                              <div className="text-xs text-slate-400">No ratings recorded</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── TAT Formatter ──────────────────────────────────────────────
function formatTAT(hrs: string | null): string {
  if (!hrs) return '-';
  const h = parseFloat(hrs);
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

// ─── Analysis Modals ─────────────────────────────────────────────

function ConversionFunnelModal({ onClose, analytics }: { onClose: () => void; analytics: AnalyticsData }) {
  const { funnel: f, conversion: c } = analytics;
  const pct = (n: number) => f.total > 0 ? Math.round((n / f.total) * 100) : 0;

  // Cumulative who reached each stage
  const reachedSubmitted = f.submitted + f.under_review + f.interview_phase + f.selected + f.onboarded + f.rejected;
  const reachedInterview = f.interview_phase + f.selected + f.onboarded + f.rejected_interview;
  const reachedSelected = f.selected + f.onboarded;

  const stages = [
    { label: 'Total Leads', count: f.total, color: 'bg-slate-400' },
    { label: 'Submitted', count: reachedSubmitted, color: 'bg-emerald-400' },
    { label: 'Interview Phase', count: reachedInterview, color: 'bg-indigo-400' },
    { label: 'Selected', count: reachedSelected, color: 'bg-purple-400' },
    { label: 'Onboarded (Club Created)', count: f.onboarded, color: 'bg-green-500' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp className="h-4.5 w-4.5 text-indigo-500" /> Conversion Funnel
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-4">
          {/* Waterfall funnel */}
          <div className="space-y-3">
            {stages.map((step, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-600">{step.label}</span>
                  <span className="text-xs">
                    <span className="font-bold text-slate-800">{step.count}</span>
                    {i > 0 && <span className="text-slate-400 ml-1">({pct(step.count)}% of total)</span>}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5">
                  <div className={`${step.color} rounded-full h-2.5 transition-all`} style={{ width: `${f.total > 0 ? (step.count / f.total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Overall conversion */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-sm font-medium text-slate-600">Overall Conversion (Lead → Onboarded)</span>
            <span className="text-lg font-bold text-indigo-600">{c.overall}%</span>
          </div>

          {/* Stage-to-stage conversion */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Stage-to-Stage</div>
            {[
              { label: 'Submitted → Interview', value: c.submit_to_interview },
              { label: 'Interview → Selected', value: c.interview_to_selected },
              { label: 'Selected → Onboarded', value: c.selected_to_onboarded },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{row.label}</span>
                <span className="font-bold text-slate-700">{row.value}%</span>
              </div>
            ))}
          </div>

          {/* Rejection breakdown */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Attrition</div>
            {[
              { label: 'Rejected (Screening)', count: f.rejected_screening, icon: <XCircle className="h-3 w-3" />, color: 'text-red-500' },
              { label: 'Rejected (Interview)', count: f.rejected_interview, icon: <XCircle className="h-3 w-3" />, color: 'text-red-500' },
              { label: 'On Hold', count: f.on_hold, icon: <PauseCircle className="h-3 w-3" />, color: 'text-violet-500' },
              { label: 'Abandoned (Pre-Submit)', count: f.abandoned, icon: <UserX className="h-3 w-3" />, color: 'text-orange-400' },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className={`${row.color} flex items-center gap-1`}>{row.icon} {row.label}</span>
                <span className="font-medium text-slate-700">{row.count} <span className="text-slate-400">({pct(row.count)}%)</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TATModal({ onClose, analytics }: { onClose: () => void; analytics: AnalyticsData }) {
  const { tat: t } = analytics;

  const rows = [
    { label: 'Submit → Pick (Review)', value: t.submit_to_pick_hrs, desc: 'Time to start reviewing' },
    { label: 'Pick → Interview', value: t.pick_to_interview_hrs, desc: 'Review to interview scheduling' },
    { label: 'Interview → Select', value: t.interview_to_select_hrs, desc: 'Interview to final selection' },
    { label: 'Select → 1st Call', value: t.select_to_call_hrs, desc: 'Post-selection onboarding call' },
    { label: 'Select → Venue Done', value: t.select_to_venue_hrs, desc: 'Post-selection milestone' },
    { label: 'Select → Marketing Launch', value: t.select_to_launch_hrs, desc: 'Post-selection milestone' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Clock className="h-4.5 w-4.5 text-amber-500" /> Turnaround Time
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                <div>
                  <div className="text-sm font-medium text-slate-700">{row.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{row.desc}</div>
                </div>
                <div className={`text-sm font-bold ${row.value ? 'text-slate-800' : 'text-slate-300'}`}>
                  {formatTAT(row.value)}
                </div>
              </div>
            ))}
          </div>
          {/* Total pipeline row */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t-2 border-slate-200">
            <div>
              <div className="text-sm font-bold text-slate-800">Total Pipeline</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Submit → Club Created</div>
            </div>
            <div className={`text-lg font-bold ${t.total_pipeline_hrs ? 'text-amber-600' : 'text-slate-300'}`}>
              {formatTAT(t.total_pipeline_hrs)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DroppedAnalysisModal({ onClose, analytics }: { onClose: () => void; analytics: AnalyticsData }) {
  const { funnel: f, dropped_analysis: da } = analytics;
  const pct = (n: number) => f.total > 0 ? Math.round((n / f.total) * 100) : 0;
  const totalDropped = f.abandoned + f.not_interested + f.rejected + f.on_hold;

  const dropStages = [
    { label: 'Abandoned (Pre-Submit)', count: f.abandoned, desc: 'Left during journey, may return', color: 'bg-orange-300' },
    { label: 'Not Interested', count: f.not_interested, desc: 'Explicitly chose to exit', color: 'bg-slate-300' },
    { label: 'Rejected at Screening', count: f.rejected_screening, desc: 'After form submission / under review', color: 'bg-red-300' },
    { label: 'Rejected after Interview', count: f.rejected_interview, desc: 'Post-interview rejection', color: 'bg-red-400' },
    { label: 'On Hold', count: f.on_hold, desc: 'Paused for later review', color: 'bg-violet-300' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <UserX className="h-4.5 w-4.5 text-red-500" /> Dropped Analysis
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-5">
          {/* Drop-off by stage */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Drop-off by Stage</div>
            <div className="space-y-3">
              {dropStages.map((stage, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-xs font-medium text-slate-700">{stage.label}</span>
                      <div className="text-[10px] text-slate-400">{stage.desc}</div>
                    </div>
                    <span className="text-xs">
                      <span className="font-bold text-slate-800">{stage.count}</span>
                      <span className="text-slate-400 ml-1">({pct(stage.count)}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className={`${stage.color} rounded-full h-2 transition-all`} style={{ width: `${f.total > 0 ? (stage.count / f.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
              <span className="text-sm font-medium text-slate-600">Total Dropped / Rejected / On Hold</span>
              <span className="text-sm font-bold text-red-600">{totalDropped} <span className="text-slate-400 font-normal">({pct(totalDropped)}%)</span></span>
            </div>
          </div>

          {/* Rejection reasons */}
          {da.rejection_reasons.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Rejection Reasons</div>
              <div className="bg-slate-50 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left px-3 py-2 font-semibold text-slate-600">Reason</th>
                      <th className="text-right px-3 py-2 font-semibold text-slate-600">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {da.rejection_reasons.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-700">{r.reason}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-800">{r.count}</td>
                      </tr>
                    ))}
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

// ─── Add Lead Modal ─────────────────────────────────────────────
const LEAD_TARGET_STATUSES = [
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'INTERVIEW_PENDING', label: 'Interview Pending' },
  { value: 'INTERVIEW_DONE', label: 'Interview Done' },
  { value: 'SELECTED', label: 'Selected' },
];

function AddLeadModal({
  apiBase, cities, onClose, onCreated,
}: {
  apiBase: string;
  cities: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [lookupResult, setLookupResult] = useState<{ user_id: number; first_name: string; last_name: string } | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [city, setCity] = useState('');
  const [activity, setActivity] = useState('');
  const [targetStatus, setTargetStatus] = useState('SUBMITTED');
  const [creating, setCreating] = useState(false);

  const handleLookup = async () => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) { setLookupError('Enter a valid 10-digit phone number'); return; }
    setLookupLoading(true);
    setLookupError('');
    setLookupResult(null);
    try {
      const res = await fetch(`${apiBase}/admin/lookup-user?phone=${cleaned}`);
      const data = await res.json();
      if (data.success) {
        setLookupResult(data.data);
      } else {
        setLookupError(data.error || 'User not found');
      }
    } catch {
      setLookupError('Failed to look up user');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!lookupResult || !city || !activity) return;
    setCreating(true);
    try {
      const res = await fetch(`${apiBase}/admin/create-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: lookupResult.user_id,
          city_name: city,
          activity_name: activity,
          name: `${lookupResult.first_name} ${lookupResult.last_name}`.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated();
      } else {
        alert(data.error || 'Failed to create lead');
      }
    } catch {
      alert('Failed to create lead');
    } finally {
      setCreating(false);
    }
  };

  const canCreate = lookupResult && city && activity && targetStatus;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">Add Lead</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Warning */}
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            <AlertTriangle className="h-3 w-3 inline mr-1" />
            The lead must have the Misfits app installed and be logged in before you can add them here.
          </div>

          {/* Phone lookup */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Phone Number</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={phone}
                onChange={e => { setPhone(e.target.value); setLookupResult(null); setLookupError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
                placeholder="10-digit phone number"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
              <button
                onClick={handleLookup}
                disabled={lookupLoading || phone.replace(/\D/g, '').length < 10}
                className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 flex items-center gap-1.5"
              >
                {lookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Look up
              </button>
            </div>
            {lookupError && (
              <div className="mt-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-600 flex items-center gap-1 font-medium">
                  <AlertTriangle className="h-3 w-3" /> {lookupError}
                </p>
                <p className="text-[11px] text-red-500 mt-1">Ask them to download the Misfits app and log in first.</p>
              </div>
            )}
            {lookupResult && (
              <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-sm font-medium text-green-800">
                  {lookupResult.first_name} {lookupResult.last_name}
                </div>
                <div className="text-xs text-green-600">User found (ID: {lookupResult.pk})</div>
              </div>
            )}
          </div>

          {/* City */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">City</label>
            <select
              value={city}
              onChange={e => setCity(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Select city</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Activity */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Activity</label>
            <input
              type="text"
              value={activity}
              onChange={e => setActivity(e.target.value)}
              placeholder="e.g. Board Games, Running..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            />
          </div>

          {/* Target Status */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Place at Status</label>
            <select
              value={targetStatus}
              onChange={e => setTargetStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {LEAD_TARGET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || creating}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create Lead
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Info Modal (Status Definitions + Dashboard SOP) ─────────────
function InfoModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'statuses' | 'sop'>('statuses');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <HelpCircle className="h-4.5 w-4.5 text-indigo-500" /> Dashboard Guide
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {([
            { id: 'statuses' as const, label: 'Status Definitions' },
            { id: 'sop' as const, label: 'Dashboard SOP' },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === tab.id ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          {activeTab === 'statuses' && (
            <div className="space-y-1">
              <p className="text-xs text-slate-500 mb-4">Every person who applies goes through these stages. Think of it like a journey from "just started" to "club is live."</p>

              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Before they submit the form</div>
              {[
                { status: 'ACTIVE', desc: 'This person is still filling out the form right now. They haven\'t finished yet. You\'ll find them in the Follow Up tab.' },
                { status: 'ABANDONED', desc: 'They started the form but left before finishing. They said "I\'ll come back later" — so they\'re still interested, just not done yet.' },
                { status: 'NOT_INTERESTED', desc: 'They said they don\'t want to lead a club, or they withdrew their application. You\'ll see them in the Dropped tab.' },
              ].map(({ status, desc }) => (
                <div key={status} className="flex gap-3 py-2.5 px-3 rounded-lg hover:bg-slate-50">
                  <span className={`shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full border ${STATUS_CONFIG[status]?.badgeClass || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {STATUS_CONFIG[status]?.shortLabel || status}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-700">{STATUS_CONFIG[status]?.label || status}</div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}

              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-5 mb-2">After they submit — your turn to review</div>
              {[
                { status: 'SUBMITTED', desc: 'They finished and submitted. This is waiting for YOU to open and review. Check the Submitted tab.' },
                { status: 'UNDER_REVIEW', desc: 'You opened it and started reading their answers. You\'re in the middle of reviewing.' },
                { status: 'ON_HOLD', desc: 'Looks promising, but you\'re not ready to decide yet. Maybe their city isn\'t open, or you need more info. You can come back to them later.' },
                { status: 'INTERVIEW_PENDING', desc: 'You liked their answers and selected them for an interview. They got a link to book a call, but haven\'t picked a time yet.' },
                { status: 'INTERVIEW_SCHEDULED', desc: 'They picked a date and time for the call. You\'ll see the date and a Google Meet link to join.' },
                { status: 'INTERVIEW_DONE', desc: 'The call happened. Now it\'s your turn again — decide whether to select them as a leader or reject.' },
              ].map(({ status, desc }) => (
                <div key={status} className="flex gap-3 py-2.5 px-3 rounded-lg hover:bg-slate-50">
                  <span className={`shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full border ${STATUS_CONFIG[status]?.badgeClass || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {STATUS_CONFIG[status]?.shortLabel || status}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-700">{STATUS_CONFIG[status]?.label || status}</div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}

              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-5 mb-2">Final result</div>
              {[
                { status: 'SELECTED', desc: 'You approved them as a club leader! Now help them get started — there are 3 things to do: First Call, Venue, and Marketing.' },
                { status: 'CLUB_CREATED', desc: 'All 3 things are done. Their club is live on Misfits. This is the finish line!' },
                { status: 'REJECTED', desc: 'You said no to this person. The reason you picked and when it happened are saved for reference.' },
              ].map(({ status, desc }) => (
                <div key={status} className="flex gap-3 py-2.5 px-3 rounded-lg hover:bg-slate-50">
                  <span className={`shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full border ${STATUS_CONFIG[status]?.badgeClass || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {STATUS_CONFIG[status]?.shortLabel || status}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-700">{STATUS_CONFIG[status]?.label || status}</div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'sop' && (
            <div className="space-y-6">
              <p className="text-xs text-slate-500">This is your daily checklist. Do these things in order, every day. Each step tells you exactly what to click and what to do.</p>

              {/* Step 1 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">1</span>
                  <span className="text-sm font-semibold text-slate-800">"A new application came in"</span>
                </div>
                <div className="ml-8 text-xs text-slate-600 leading-relaxed space-y-1.5">
                  <p><strong>Where to look:</strong> Click the <strong>Submitted</strong> tab at the top. Then click <strong>"New"</strong> on the left side.</p>
                  <p><strong>What to do:</strong> Click on a person's row to open their application. Read everything they wrote — their city, what activity they want to run, and all their answers.</p>
                  <p><strong>How to rate:</strong> You'll see 5 sliders (like giving stars). Rate each one from 1 to 5 based on how good their answers are. Think about: Do they seem passionate? Do they have time? Do they know what they're doing?</p>
                  <p><strong>Then pick one of these 3 buttons:</strong></p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li><strong>"Select for Interview"</strong> — Their answers look great and you want to talk to them. They'll get a link to book a call with you.</li>
                    <li><strong>"Reject"</strong> — They're not the right fit. Pick a reason why (you'll see a list). This cannot be undone.</li>
                    <li><strong>"Put On Hold"</strong> — They seem good but you're not sure yet. Maybe their city isn't open, or you want to think about it. You can decide later.</li>
                  </ul>
                  <p className="text-amber-600"><strong>Important:</strong> If you see a red "Overdue" tag on an application, review it right away — it's been waiting too long.</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">2</span>
                  <span className="text-sm font-semibold text-slate-800">"Someone needs to book a call"</span>
                </div>
                <div className="ml-8 text-xs text-slate-600 leading-relaxed space-y-1.5">
                  <p><strong>Where to look:</strong> Click the <strong>Interview Phase</strong> tab. Check <strong>"Pending Schedule"</strong> on the left.</p>
                  <p><strong>What's happening:</strong> These people got your interview link but haven't picked a time yet. If someone has been here for more than 2-3 days, call or message them to remind them to book.</p>
                  <p><strong>You don't need to do anything else here</strong> — once they pick a time, they automatically move to "Scheduled" and you'll see the date and a Google Meet link to join the call.</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">3</span>
                  <span className="text-sm font-semibold text-slate-800">"I just finished a call with someone"</span>
                </div>
                <div className="ml-8 text-xs text-slate-600 leading-relaxed space-y-1.5">
                  <p><strong>Where to look:</strong> In the <strong>Interview Phase</strong> tab, click <strong>"Scheduled"</strong> and find the person you just talked to.</p>
                  <p><strong>What to do:</strong> Click their row. Mark the interview as <strong>Done</strong>. Then you'll rate them again — this time based on how the call went.</p>
                  <p><strong>Then pick one:</strong></p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li><strong>"Select"</strong> — They were great on the call. They're going to become a club leader!</li>
                    <li><strong>"Reject"</strong> — The call didn't go well. Pick a reason. This is final.</li>
                  </ul>
                </div>
              </div>

              {/* Step 4 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">4</span>
                  <span className="text-sm font-semibold text-slate-800">"Someone got selected — now what?"</span>
                </div>
                <div className="ml-8 text-xs text-slate-600 leading-relaxed space-y-1.5">
                  <p><strong>Where to look:</strong> Click the <strong>Selected</strong> tab.</p>
                  <p><strong>What to do:</strong> Help them get their club ready. There are 3 checkboxes you need to complete:</p>
                  <ol className="list-decimal list-inside ml-2 space-y-1">
                    <li><strong>First Call Done</strong> — Have a welcome call with them to explain how everything works. Check this box when you're done.</li>
                    <li><strong>Venue Sorted</strong> — Help them find a place for their club sessions. Check this box when the venue is confirmed.</li>
                    <li><strong>Marketing Launched</strong> — Their club page or post is live for people to see. When you check this last box, the system automatically marks their club as created!</li>
                  </ol>
                </div>
              </div>

              {/* Step 5 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">5</span>
                  <span className="text-sm font-semibold text-slate-800">"People started but didn't finish the form"</span>
                </div>
                <div className="ml-8 text-xs text-slate-600 leading-relaxed space-y-1.5">
                  <p><strong>Where to look:</strong> Click the <strong>Follow Up</strong> tab.</p>
                  <p><strong>What you'll see:</strong> People who started filling out the form but stopped before submitting. They're grouped by how far they got:</p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li><strong>Screening</strong> — They answered most of the questions but didn't finish. These people are the closest to submitting. <strong>Call them first!</strong></li>
                    <li><strong>Activity / Basics / Login / Story</strong> — They stopped earlier in the process. Less likely to come back on their own.</li>
                  </ul>
                  <p><strong>What to do:</strong> Call or message them. Ask if they need help or have questions. When they come back and finish, they'll automatically show up in the Submitted tab.</p>
                </div>
              </div>

              {/* Step 6 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">6</span>
                  <span className="text-sm font-semibold text-slate-800">"How do I check if things are going well?"</span>
                </div>
                <div className="ml-8 text-xs text-slate-600 leading-relaxed space-y-1.5">
                  <p><strong>The 5 cards at the top</strong> show how many people are in each stage. Click any card to jump straight to that tab.</p>
                  <p><strong>The chart buttons</strong> (below the cards) give you deeper info:</p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li><strong>Conversion Funnel</strong> — Shows how many people move from one step to the next. If a lot of people drop at a certain step, something might be wrong there.</li>
                    <li><strong>Speed</strong> — Shows how fast you're reviewing applications. Try to review new ones within 2 days.</li>
                    <li><strong>Drop-off</strong> — Shows where and why people leave. Helps you figure out what to fix.</li>
                  </ul>
                </div>
              </div>

              {/* Tips */}
              <div className="pt-4 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Good to know</div>
                <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
                  <p><strong>Cleaning up old applications:</strong> Select multiple rows using the checkboxes, then click "Archive." This hides them from the main view. Don't worry — you can't accidentally archive someone you put On Hold. The system protects them.</p>
                  <p><strong>Finding someone:</strong> Use the search bar at the top. Type their name, phone number, city, or activity to find them quickly.</p>
                  <p><strong>Narrowing your view:</strong> Use the dropdown filters (city, activity, status) to see only what you need. You can combine multiple filters.</p>
                  <p><strong>Adding someone manually:</strong> If someone calls or messages asking to apply, click the <strong>"Add Lead"</strong> button to create their application for them.</p>
                  <p><strong>The "Overdue" tag:</strong> If you see a red "Overdue" tag on a submitted application, it means you're taking too long to review it. Open it and decide — don't let it sit.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard Component ────────────────────────────────────
export default function StartYourClub() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisModal, setAnalysisModal] = useState<'funnel' | 'tat' | 'dropped' | null>(null);

  // Collapsed subsections — all collapsed by default
  const [collapsedSubsections, setCollapsedSubsections] = useState<Set<string>>(() => {
    const all = new Set<string>();
    Object.values(SECTION_SUBSECTIONS).forEach(subs => subs.forEach(s => all.add(s.id)));
    return all;
  });
  const [droppedSearch, setDroppedSearch] = useState('');

  // Rating dimensions (configurable)
  const [screeningDims, setScreeningDims] = useState<RatingDimension[]>([]);
  const [interviewDims, setInterviewDims] = useState<RatingDimension[]>([]);
  const [showDimConfig, setShowDimConfig] = useState(false);
  const [dimConfigTab, setDimConfigTab] = useState<'screening' | 'interview'>('screening');
  const [newDimLabel, setNewDimLabel] = useState('');
  const [newDimDesc, setNewDimDesc] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [subsectionFilter, setSubsectionFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState('');
  const [marketingFilter, setMarketingFilter] = useState(false);

  // Active section tab
  const [activeSection, setActiveSection] = useState('followup');

  // Sort
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Selection for bulk archive
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add Lead modal
  const [showAddLead, setShowAddLead] = useState(false);

  // Info modal
  const [showInfo, setShowInfo] = useState(false);

  // Filter dropdowns data
  const [cities, setCities] = useState<string[]>([]);
  const [activities, setActivities] = useState<string[]>([]);

  // Get statuses for current section
  const currentSection = SECTIONS.find(s => s.id === activeSection)!;

  // Scheduled calls tile (INTERVIEW_SCHEDULED leads with upcoming interviews)
  const [scheduledCallsCollapsed, setScheduledCallsCollapsed] = useState(true);
  const scheduledCalls = useMemo(() =>
    applications
      .filter(a => a.status === 'INTERVIEW_SCHEDULED' && a.interview_scheduled_at)
      .sort((a, b) => new Date(a.interview_scheduled_at!).getTime() - new Date(b.interview_scheduled_at!).getTime()),
    [applications]
  );

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (cityFilter) params.set('city', cityFilter);
      if (activityFilter) params.set('activity', activityFilter);
      if (searchQuery) params.set('search', searchQuery);
      params.set('sort', sortField);
      params.set('order', sortDir);
      params.set('page', String(page));
      params.set('limit', '200');

      const res = await fetch(`${API_BASE}/admin/all?${params}`);
      const data = await res.json();
      if (data.success) {
        setApplications(data.data);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (err) {
      console.error('Failed to fetch applications:', err);
    } finally {
      setLoading(false);
    }
  }, [cityFilter, activityFilter, searchQuery, sortField, sortDir, page]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/analytics`);
      const data = await res.json();
      if (data.success) setAnalytics(data.data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  }, []);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const [citiesRes, activitiesRes] = await Promise.all([
        fetch(`${API_BASE}/admin/cities`),
        fetch(`${API_BASE}/admin/activities`),
      ]);
      const citiesData = await citiesRes.json();
      const activitiesData = await activitiesRes.json();
      if (citiesData.success) setCities(citiesData.data);
      if (activitiesData.success) setActivities(activitiesData.data);
    } catch (err) {
      console.error('Failed to fetch filter options:', err);
    }
  }, []);

  const fetchRatingDimensions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/rating-dimensions`);
      const data = await res.json();
      if (data.success) {
        setScreeningDims(data.data.screening);
        setInterviewDims(data.data.interview);
      }
    } catch (err) {
      console.error('Failed to fetch rating dimensions:', err);
    }
  }, []);

  useEffect(() => { fetchApplications(); fetchAnalytics(); fetchFilterOptions(); fetchRatingDimensions(); }, []);
  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  // SSE (admin actions) + polling every 30s (new user submissions)
  useEffect(() => {
    const url = import.meta.env.VITE_API_URL
      ? `${import.meta.env.VITE_API_URL}/api/start-club/events`
      : '/api/start-club/events';
    const es = new EventSource(url);
    es.addEventListener('application_updated', () => { fetchApplications(); fetchAnalytics(); });
    es.addEventListener('activity_added', () => {});
    const poll = setInterval(() => { fetchApplications(); fetchAnalytics(); }, 30000);
    return () => { es.close(); clearInterval(poll); };
  }, [fetchApplications, fetchAnalytics]);

  const handleRefresh = () => { fetchApplications(); fetchAnalytics(); fetchFilterOptions(); };

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Archive ${selectedIds.size} application(s)?`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/bulk-archive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.success) { setSelectedIds(new Set()); fetchApplications(); fetchAnalytics(); }
      else alert(data.error);
    } catch (err) { console.error('Bulk archive failed:', err); }
  };

  // Status options for dropdown (narrows when subsection is selected)
  const statusOptions = useMemo(() => {
    if (subsectionFilter) {
      const statuses = SUBSECTION_TO_STATUSES[activeSection]?.[subsectionFilter] || [];
      return [...new Set(statuses)];
    }
    return currentSection.statuses;
  }, [activeSection, subsectionFilter, currentSection]);

  // Linked filter handlers
  const handleSubsectionChange = (value: string) => {
    setSubsectionFilter(value);
    setStatusFilter(''); // Clear status when subsection changes
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    if (value) {
      const sub = getSubsectionForStatus(activeSection, value);
      if (sub) setSubsectionFilter(sub);
      // If ambiguous (e.g., REJECTED), don't change subsection
    } else {
      setSubsectionFilter(''); // Clearing status clears subsection
    }
    setPage(1);
  };

  // Filter applications by current section + status + subsection + marketing
  const sectionApps = useMemo(() => {
    let filtered = applications.filter(a => currentSection.statuses.includes(a.status));
    if (statusFilter) {
      filtered = filtered.filter(a => a.status === statusFilter);
    }
    if (subsectionFilter) {
      const sub = (SECTION_SUBSECTIONS[activeSection] || []).find(s => s.id === subsectionFilter);
      if (sub) filtered = filtered.filter(sub.filter);
    }
    if (marketingFilter) {
      filtered = filtered.filter(a => a.status === 'SELECTED' && a.first_call_done && a.venue_sorted && !a.marketing_launched);
    }
    return filtered;
  }, [applications, currentSection, statusFilter, subsectionFilter, marketingFilter, activeSection]);

  // Count per section from loaded applications (reflects filters including marketing)
  const getSectionCount = (sectionId: string, statuses: string[]) => {
    let filtered = applications.filter(a => statuses.includes(a.status));
    if (marketingFilter && sectionId === 'selected') {
      filtered = filtered.filter(a => a.status === 'SELECTED' && a.first_call_done && a.venue_sorted && !a.marketing_launched);
    }
    return filtered.length;
  };

  const f = analytics?.funnel;

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Start Your Club</h1>
          <p className="text-sm text-slate-500 mt-0.5">Leader application screening pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddLead(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            <UserPlus className="h-4 w-4" /> Add Lead
          </button>
          {/* Rating factors config */}
          <button
            onClick={() => setShowDimConfig(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <Settings className="h-4 w-4" /> Rating Factors
          </button>
          <button
            onClick={() => setShowInfo(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <HelpCircle className="h-4 w-4" /> Info
          </button>
          <button onClick={handleRefresh} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* ──── Funnel Summary Cards ──── */}
      {f && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 cursor-pointer hover:border-orange-400 transition-colors" onClick={() => { setActiveSection('followup'); setStatusFilter(''); setSubsectionFilter(''); setMarketingFilter(false); }}>
            <div className="text-2xl font-bold text-orange-700">{f.active_journey + f.abandoned}</div>
            <div className="text-xs font-medium text-orange-600 mt-1">Follow Up</div>
            {f.active_journey > 0 && <div className="text-[10px] text-blue-500">{f.active_journey} active, {f.abandoned} abandoned</div>}
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 cursor-pointer hover:border-emerald-400 transition-colors" onClick={() => { setActiveSection('submitted'); setStatusFilter(''); setSubsectionFilter(''); setMarketingFilter(false); }}>
            <div className="text-2xl font-bold text-emerald-700">{f.submitted + f.under_review}</div>
            <div className="text-xs font-medium text-emerald-600 mt-1">Submitted</div>
            <div className="text-[10px] text-emerald-500">{f.submitted} new, {f.under_review} reviewing</div>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 cursor-pointer hover:border-indigo-400 transition-colors" onClick={() => { setActiveSection('interview'); setStatusFilter(''); setSubsectionFilter(''); setMarketingFilter(false); }}>
            <div className="text-2xl font-bold text-indigo-700">{f.interview_phase}</div>
            <div className="text-xs font-medium text-indigo-600 mt-1">Interview Phase</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 cursor-pointer hover:border-purple-400 transition-colors" onClick={() => { setActiveSection('selected'); setStatusFilter(''); setSubsectionFilter(''); setMarketingFilter(false); }}>
            <div className="text-2xl font-bold text-purple-700">{f.selected + f.onboarded}</div>
            <div className="text-xs font-medium text-purple-600 mt-1">Selected</div>
            {f.onboarded > 0 && <div className="text-[10px] text-green-600">{f.onboarded} onboarded</div>}
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 cursor-pointer hover:border-red-400 transition-colors" onClick={() => { setActiveSection('dropped'); setStatusFilter(''); setSubsectionFilter(''); setMarketingFilter(false); }}>
            <div className="text-2xl font-bold text-red-700">{f.not_interested + f.on_hold + f.rejected}</div>
            <div className="text-xs font-medium text-red-600 mt-1">Dropped / On Hold / Not Interested</div>
            <div className="text-[10px] text-red-500">{f.rejected} rejected, {f.on_hold} on hold, {f.not_interested} not interested</div>
          </div>
        </div>
      )}

      {/* ──── Scheduled Calls Tile ──── */}
      <div className="mb-5 bg-white border border-teal-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setScheduledCallsCollapsed(!scheduledCallsCollapsed)}
            className="w-full flex items-center justify-between px-4 py-3 bg-teal-50 hover:bg-teal-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-teal-600" />
              <span className="text-sm font-semibold text-teal-700">Scheduled Calls</span>
              <span className="bg-teal-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{scheduledCalls.length}</span>
            </div>
            {scheduledCallsCollapsed ? <ChevronDown className="h-4 w-4 text-teal-500" /> : <ChevronUp className="h-4 w-4 text-teal-500" />}
          </button>
          {!scheduledCallsCollapsed && (
            <div className="p-3 space-y-2">
              {scheduledCalls.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">No scheduled calls</div>
              ) : (() => {
                // Group by date
                const groups: Record<string, Application[]> = {};
                scheduledCalls.forEach(app => {
                  const d = new Date(app.interview_scheduled_at!);
                  const today = new Date();
                  const tomorrow = new Date(today);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  let label: string;
                  if (d.toDateString() === today.toDateString()) label = 'Today';
                  else if (d.toDateString() === tomorrow.toDateString()) label = 'Tomorrow';
                  else label = d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
                  if (!groups[label]) groups[label] = [];
                  groups[label].push(app);
                });
                return Object.entries(groups).map(([dateLabel, apps]) => (
                  <div key={dateLabel}>
                    <div className="text-xs font-semibold text-slate-500 mb-1.5 px-1">{dateLabel}</div>
                    <div className="space-y-1.5">
                      {apps.map(app => {
                        const time = new Date(app.interview_scheduled_at!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                        return (
                          <div key={app.id} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-100 hover:border-teal-200 transition-colors">
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setActiveSection('interview'); setStatusFilter(''); setSubsectionFilter(''); setCollapsedSubsections(prev => { const next = new Set(prev); next.delete('scheduled'); return next; }); setExpandedId(String(app.id)); }}>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-800 truncate">{app.name || 'Unnamed'}</span>
                                {app.admin_created && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Admin</span>}
                              </div>
                              <div className="text-xs text-slate-500">{app.city} · {app.activity}</div>
                            </div>
                            <div className="text-xs font-medium text-slate-600 whitespace-nowrap">{time}</div>
                            <div className="flex items-center gap-1.5">
                              {app.calendly_meet_link ? (
                                <a
                                  href={app.calendly_meet_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <Video className="h-3 w-3" /> Join
                                </a>
                              ) : (
                                <span className="px-2.5 py-1.5 text-xs text-slate-400 bg-slate-100 rounded-lg">No link</span>
                              )}
                              <button
                                onClick={async () => {
                                  const res = await fetch(`${API_BASE}/admin/${app.id}/status`, {
                                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ to_status: 'INTERVIEW_DONE' }),
                                  });
                                  const data = await res.json();
                                  if (data.success) handleRefresh();
                                  else alert(data.error || 'Failed');
                                }}
                                className="px-2 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100"
                              >
                                Done
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm('Reschedule this interview?')) return;
                                  const res = await fetch(`${API_BASE}/admin/${app.id}/reschedule`, {
                                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                  });
                                  const data = await res.json();
                                  if (data.success) handleRefresh();
                                  else alert(data.error || 'Failed');
                                }}
                                className="px-2 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

      {/* ──── Analysis Section (collapsible) ──── */}
      {analytics && (() => {
        const f = analytics.funnel;
        const c = analytics.conversion;
        const t = analytics.tat;
        const totalDropped = f.not_interested + f.rejected + f.on_hold;
        return (
          <div className="mb-5">
            <button
              onClick={() => setShowAnalysis(!showAnalysis)}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800 mb-2"
            >
              <BarChart3 className="h-4 w-4" />
              <span>Pipeline Analysis</span>
              {showAnalysis ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showAnalysis && (
              <div className="grid grid-cols-3 gap-4">
                {/* Conversion Funnel Card */}
                <div
                  className="bg-white border border-slate-200 rounded-xl p-5 cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group"
                  onClick={() => setAnalysisModal('funnel')}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <TrendingUp className="h-4.5 w-4.5 text-indigo-500" />
                    </div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Conversion Funnel</span>
                  </div>
                  <div className="text-2xl font-bold text-indigo-600">{c.overall}%</div>
                  <div className="text-[11px] text-slate-400 mt-1">Overall conversion rate</div>
                </div>

                {/* TAT Card */}
                <div
                  className="bg-white border border-slate-200 rounded-xl p-5 cursor-pointer hover:border-amber-400 hover:shadow-md transition-all group"
                  onClick={() => setAnalysisModal('tat')}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                      <Clock className="h-4.5 w-4.5 text-amber-500" />
                    </div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">TAT</span>
                  </div>
                  <div className="text-2xl font-bold text-amber-600">{formatTAT(t.total_pipeline_hrs)}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Avg pipeline time</div>
                </div>

                {/* Dropped Analysis Card */}
                <div
                  className="bg-white border border-slate-200 rounded-xl p-5 cursor-pointer hover:border-red-400 hover:shadow-md transition-all group"
                  onClick={() => setAnalysisModal('dropped')}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                      <UserX className="h-4.5 w-4.5 text-red-500" />
                    </div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dropped</span>
                  </div>
                  <div className="text-2xl font-bold text-red-600">{totalDropped}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Total dropped / rejected</div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Leads Card */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, city, activity..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            />
          </div>
          <select value={statusFilter} onChange={e => handleStatusChange(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
            <option value="">All Statuses</option>
            {statusOptions.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
            ))}
          </select>
          <select value={subsectionFilter} onChange={e => handleSubsectionChange(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
            <option value="">All Subsections</option>
            {(SECTION_SUBSECTIONS[activeSection] || []).map(sub => (
              <option key={sub.id} value={sub.id}>{sub.label}</option>
            ))}
          </select>
          <select value={cityFilter} onChange={e => { setCityFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
            <option value="">All Cities</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={activityFilter} onChange={e => { setActivityFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
            <option value="">All Activities</option>
            {activities.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {activeSection === 'selected' && (
            <button
              onClick={() => setMarketingFilter(!marketingFilter)}
              className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                marketingFilter
                  ? 'bg-green-50 text-green-700 border-green-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Marketing Launch Ready
            </button>
          )}
          {(statusFilter || subsectionFilter || cityFilter || activityFilter || searchQuery || marketingFilter) && (
            <button onClick={() => { setStatusFilter(''); setSubsectionFilter(''); setCityFilter(''); setActivityFilter(''); setSearchQuery(''); setMarketingFilter(false); setPage(1); }} className="text-xs text-slate-500 hover:text-slate-700 underline">
              Clear
            </button>
          )}
        </div>

        {/* 5 Section Tabs */}
        <div className="flex border-b border-slate-200">
          {SECTIONS.map(sec => {
            const count = getSectionCount(sec.id, sec.statuses);
            const isActive = activeSection === sec.id;
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                onClick={() => { setActiveSection(sec.id); setStatusFilter(''); setSubsectionFilter(''); setMarketingFilter(false); setExpandedId(null); setSelectedIds(new Set()); setDroppedSearch(''); }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{sec.label}</span>
                <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 border-b border-indigo-200">
            <span className="text-sm font-medium text-indigo-700">{selectedIds.size} selected</span>
            <button onClick={handleBulkArchive} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50">
              <Archive className="h-3.5 w-3.5" /> Archive
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-indigo-500 hover:text-indigo-700 underline ml-auto">Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <th className="pl-4 pr-1 py-3 w-8">
                  <input type="checkbox"
                    checked={selectedIds.size > 0 && sectionApps.every(a => selectedIds.has(a.id))}
                    onChange={e => {
                      if (e.target.checked) setSelectedIds(new Set(sectionApps.map(a => a.id)));
                      else setSelectedIds(new Set());
                    }}
                    className="rounded border-slate-300 text-indigo-600 h-3.5 w-3.5 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">Name {sortField === 'name' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</div>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Phone</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort('city')}>
                  <div className="flex items-center gap-1">City {sortField === 'city' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</div>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort('activity')}>
                  <div className="flex items-center gap-1">Activity {sortField === 'activity' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</div>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                {activeSection === 'followup' && (
                  <>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Progress</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Last Seen</th>
                  </>
                )}
                {activeSection !== 'followup' && (
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-slate-800" onClick={() => handleSort('created_at')}>
                    <div className="flex items-center gap-1">Days {sortField === 'created_at' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</div>
                  </th>
                )}
                {activeSection === 'selected' && (
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Milestones</th>
                )}
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading && sectionApps.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-400">Loading...</td></tr>
              ) : sectionApps.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-400">No applications in this section</td></tr>
              ) : (() => {
                const subsections = SECTION_SUBSECTIONS[activeSection];
                if (!subsections) return null;
                return (
                  <>
                    {activeSection === 'dropped' && (
                      <tr className="bg-slate-50/40">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search dropped leads..."
                              value={droppedSearch}
                              onChange={e => setDroppedSearch(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                    {subsections.map(sub => {
                      let subApps = sectionApps.filter(sub.filter);
                      if (activeSection === 'dropped' && droppedSearch.trim()) {
                        const q = droppedSearch.toLowerCase();
                        subApps = subApps.filter(a =>
                          (a.name || '').toLowerCase().includes(q) ||
                          (a.city || '').toLowerCase().includes(q) ||
                          (a.activity || '').toLowerCase().includes(q)
                        );
                      }
                      if (subApps.length === 0) return null;
                      const isCollapsed = collapsedSubsections.has(sub.id);
                      const isGroupCollapsed = sub.parentGroup ? collapsedSubsections.has(sub.parentGroup) : false;
                      // Hide child subsections if parent group is collapsed
                      if (isGroupCollapsed) return null;
                      return (
                        <React.Fragment key={sub.id}>
                          <tr
                            className={`${sub.bgClass} border-l-4 ${sub.borderClass} cursor-pointer hover:opacity-90`}
                            onClick={() => setCollapsedSubsections(prev => {
                              const next = new Set(prev);
                              if (next.has(sub.id)) next.delete(sub.id); else next.add(sub.id);
                              return next;
                            })}
                          >
                            <td colSpan={9} className={`py-2.5 ${sub.parentGroup ? 'px-8' : 'px-4'}`}>
                              <div className="flex items-center gap-2">
                                {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                                <span className={`text-sm font-semibold ${sub.headerClass}`}>{sub.label}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sub.countClass}`}>{subApps.length}</span>
                              </div>
                            </td>
                          </tr>
                          {!isCollapsed && !sub.isGroup && subApps.map(app => (
                            <LeadRow
                              key={app.id}
                              app={app}
                              isExpanded={expandedId === app.id}
                              onToggle={() => setExpandedId(expandedId === app.id ? null : app.id)}
                              sectionId={activeSection}
                              onRefresh={handleRefresh}
                              screeningDims={screeningDims}
                              interviewDims={interviewDims}
                              isSelected={selectedIds.has(app.id)}
                              onSelect={(id, checked) => setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (checked) next.add(id); else next.delete(id);
                                return next;
                              })}
                            />
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </>
                );
              })()}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-xs text-slate-500">Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs font-medium border rounded-lg disabled:opacity-50 hover:bg-white">Prev</button>
              <span className="text-xs text-slate-500">Page {page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 text-xs font-medium border rounded-lg disabled:opacity-50 hover:bg-white">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Analysis Modals */}
      {analysisModal === 'funnel' && analytics && (
        <ConversionFunnelModal onClose={() => setAnalysisModal(null)} analytics={analytics} />
      )}
      {analysisModal === 'tat' && analytics && (
        <TATModal onClose={() => setAnalysisModal(null)} analytics={analytics} />
      )}
      {analysisModal === 'dropped' && analytics && (
        <DroppedAnalysisModal onClose={() => setAnalysisModal(null)} analytics={analytics} />
      )}

      {/* Add Lead Modal */}
      {showAddLead && (
        <AddLeadModal
          apiBase={API_BASE}
          cities={cities}
          onClose={() => setShowAddLead(false)}
          onCreated={() => { setShowAddLead(false); handleRefresh(); }}
        />
      )}

      {/* Info Modal */}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

      {/* Rating Factors Modal */}
      {showDimConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDimConfig(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Rating Factors</h3>
              <button onClick={() => setShowDimConfig(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100">
              {(['screening', 'interview'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDimConfigTab(tab)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${dimConfigTab === tab ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {tab === 'screening' ? 'Screening' : 'Interview'}
                  <span className="ml-1.5 text-xs text-slate-400">
                    ({tab === 'screening' ? screeningDims.length : interviewDims.length})
                  </span>
                </button>
              ))}
            </div>

            {/* Factor list */}
            <div className="px-6 py-4 max-h-[50vh] overflow-y-auto">
              {(dimConfigTab === 'screening' ? screeningDims : interviewDims).length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">No factors added yet</div>
              ) : (
                <div className="space-y-1">
                  {(dimConfigTab === 'screening' ? screeningDims : interviewDims).map(dim => (
                    <div key={dim.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 group">
                      <div>
                        <div className="text-sm font-medium text-slate-700">{dim.label}</div>
                        {dim.description && <div className="text-xs text-slate-400 mt-0.5">{dim.description}</div>}
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm(`Remove "${dim.label}" from ${dimConfigTab}?`)) return;
                          const res = await fetch(`${API_BASE}/admin/rating-dimensions/${dim.id}`, { method: 'DELETE' });
                          const data = await res.json();
                          if (data.success) fetchRatingDimensions();
                          else alert(data.error);
                        }}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add new factor */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">
                Add to {dimConfigTab === 'screening' ? 'Screening' : 'Interview'}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={newDimLabel}
                    onChange={e => setNewDimLabel(e.target.value)}
                    placeholder="Factor name (e.g. Leadership)"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  />
                  <input
                    type="text"
                    value={newDimDesc}
                    onChange={e => setNewDimDesc(e.target.value)}
                    placeholder="Description"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!newDimLabel.trim()) return;
                    const res = await fetch(`${API_BASE}/admin/rating-dimensions`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ label: newDimLabel.trim(), description: newDimDesc.trim(), step: dimConfigTab }),
                    });
                    const data = await res.json();
                    if (data.success) { setNewDimLabel(''); setNewDimDesc(''); fetchRatingDimensions(); }
                    else alert(data.error);
                  }}
                  disabled={!newDimLabel.trim() || !newDimDesc.trim()}
                  className="self-start px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
