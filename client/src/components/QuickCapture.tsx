import React, { useState } from 'react'
import { Command, Plus, Calendar, StickyNote, CheckSquare, Users } from 'lucide-react'

export function QuickCapture() {
  const [input, setInput] = useState('')
  const [showCommands, setShowCommands] = useState(false)

  const commands = [
    { key: '/task', icon: CheckSquare, label: 'Create Task', description: 'Add a new task' },
    { key: '/note', icon: StickyNote, label: 'Add Note', description: 'Create a club note' },
    { key: '/remind', icon: Calendar, label: 'Set Reminder', description: 'Set a reminder' },
    { key: '/club', icon: Users, label: 'Club Note', description: 'Open club notepad' }
  ]

  const handleInputChange = (value: string) => {
    setInput(value)
    setShowCommands(value.startsWith('/'))
  }

  return (
    <div className="relative">
      <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-4">
        <div className="flex items-center space-x-3">
          <Command className="h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Quick capture: Type '/' for commands or just start typing..."
            className="flex-1 text-sm outline-none placeholder-gray-500"
          />
          <button className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            Add
          </button>
        </div>

        {showCommands && (
          <div className="mt-3 border-t border-gray-200 pt-3">
            <div className="grid grid-cols-2 gap-2">
              {commands.map((command) => {
                const Icon = command.icon
                return (
                  <button
                    key={command.key}
                    className="flex items-center space-x-2 p-2 text-left hover:bg-gray-50 rounded-md"
                    onClick={() => setInput(command.key + ' ')}
                  >
                    <Icon className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{command.label}</p>
                      <p className="text-xs text-gray-500">{command.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}