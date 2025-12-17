import React, { useState } from 'react'
import { Search, Edit3, MapPin, Star, Users } from 'lucide-react'

export function ClubNotes() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClub, setSelectedClub] = useState<string | null>('mumbai-photography-3')

  const clubs = [
    {
      id: 'mumbai-photography-3',
      name: 'Mumbai Photography #3',
      activity: 'Photography',
      city: 'Mumbai',
      health: 'red' as const,
      note: 'Venue is great but expensive. Leader Amit is solid but needs motivation. Consider splitting into 2 batches. Price can go to ₹600. Competition from Adidas Running Club nearby.\n\nVenue cancelled for tomorrow - need immediate replacement. Priya is handling this. Should look for more stable venue options in Bandra area.'
    },
    {
      id: 'delhi-photography-3',
      name: 'Delhi Photography #3',
      activity: 'Photography',
      city: 'Delhi',
      health: 'yellow' as const,
      note: 'Leader might quit - personal issues. Start finding backup. Venue has parking problems. Members love themed shoots. Instagram engagement very high.\n\nPotential solutions:\n- Co-leader model\n- Better parking arrangements\n- Theme-based pricing'
    },
    {
      id: 'bangalore-running-2',
      name: 'Bangalore Running #2',
      activity: 'Running',
      city: 'Bangalore',
      health: 'green' as const,
      note: 'Excellent performance this month. Leader is very engaged. Great venue at Cubbon Park. Members are super active on WhatsApp.\n\nScaling opportunity - can increase capacity from 20 to 30. High waitlist demand.'
    }
  ]

  const filteredClubs = clubs.filter(club =>
    club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    club.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    club.activity.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const selectedClubData = clubs.find(club => club.id === selectedClub)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-96">
      {/* Club List */}
      <div className="lg:col-span-1 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search clubs..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filteredClubs.map((club) => (
            <button
              key={club.id}
              onClick={() => setSelectedClub(club.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedClub === club.id
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{club.name}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs text-gray-500">{club.activity}</span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500">{club.city}</span>
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full mt-1 ${
                  club.health === 'green' ? 'bg-green-500' :
                  club.health === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Note Editor */}
      <div className="lg:col-span-2">
        {selectedClubData ? (
          <div className="bg-white border border-gray-200 rounded-lg h-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h3 className="font-semibold text-gray-900">{selectedClubData.name}</h3>
                <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
                  <div className="flex items-center space-x-1">
                    <MapPin className="h-3 w-3" />
                    <span>{selectedClubData.city}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Users className="h-3 w-3" />
                    <span>{selectedClubData.activity}</span>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${
                    selectedClubData.health === 'green' ? 'bg-green-500' :
                    selectedClubData.health === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                </div>
              </div>
              <button className="flex items-center space-x-1 px-3 py-1 text-blue-600 hover:bg-blue-50 rounded-md">
                <Edit3 className="h-4 w-4" />
                <span>Edit</span>
              </button>
            </div>

            <div className="p-4 h-full">
              <textarea
                value={selectedClubData.note}
                readOnly
                className="w-full h-64 p-3 text-sm text-gray-700 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add your notes about this club..."
              />
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg h-full flex items-center justify-center">
            <p className="text-gray-500">Select a club to view notes</p>
          </div>
        )}
      </div>
    </div>
  )
}