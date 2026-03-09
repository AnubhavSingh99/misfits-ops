// Support API Service — proxied through ops backend

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const SUPPORT_BASE = `${API_URL}/api/support`;

async function supportRequest<T>(
  method: string,
  path: string,
  body?: Record<string, any>
): Promise<T> {
  const res = await fetch(`${SUPPORT_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }));
    throw { status: res.status, ...err };
  }
  return res.json();
}

// --- Types ---

export interface SupportTicket {
  id: number;
  ticket_number: string;
  subject: string;
  description?: string;
  status: string;
  priority: string;
  category_name?: string;
  created_at: string;
  updated_at: string;
  assigned_to?: number;
  assigned_agent_name?: string;
  user_name?: string;
  user_phone?: string;
  user_note?: string;
  unread_count: number;
  last_message?: string;
  last_message_at?: string;
  last_message_sender?: string;
}

export interface SupportMessage {
  id: number;
  content: string;
  sender_name?: string;
  sender_type: 'USER' | 'AGENT' | 'SYSTEM';
  message_type: string;
  created_at: string;
  is_read: boolean;
  file_id?: number;
  file_url?: string;
  file_name?: string;
}

export interface SupportStats {
  waiting_count: number;
  open_count: number;
  in_progress_count: number;
  resolved_count: number;
  avg_resolution_hours: number;
}

// --- Agent Endpoints ---

export function getAgentTickets(params?: {
  status?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}): Promise<{ tickets: SupportTicket[] }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.priority) qs.set('priority', params.priority);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const q = qs.toString();
  return supportRequest('GET', `/agent/tickets${q ? `?${q}` : ''}`);
}

export function getAgentStats(): Promise<SupportStats> {
  return supportRequest('GET', '/agent/stats');
}

export function updateTicketDetails(
  id: number,
  data: { subject?: string; description?: string }
): Promise<{ ok: boolean }> {
  return supportRequest('PATCH', `/agent/tickets/${id}`, data);
}

export function updateTicketStatus(
  id: number,
  status: string
): Promise<{ ok: boolean }> {
  return supportRequest('PATCH', `/agent/tickets/${id}/status`, { status });
}

export function updateTicketPriority(
  id: number,
  priority: string
): Promise<{ ok: boolean }> {
  return supportRequest('PATCH', `/agent/tickets/${id}/priority`, { priority });
}

export function acceptTicket(id: number): Promise<{ ok: boolean }> {
  return supportRequest('POST', `/agent/tickets/${id}/accept`);
}

export function resolveTicket(
  id: number,
  resolution_note: string
): Promise<{ ok: boolean }> {
  return supportRequest('POST', `/agent/tickets/${id}/resolve`, { resolution_note });
}

// --- Ticket detail & messages ---

export function getTicketDetail(
  id: number
): Promise<{ ticket: SupportTicket; messages: SupportMessage[] }> {
  return supportRequest('GET', `/tickets/${id}`);
}

export function sendMessage(
  ticketId: number,
  data: { content: string; message_type?: string; file_id?: number }
): Promise<{ message: SupportMessage }> {
  return supportRequest('POST', `/tickets/${ticketId}/messages`, data);
}

export function markRead(ticketId: number): Promise<void> {
  return supportRequest('POST', `/tickets/${ticketId}/messages/read`, {});
}

// --- File upload ---

export async function uploadFile(contentType: string): Promise<{ fileId: number; uploadUrl: string }> {
  const data = await supportRequest<any>('POST', '/file/put-url', { content_type: contentType });
  return {
    fileId: Number(data.fileId ?? data.file_id),
    uploadUrl: data.s3Url ?? data.s3_url,
  };
}

export async function uploadToS3(url: string, file: File): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) throw new Error('Failed to upload file');
}

// --- SSE for incoming requests ---

export function getAgentEventsUrl(): string {
  return `${SUPPORT_BASE}/agent/events`;
}

// --- WebSocket ---

let wsInfoCache: { wsBase: string; token: string } | null = null;

async function getWSInfo(): Promise<{ wsBase: string; token: string }> {
  if (wsInfoCache) return wsInfoCache;
  const res = await fetch(`${SUPPORT_BASE}/ws-info`);
  wsInfoCache = await res.json();
  return wsInfoCache!;
}

export async function getWSUrl(ticketId: number): Promise<string> {
  const { wsBase, token } = await getWSInfo();
  return `${wsBase}/ws/support/chat?token=${token}&ticket_id=${ticketId}`;
}
