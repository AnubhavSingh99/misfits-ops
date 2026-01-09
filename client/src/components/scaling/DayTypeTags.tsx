// =====================================================
// DAY TYPE TAGS COMPONENT
// Shows day tags below target name with full day type name
// =====================================================

interface DayTypeTagsProps {
  dayTypeName?: string | null
  dayTypeId?: number | null
  compact?: boolean
}

// Day type color mapping (subtle, muted colors) - lowercase keys for case-insensitive lookup
const DAY_COLORS: Record<string, { bg: string; text: string }> = {
  'monday': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'tuesday': { bg: 'bg-purple-100', text: 'text-purple-700' },
  'wednesday': { bg: 'bg-green-100', text: 'text-green-700' },
  'thursday': { bg: 'bg-orange-100', text: 'text-orange-700' },
  'friday': { bg: 'bg-pink-100', text: 'text-pink-700' },
  'saturday': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'sunday': { bg: 'bg-red-100', text: 'text-red-700' },
  'weekday': { bg: 'bg-slate-100', text: 'text-slate-700' },
  'weekend': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'all days': { bg: 'bg-gray-100', text: 'text-gray-600' },
}

// Capitalize first letter of each word
const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()

export function DayTypeTags({ dayTypeName, dayTypeId, compact = false }: DayTypeTagsProps) {
  // Don't show if no day type or if it's "All Days" (case-insensitive)
  if (!dayTypeName || dayTypeName.toLowerCase() === 'all days') {
    return null
  }

  // Handle multiple days (comma-separated)
  const days = dayTypeName.split(',').map(d => d.trim())

  return (
    <div className={`flex flex-wrap gap-0.5 ${compact ? 'mt-0.5' : 'mt-1'}`}>
      {days.map((day, index) => {
        const dayLower = day.toLowerCase()
        const colors = DAY_COLORS[dayLower] || { bg: 'bg-gray-100', text: 'text-gray-600' }
        // Show full day name, capitalized
        const displayName = capitalize(day)

        return (
          <span
            key={`${day}-${index}`}
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium
              ${colors.bg} ${colors.text}`}
          >
            {displayName}
          </span>
        )
      })}
    </div>
  )
}

export default DayTypeTags
