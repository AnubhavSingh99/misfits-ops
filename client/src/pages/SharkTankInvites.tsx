import React, { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Search, Check, Circle } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

interface Invite {
  id: number
  club_name: string
  activity_name: string
  team: string
  leader_name: string
  leader_phone: string
  poc: string
  status: 'done' | 'not_done'
}

function buildMessage(firstName: string, poc: string): string {
  return `Hey ${firstName} ❤️

We're doing something special… *Misfits is coming on Shark Tank India Season 5*, and we're hosting a community screening watch party.

I personally wanted to invite you.

You're one of the people who actually built Misfits in real life. Every meetup you hosted, every awkward first-time member you welcomed, every inside joke your club created… that's what got us here.

So this night really belongs to you and your club.

Would love for you to come celebrate together with all the other leaders.🦈✨

📅 Date: 24th Feb, Tuesday
📍 Venue: Beerlin, Gurgaon
🕒 Time: 7:30pm Onwards

– ${poc === 'CD' ? 'Chaitanya' : poc}
Co-Founder, Misfits`
}

const teamColors: Record<string, { bg: string; text: string; border: string }> = {
  Blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  Green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  Yellow: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
}

export default function SharkTankInvites() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [search, setSearch] = useState('')
  const [pocFilter, setPocFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const fetchInvites = async () => {
    try {
      const res = await fetch(`${API_BASE}/shark-tank/invites`)
      const data = await res.json()
      if (data.success) {
        setInvites(data.data)
        // Auto-seed if empty
        if (data.data.length === 0) {
          await seedData()
        }
      }
    } catch (err) {
      console.error('Failed to fetch invites:', err)
    } finally {
      setLoading(false)
    }
  }

  const seedData = async () => {
    setSeeding(true)
    try {
      const res = await fetch(`${API_BASE}/shark-tank/invites/seed`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        await fetchInvites()
      }
    } catch (err) {
      console.error('Failed to seed data:', err)
    } finally {
      setSeeding(false)
    }
  }

  const toggleStatus = async (invite: Invite) => {
    const newStatus = invite.status === 'done' ? 'not_done' : 'done'
    // Optimistic update
    setInvites(prev => prev.map(i => i.id === invite.id ? { ...i, status: newStatus } : i))
    try {
      await fetch(`${API_BASE}/shark-tank/invites/${invite.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
    } catch (err) {
      // Revert on error
      setInvites(prev => prev.map(i => i.id === invite.id ? { ...i, status: invite.status } : i))
      console.error('Failed to update status:', err)
    }
  }

  const sendInvite = (invite: Invite) => {
    const firstName = invite.leader_name.split(' ')[0] || invite.leader_name
    const msg = buildMessage(firstName, invite.poc)
    const digits = invite.leader_phone.replace(/\D/g, '')
    window.location.href = `whatsapp://send?phone=${digits}&text=${encodeURIComponent(msg)}`
  }

  useEffect(() => {
    fetchInvites()
  }, [])

  const filtered = useMemo(() => {
    return invites.filter(inv => {
      if (pocFilter && inv.poc !== pocFilter) return false
      if (statusFilter && inv.status !== statusFilter) return false
      if (search) {
        const s = search.toLowerCase()
        return (
          inv.club_name.toLowerCase().includes(s) ||
          inv.leader_name.toLowerCase().includes(s) ||
          inv.activity_name.toLowerCase().includes(s) ||
          inv.leader_phone.includes(s)
        )
      }
      return true
    })
  }, [invites, search, pocFilter, statusFilter])

  const stats = useMemo(() => {
    const total = invites.length
    const done = invites.filter(i => i.status === 'done').length
    const byPoc: Record<string, { total: number; done: number }> = {}
    invites.forEach(i => {
      if (!byPoc[i.poc]) byPoc[i.poc] = { total: 0, done: 0 }
      byPoc[i.poc].total++
      if (i.status === 'done') byPoc[i.poc].done++
    })
    return { total, done, byPoc }
  }, [invites])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading invites...</span>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🦈 Shark Tank Watch Party Invites</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Click "Send Invite" to open WhatsApp with prefilled message (emojis included)
          </p>
        </div>
        <button
          onClick={seedData}
          disabled={seeding}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${seeding ? 'animate-spin' : ''}`} />
          {seeding ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex gap-3 mb-4">
        <div className="bg-white rounded-lg px-4 py-2 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500">Total</div>
          <div className="text-lg font-semibold">{stats.total}</div>
        </div>
        <div className="bg-green-50 rounded-lg px-4 py-2 shadow-sm border border-green-100">
          <div className="text-xs text-green-600">Done</div>
          <div className="text-lg font-semibold text-green-700">{stats.done}</div>
        </div>
        <div className="bg-gray-50 rounded-lg px-4 py-2 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500">Remaining</div>
          <div className="text-lg font-semibold text-gray-700">{stats.total - stats.done}</div>
        </div>
        {Object.entries(stats.byPoc).sort(([a], [b]) => b.localeCompare(a)).map(([poc, s]) => (
          <div key={poc} className="bg-white rounded-lg px-4 py-2 shadow-sm border border-gray-100">
            <div className="text-xs text-gray-500">{poc}</div>
            <div className="text-sm font-medium">{s.done}/{s.total}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, club, activity..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
          />
        </div>
        <select
          value={pocFilter}
          onChange={e => setPocFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20"
        >
          <option value="">All POCs</option>
          <option value="Shashwat">Shashwat (Blue)</option>
          <option value="Saurabh">Saurabh (Green)</option>
          <option value="CD">CD (Yellow)</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20"
        >
          <option value="">All Status</option>
          <option value="not_done">Not Done</option>
          <option value="done">Done</option>
        </select>
        <span className="flex items-center text-xs text-gray-500 ml-1">
          {filtered.length} of {invites.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-8">#</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Club</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Activity</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Team</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Leader</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Invite</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">POC</th>
                <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, idx) => {
                const tc = teamColors[inv.team] || teamColors.Green
                return (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="py-2 px-3 text-xs text-gray-400">{idx + 1}</td>
                    <td className="py-2 px-3 text-sm font-medium text-gray-900 max-w-[200px] truncate">{inv.club_name}</td>
                    <td className="py-2 px-3 text-sm text-gray-600">{inv.activity_name}</td>
                    <td className="py-2 px-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${tc.bg} ${tc.text}`}>
                        {inv.team}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm text-gray-800">{inv.leader_name}</td>
                    <td className="py-2 px-3">
                      <a
                        href={`https://wa.me/${inv.leader_phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-600 hover:underline"
                      >
                        {inv.leader_phone}
                      </a>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => sendInvite(inv)}
                        className="px-3 py-1 text-xs font-semibold rounded-full bg-green-500 hover:bg-green-600 text-white transition-colors"
                      >
                        Send Invite
                      </button>
                    </td>
                    <td className="py-2 px-3 text-sm text-gray-600">{inv.poc}</td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => toggleStatus(inv)}
                        className={`p-1 rounded-full transition-colors ${
                          inv.status === 'done'
                            ? 'bg-green-100 text-green-600 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                        title={inv.status === 'done' ? 'Mark as Not Done' : 'Mark as Done'}
                      >
                        {inv.status === 'done' ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
