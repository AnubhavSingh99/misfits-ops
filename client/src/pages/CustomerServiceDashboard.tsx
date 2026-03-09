import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Headphones,
  Search,
  Clock,
  CheckCircle,
  RefreshCw,
  X,
  Send,
  Pencil,
  Save,
  Loader2,
  Inbox,
  TrendingUp,
  Paperclip,
  FileText,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Minus,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import {
  getAgentTickets,
  getAgentStats,
  getTicketDetail,
  sendMessage,
  updateTicketStatus,
  updateTicketDetails,
  updateTicketPriority,
  resolveTicket,
  acceptTicket,
  markRead,
  uploadFile,
  uploadToS3,
  getWSUrl,
  getAgentEventsUrl,
  type SupportTicket,
  type SupportMessage,
  type SupportStats,
} from '../services/supportApi';

const STATUS_TABS = ['ALL', 'WAITING', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  WAITING: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  OPEN: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  IN_PROGRESS: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  RESOLVED: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  CLOSED: { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' },
  AUTO_RESOLVED: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

const PRIORITY_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  URGENT: { icon: ArrowUp, color: 'text-red-600', label: 'Urgent' },
  HIGH: { icon: ArrowUp, color: 'text-orange-500', label: 'High' },
  MEDIUM: { icon: Minus, color: 'text-blue-500', label: 'Medium' },
  LOW: { icon: ArrowDown, color: 'text-slate-400', label: 'Low' },
};

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function formatFullDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatMsgTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  });
}

function isImageMsg(msg: SupportMessage): boolean {
  if (msg.message_type === 'IMAGE') return true;
  if (msg.file_url && /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(msg.file_url)) return true;
  return false;
}

// ==================== Status Badge ====================
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.CLOSED;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.replace('_', ' ')}
    </span>
  );
}

// ==================== Priority Icon ====================
function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.MEDIUM;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${cfg.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

// ==================== Stats Cards ====================
function StatsBar({ stats, loading }: { stats: SupportStats | null; loading: boolean }) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-5 gap-4 px-6 py-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 bg-white rounded-lg border border-slate-200 animate-pulse" />
        ))}
      </div>
    );
  }
  const cards = [
    { label: 'Waiting', value: stats.waiting_count, icon: AlertCircle, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
    { label: 'Open', value: stats.open_count, icon: Inbox, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { label: 'In Progress', value: stats.in_progress_count, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { label: 'Resolved', value: stats.resolved_count, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Avg Resolution', value: `${stats.avg_resolution_hours.toFixed(1)}h`, icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
  ];
  return (
    <div className="grid grid-cols-5 gap-4 px-6 py-4">
      {cards.map((c) => (
        <div key={c.label} className={`flex items-center gap-3 p-4 rounded-lg border ${c.border} bg-white`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.bg}`}>
            <c.icon className={`w-5 h-5 ${c.color}`} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800">{c.value}</div>
            <div className="text-xs text-slate-500 font-medium">{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ==================== Inline Priority Dropdown ====================
function InlinePriorityDropdown({
  ticketId,
  priority,
  onPriorityChange,
}: {
  ticketId: number;
  priority: string;
  onPriorityChange: (ticketId: number, priority: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80"
      >
        <PriorityBadge priority={priority} />
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 min-w-[120px]">
            {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => (
              <button
                key={p}
                onClick={(e) => {
                  e.stopPropagation();
                  onPriorityChange(ticketId, p);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${p === priority ? 'bg-slate-50' : ''}`}
              >
                <PriorityBadge priority={p} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ==================== Inline Status Dropdown ====================
function InlineStatusDropdown({
  ticketId,
  status,
  onStatusChange,
}: {
  ticketId: number;
  status: string;
  onStatusChange: (ticketId: number, status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isClosed = ['RESOLVED', 'CLOSED', 'AUTO_RESOLVED'].includes(status);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!isClosed) setOpen(!open);
        }}
        disabled={isClosed}
        className={`inline-flex items-center gap-1 ${isClosed ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}
      >
        <StatusBadge status={status} />
        {!isClosed && <ChevronDown className="w-3 h-3 text-slate-400" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 min-w-[140px]">
            {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => (
              <button
                key={s}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(ticketId, s);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${s === status ? 'bg-slate-50' : ''}`}
              >
                <StatusBadge status={s} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ==================== Ticket Table ====================
function TicketTable({
  tickets,
  selectedId,
  onSelect,
  onStatusChange,
  onPriorityChange,
  loading,
}: {
  tickets: SupportTicket[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onStatusChange: (ticketId: number, status: string) => void;
  onPriorityChange: (ticketId: number, priority: string) => void;
  loading: boolean;
}) {
  if (loading && tickets.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Inbox className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm font-medium">No tickets found</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-left">
            <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-28">Key</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-36">Status</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-24">Priority</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-36">Category</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-28">Updated</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-28">Created</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`border-b border-slate-100 cursor-pointer transition-colors group ${
                selectedId === t.id
                  ? 'bg-indigo-50 hover:bg-indigo-50'
                  : 'hover:bg-slate-50'
              }`}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500 group-hover:text-indigo-600">{t.ticket_number}</span>
                  {t.unread_count > 0 && (
                    <span className="w-4.5 h-4.5 min-w-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {t.unread_count}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <p className="text-slate-800 font-medium truncate max-w-xs">{t.subject}</p>
                {t.last_message && (
                  <p className="text-xs text-slate-400 truncate max-w-xs mt-0.5">{t.last_message}</p>
                )}
              </td>
              <td className="px-4 py-3">
                <InlineStatusDropdown ticketId={t.id} status={t.status} onStatusChange={onStatusChange} />
              </td>
              <td className="px-4 py-3">
                <InlinePriorityDropdown ticketId={t.id} priority={t.priority} onPriorityChange={onPriorityChange} />
              </td>
              <td className="px-4 py-3">
                <span className="text-xs text-slate-500">{t.category_name || '—'}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs text-slate-500">{timeAgo(t.updated_at)}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs text-slate-500">{timeAgo(t.created_at)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ==================== Chat Panel ====================
function ChatPanel({
  ticketId,
  messages,
  onSend,
  sending,
  onFileUpload,
  uploading,
}: {
  ticketId: number;
  messages: SupportMessage[];
  onSend: (content: string) => void;
  sending: boolean;
  onFileUpload: (file: File) => void;
  uploading: boolean;
}) {
  const [input, setInput] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setInput('');
  }, [ticketId]);

  const handleSend = () => {
    if (!input.trim() || sending) return;
    onSend(input.trim());
    setInput('');
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 25 * 1024 * 1024) {
      alert('File too large. Maximum size is 25MB.');
      return;
    }
    onFileUpload(file);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 py-8">
            <p className="text-sm">No messages yet</p>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.message_type === 'FORM_DATA') {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="bg-white border border-slate-200 rounded-xl p-3 max-w-sm text-center">
                  <div className="text-[11px] font-semibold text-slate-500 mb-1">Ticket Created</div>
                  {msg.content && <p className="text-sm text-slate-700">{msg.content}</p>}
                  <p className="text-[10px] text-slate-400 mt-1">{formatMsgTime(msg.created_at)}</p>
                </div>
              </div>
            );
          }

          const isUser = msg.sender_type === 'USER';
          const isSystem = msg.sender_type === 'SYSTEM';

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="bg-slate-200/60 rounded-full px-4 py-1.5">
                  <p className="text-[11px] text-slate-500">{msg.content}</p>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  isUser
                    ? 'bg-white border border-slate-200 rounded-bl-md'
                    : 'bg-indigo-600 text-white rounded-br-md'
                }`}
              >
                {isUser && msg.sender_name && (
                  <p className="text-[11px] font-semibold text-indigo-600 mb-0.5">{msg.sender_name}</p>
                )}
                {isImageMsg(msg) && msg.file_url && (
                  <img
                    src={msg.file_url}
                    alt="attachment"
                    className="max-w-full rounded-lg mb-1 cursor-pointer max-h-48 object-cover"
                    onClick={() => setPreviewUrl(msg.file_url!)}
                  />
                )}
                {msg.file_url && !isImageMsg(msg) && (
                  <a
                    href={msg.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-1 ${
                      isUser ? 'bg-slate-50 text-slate-700' : 'bg-indigo-500 text-white'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span className="text-sm truncate">{msg.content || msg.file_name || 'File'}</span>
                  </a>
                )}
                {msg.content && !(isImageMsg(msg) && msg.file_url && !msg.content.trim()) && (
                  <p className={`text-sm ${isUser ? 'text-slate-800' : 'text-white'}`}>{msg.content}</p>
                )}
                <p className={`text-[10px] mt-1 ${isUser ? 'text-slate-400' : 'text-indigo-200'}`}>
                  {formatMsgTime(msg.created_at)}
                  {!isUser && msg.sender_name && ` · ${msg.sender_name}`}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Input bar */}
      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Attach file"
          >
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
          </button>
          <input
            type="text"
            placeholder="Type a reply..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setPreviewUrl(null)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" onClick={() => setPreviewUrl(null)}>
            <X className="w-6 h-6" />
          </button>
          <img src={previewUrl} alt="preview" className="max-w-[90vw] max-h-[90vh] rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ==================== Ticket Detail Panel ====================
function TicketDetailPanel({
  ticket,
  messages,
  onBack,
  onStatusChange,
  onDetailsUpdate,
  onResolve,
  onSend,
  sending,
  onFileUpload,
  uploading,
  actionLoading,
}: {
  ticket: SupportTicket;
  messages: SupportMessage[];
  onBack: () => void;
  onStatusChange: (status: string) => void;
  onDetailsUpdate: (data: { subject?: string; description?: string }) => void;
  onResolve: (note: string) => void;
  onSend: (content: string) => void;
  sending: boolean;
  onFileUpload: (file: File) => void;
  uploading: boolean;
  actionLoading: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState(ticket.subject);
  const [editDesc, setEditDesc] = useState(ticket.description || '');
  const [showResolve, setShowResolve] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);

  useEffect(() => {
    setEditSubject(ticket.subject);
    setEditDesc(ticket.description || '');
    setEditing(false);
    setShowResolve(false);
    setResolveNote('');
  }, [ticket.id]);

  const isClosed = ['RESOLVED', 'CLOSED', 'AUTO_RESOLVED'].includes(ticket.status);

  return (
    <div className="flex flex-col h-full">
      {/* Detail header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-400">{ticket.ticket_number}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <h3 className="text-sm font-semibold text-slate-800 truncate mt-0.5">{ticket.subject}</h3>
        </div>
      </div>

      {/* Split: Chat left, Details right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200">
          <ChatPanel
            ticketId={ticket.id}
            messages={messages}
            onSend={onSend}
            sending={sending}
            onFileUpload={onFileUpload}
            uploading={uploading}
          />
        </div>

        {/* Details sidebar */}
        <div className="w-72 bg-white flex flex-col overflow-y-auto flex-shrink-0">
          <div className="p-4 space-y-4">
            {/* Status */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</label>
              <div className="relative mt-1">
                <button
                  onClick={() => !isClosed && setStatusOpen(!statusOpen)}
                  disabled={isClosed}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg border border-slate-200 ${
                    isClosed ? 'opacity-60 cursor-not-allowed' : 'hover:border-slate-300 cursor-pointer'
                  }`}
                >
                  <StatusBadge status={ticket.status} />
                  {!isClosed && <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {statusOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                      {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => (
                        <button
                          key={s}
                          onClick={() => { onStatusChange(s); setStatusOpen(false); }}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
                        >
                          <StatusBadge status={s} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Priority</label>
              <div className="mt-1"><PriorityBadge priority={ticket.priority} /></div>
            </div>

            {/* Category */}
            {ticket.category_name && (
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Category</label>
                <p className="text-sm text-slate-700 mt-1">{ticket.category_name}</p>
              </div>
            )}

            {/* Subject & Description */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Subject</label>
                {!isClosed && (
                  <button
                    onClick={() => {
                      if (editing) {
                        onDetailsUpdate({ subject: editSubject, description: editDesc });
                        setEditing(false);
                      } else {
                        setEditing(true);
                      }
                    }}
                    className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                  >
                    {editing ? <Save className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              {editing ? (
                <input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-sm text-slate-700 mt-1">{ticket.subject}</p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Description</label>
              {editing ? (
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-20 resize-none"
                />
              ) : (
                <p className="text-sm text-slate-500 mt-1">{ticket.description || 'No description'}</p>
              )}
            </div>

            {/* Dates */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Created</label>
              <p className="text-xs text-slate-600 mt-1">{formatFullDate(ticket.created_at)}</p>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Updated</label>
              <p className="text-xs text-slate-600 mt-1">{formatFullDate(ticket.updated_at)}</p>
            </div>

            {/* Resolve */}
            {!isClosed && (
              <div className="pt-2">
                {showResolve ? (
                  <div className="space-y-2">
                    <textarea
                      placeholder="Resolution note..."
                      value={resolveNote}
                      onChange={(e) => setResolveNote(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 h-20 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { onResolve(resolveNote); setShowResolve(false); setResolveNote(''); }}
                        disabled={actionLoading}
                        className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {actionLoading ? 'Resolving...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setShowResolve(false)}
                        className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowResolve(true)}
                    className="w-full py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 border border-emerald-200 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4 inline mr-1.5" />
                    Resolve Ticket
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Main Dashboard ====================
export default function CustomerServiceDashboard() {
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [waitingTickets, setWaitingTickets] = useState<SupportTicket[]>([]);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try { setStats(await getAgentStats()); } catch {}
    setLoadingStats(false);
  }, []);

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      const params: any = { limit: 100 };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const data = await getAgentTickets(params);
      setTickets(data.tickets || []);
    } catch {}
    setLoadingTickets(false);
  }, [statusFilter]);

  const loadMessages = useCallback(async () => {
    if (!selectedId) return;
    try {
      const data = await getTicketDetail(selectedId);
      setMessages(data.messages || []);
      setSelectedTicket(data.ticket);
      markRead(selectedId).catch(() => {});
    } catch {}
  }, [selectedId]);

  // Initial load
  useEffect(() => { loadStats(); loadTickets(); }, [loadStats, loadTickets]);

  // Auto-refresh every 30s
  useEffect(() => {
    refreshRef.current = setInterval(() => { loadTickets(); loadStats(); }, 30000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [loadTickets, loadStats]);

  // SSE for incoming requests
  useEffect(() => {
    const sse = new EventSource(getAgentEventsUrl());
    sseRef.current = sse;

    sse.addEventListener('waiting_list', (e) => {
      try {
        const data = JSON.parse(e.data);
        setWaitingTickets(data);
      } catch {}
    });

    sse.addEventListener('new_request', () => {
      // Play notification sound if available
      try { new Audio('/notification.mp3').play().catch(() => {}); } catch {}
    });

    sse.addEventListener('request_accepted', () => {
      loadTickets();
      loadStats();
    });

    sse.onerror = () => {
      // SSE will auto-reconnect
    };

    return () => { sse.close(); sseRef.current = null; };
  }, []);

  // Accept ticket handler
  const handleAcceptTicket = async (ticketId: number) => {
    setAcceptingId(ticketId);
    try {
      await acceptTicket(ticketId);
      setWaitingTickets((prev) => prev.filter((t) => t.id !== ticketId));
      await loadTickets();
      loadStats();
      setSelectedId(ticketId);
    } catch (err: any) {
      if (err?.status === 409) {
        alert('This ticket was already accepted by another agent.');
        setWaitingTickets((prev) => prev.filter((t) => t.id !== ticketId));
      } else {
        alert('Failed to accept ticket.');
      }
    }
    setAcceptingId(null);
  };

  // Load messages on ticket select
  useEffect(() => {
    if (selectedId) { loadMessages(); } else { setMessages([]); setSelectedTicket(null); }
  }, [selectedId, loadMessages]);

  // WebSocket for selected ticket
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const startPolling = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(loadMessages, 10000);
    };
    (async () => {
      try {
        const wsUrl = await getWSUrl(selectedId);
        if (cancelled) return;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'message' && data.message) {
              setMessages((prev) => [...prev, data.message]);
              ws.send(JSON.stringify({ type: 'read' }));
            }
          } catch {}
        };
        ws.onerror = () => startPolling();
        ws.onclose = () => startPolling();
      } catch { startPolling(); }
    })();
    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [selectedId]);

  const handleSend = async (content: string) => {
    if (!selectedId || sending) return;
    setSending(true);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'message', content }));
      setSending(false);
      return;
    }
    try {
      const result = await sendMessage(selectedId, { content });
      setMessages((prev) => [...prev, result.message]);
    } catch {}
    setSending(false);
  };

  const handleFileUpload = async (file: File) => {
    if (!selectedId) return;
    setUploading(true);
    try {
      const { fileId, uploadUrl } = await uploadFile(file.type);
      await uploadToS3(uploadUrl, file);
      const isImage = file.type.startsWith('image/');
      const msgType = isImage ? 'IMAGE' : 'FILE';
      const content = isImage ? '' : file.name;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'message', content, file_id: fileId, message_type: msgType }));
      } else {
        const result = await sendMessage(selectedId, { content, message_type: msgType, file_id: fileId });
        setMessages((prev) => [...prev, result.message]);
      }
    } catch { alert('Failed to upload file.'); }
    setUploading(false);
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      if (status === 'RESOLVED') { await resolveTicket(selectedId, ''); }
      else { await updateTicketStatus(selectedId, status); }
      await loadTickets(); await loadMessages(); loadStats();
    } catch {}
    setActionLoading(false);
  };

  const handleDetailsUpdate = async (data: { subject?: string; description?: string }) => {
    if (!selectedId) return;
    setActionLoading(true);
    try { await updateTicketDetails(selectedId, data); await loadTickets(); await loadMessages(); } catch {}
    setActionLoading(false);
  };

  const handleResolve = async (note: string) => {
    if (!selectedId) return;
    setActionLoading(true);
    try { await resolveTicket(selectedId, note); await loadTickets(); await loadMessages(); loadStats(); } catch {}
    setActionLoading(false);
  };

  // Table-level status change (by ticket id)
  const handleTableStatusChange = async (ticketId: number, status: string) => {
    try {
      if (status === 'RESOLVED') { await resolveTicket(ticketId, ''); }
      else { await updateTicketStatus(ticketId, status); }
      await loadTickets(); loadStats();
    } catch {}
  };

  // Table-level priority change (by ticket id)
  const handleTablePriorityChange = async (ticketId: number, priority: string) => {
    try {
      await updateTicketPriority(ticketId, priority);
      await loadTickets();
    } catch {}
  };

  // Filter tickets by search
  const filteredTickets = tickets.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.ticket_number.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.category_name || '').toLowerCase().includes(q)
    );
  });

  // If a ticket is selected, show the detail view
  if (selectedId && selectedTicket) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-slate-50">
        <TicketDetailPanel
          ticket={selectedTicket}
          messages={messages}
          onBack={() => setSelectedId(null)}
          onStatusChange={handleStatusChange}
          onDetailsUpdate={handleDetailsUpdate}
          onResolve={handleResolve}
          onSend={handleSend}
          sending={sending}
          onFileUpload={handleFileUpload}
          uploading={uploading}
          actionLoading={actionLoading}
        />
      </div>
    );
  }

  // Queue view (table)
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <Headphones className="w-5 h-5 text-indigo-600" />
          <h1 className="text-base font-bold text-slate-800">Service Desk</h1>
        </div>
        <button
          onClick={() => { loadTickets(); loadStats(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingTickets ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <StatsBar stats={stats} loading={loadingStats} />

      {/* Incoming Requests */}
      {waitingTickets.length > 0 && (
        <div className="px-6 pb-2">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-bold text-purple-800">
                Incoming Requests ({waitingTickets.length})
              </h3>
              <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {waitingTickets.map((t) => (
                <div key={t.id} className="bg-white rounded-lg border border-purple-100 p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">{t.ticket_number}</span>
                      <PriorityBadge priority={t.priority} />
                    </div>
                    <p className="text-sm font-medium text-slate-800 truncate mt-0.5">
                      {t.category_name || t.subject || 'Support Request'}
                    </p>
                    {t.user_note && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{t.user_note}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {t.user_name && <span className="text-xs text-slate-400">{t.user_name}</span>}
                      <span className="text-xs text-slate-400">{timeAgo(t.created_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAcceptTicket(t.id)}
                    disabled={acceptingId === t.id}
                    className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {acceptingId === t.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Accept'
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar: Search + Status filter */}
      <div className="flex items-center gap-3 px-6 pb-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400 font-medium">{filteredTickets.length} tickets</span>
      </div>

      {/* Table */}
      <div className="flex-1 mx-6 mb-4 bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
        <TicketTable
          tickets={filteredTickets}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onStatusChange={handleTableStatusChange}
          onPriorityChange={handleTablePriorityChange}
          loading={loadingTickets}
        />
      </div>
    </div>
  );
}
