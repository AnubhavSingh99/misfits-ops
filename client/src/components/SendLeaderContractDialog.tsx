import React, { useEffect, useMemo, useState } from 'react'
import { X, FileText, RefreshCw, AlertTriangle, Send } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/start-club`
  : '/api/start-club'

interface DocusealTemplate {
  id: number
  slug: string
  name: string
  updated_at: string
}

interface ClubForLeader {
  club_uuid: string
  name: string
}

interface LeaderSplitRow {
  split_id: number
  split_name: string
  percent: number
}

interface ExistingContract {
  id: number
  status: 'pending' | 'completed' | 'declined' | 'expired' | 'superseded' | 'voided'
  signing_url?: string
  created_at?: string
}

interface SendResultData {
  signing_url?: string
  id?: number
  status?: string
}

interface Props {
  open: boolean
  leaderUserPk: number | null
  leaderName: string | null
  onClose: () => void
  onSent?: (result: SendResultData) => void
}

const SendLeaderContractDialog: React.FC<Props> = ({ open, leaderUserPk, leaderName, onClose, onSent }) => {
  const [templates, setTemplates] = useState<DocusealTemplate[]>([])
  const [templateID, setTemplateID] = useState('')
  const [clubs, setClubs] = useState<ClubForLeader[]>([])
  const [clubUUID, setClubUUID] = useState('')
  const [supersedeReason, setSupersedeReason] = useState('')
  const [splits, setSplits] = useState<LeaderSplitRow[]>([])
  const [splitsLoading, setSplitsLoading] = useState(false)
  const [splitsError, setSplitsError] = useState<string | null>(null)
  const [existing, setExisting] = useState<ExistingContract | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SendResultData | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!open) {
      setTemplateID(''); setClubUUID('')
      setSupersedeReason(''); setSplits([]); setExisting(null); setError(null); setResult(null)
      return
    }
    fetch(`${API_BASE}/admin/leader-contracts/templates`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) throw new Error(d.error || 'failed to load templates')
        setTemplates(d.data?.templates || [])
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [open])

  useEffect(() => {
    if (!open || !leaderUserPk) {
      setClubs([])
      return
    }
    fetch(`${API_BASE}/admin/leader-contracts/clubs-for-leader/${leaderUserPk}`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) throw new Error(d.error || 'failed to load clubs')
        const list: ClubForLeader[] = d.data?.clubs || []
        setClubs(list)
        if (list.length === 1) setClubUUID(list[0].club_uuid)
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [open, leaderUserPk])

  useEffect(() => {
    if (!open || !leaderUserPk || !clubUUID) {
      setSplits([]); setSplitsError(null)
      return
    }
    let cancelled = false
    setSplitsLoading(true); setSplitsError(null)
    const sp = new URLSearchParams({ leader_pk: String(leaderUserPk), club_uuid: clubUUID })
    fetch(`${API_BASE}/admin/leader-contracts/leader-splits?${sp.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (!d.success) throw new Error(d.error || 'failed to load splits')
        setSplits(d.data?.splits || [])
      })
      .catch(e => {
        if (cancelled) return
        setSplitsError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => { if (!cancelled) setSplitsLoading(false) })
    return () => { cancelled = true }
  }, [open, leaderUserPk, clubUUID, refreshTick])

  useEffect(() => {
    if (!open || !leaderUserPk || !clubUUID) {
      setExisting(null)
      return
    }
    const sp = new URLSearchParams({ leader_pk: String(leaderUserPk), club_uuid: clubUUID, limit: '5' })
    fetch(`${API_BASE}/admin/leader-contracts/list?${sp.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) return
        const list = d.data?.contracts || []
        const active = list.find((c: ExistingContract) => c.status === 'pending' || c.status === 'completed')
        setExisting(active || null)
      })
      .catch(() => {})
  }, [open, leaderUserPk, clubUUID, refreshTick])

  const needsSupersedeReason = existing?.status === 'completed'

  const club = useMemo(() => clubs.find(c => c.club_uuid === clubUUID) || null, [clubs, clubUUID])

  if (!open) return null

  const handleSend = async () => {
    setError(null)
    if (!leaderUserPk) { setError('leader is required'); return }
    if (!clubUUID) { setError('pick a club'); return }
    if (!templateID) { setError('pick a template'); return }
    if (splits.length === 0) {
      setError('leader is not in any active revenue split for this club; configure splits first')
      return
    }
    if (needsSupersedeReason && !supersedeReason.trim()) {
      setError('supersede reason is required when superseding a signed contract')
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        leader_user_pk: leaderUserPk,
        club_uuid: clubUUID,
        template_id: templateID,
      }
      if (supersedeReason.trim()) body.supersede_reason = supersedeReason.trim()
      const res = await fetch(`${API_BASE}/admin/leader-contracts/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || `HTTP ${res.status}`)
      setResult(d.data)
      onSent?.(d.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'send failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="h-4 w-4 text-purple-600" />
            Send Leader Contract via Docuseal
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs text-slate-600">
            Leader: <span className="font-medium text-slate-800">{leaderName || `#${leaderUserPk}`}</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Club</label>
            <select
              value={clubUUID}
              onChange={e => setClubUUID(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md"
              disabled={clubs.length === 0}
            >
              <option value="">— select a club —</option>
              {clubs.map(c => (
                <option key={c.club_uuid} value={c.club_uuid}>{c.name}</option>
              ))}
            </select>
            {clubs.length === 0 && (
              <p className="text-[10px] text-slate-500 mt-1">
                This leader has no active clubs in Misfits yet. Create the club first.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Docuseal Template</label>
            <select
              value={templateID}
              onChange={e => setTemplateID(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md"
            >
              <option value="">— select template —</option>
              {templates.map(t => (
                <option key={t.id} value={String(t.id)}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-700">
                Revenue splits {club ? `for ${club.name}` : ''}
              </span>
              <button
                type="button"
                onClick={() => setRefreshTick(t => t + 1)}
                disabled={!clubUUID || splitsLoading}
                className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-900 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${splitsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            {!clubUUID ? (
              <p className="text-[11px] text-slate-500">Pick a club to load splits.</p>
            ) : splitsLoading ? (
              <p className="text-[11px] text-slate-500">Loading…</p>
            ) : splitsError ? (
              <p className="text-[11px] text-red-600">{splitsError}</p>
            ) : splits.length === 0 ? (
              <div className="flex items-start gap-2 text-[11px] text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>Leader is not in any active split for this club. Configure splits in the operations system before sending.</span>
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="font-medium py-1">Type of Meetup</th>
                    <th className="font-medium py-1 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {splits.map(s => (
                    <tr key={s.split_id} className="border-t border-slate-200">
                      <td className="py-1 text-slate-700">{s.split_name}</td>
                      <td className="py-1 text-right text-slate-700">{s.percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {existing && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <div>
                  This leader has an existing <strong>{existing.status}</strong> contract for this club
                  {existing.created_at ? ` (created ${new Date(existing.created_at).toLocaleDateString()})` : ''}.
                  Sending will {existing.status === 'pending' ? 'void and replace' : 'supersede'} it.
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Supersede reason
              {needsSupersedeReason ? ' (required)' : ' (only required if a signed contract is being replaced)'}
            </label>
            <input
              type="text"
              value={supersedeReason}
              onChange={e => setSupersedeReason(e.target.value)}
              placeholder="e.g. updated revenue terms"
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md"
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-[11px] text-red-700">
              {error}
            </div>
          )}

          {result?.signing_url && (
            <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-md text-[11px] text-green-800">
              Contract sent. <a href={result.signing_url} target="_blank" rel="noopener noreferrer" className="underline font-medium">Open signing link</a>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2 bg-slate-50">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleSend}
              disabled={submitting || !clubUUID || !templateID || splits.length === 0}
              className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send className="h-3 w-3" />
              {submitting ? 'Sending…' : 'Send Contract'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default SendLeaderContractDialog
