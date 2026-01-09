import React, { useState, useEffect } from 'react'
import { X, Plus, Check, AlertCircle } from 'lucide-react'
import { DimensionalTargetsService } from '../services/api'

interface DimensionalTargetModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  mode: 'club' | 'launch'
  entityId: number // club_id or launch_id
  entityName: string // club name or launch name
  activityName?: string
  editTarget?: {
    id: number
    area_id: number | null
    day_type_id: number | null
    format_id: number | null
    target_meetups: number
    target_revenue: number
  } | null
}

interface DimensionOption {
  id: number
  name: string
  city_name?: string
  is_custom?: boolean
}

export default function DimensionalTargetModal({
  isOpen,
  onClose,
  onSave,
  mode,
  entityId,
  entityName,
  activityName,
  editTarget
}: DimensionalTargetModalProps) {
  // Form state
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null)
  const [areaId, setAreaId] = useState<number | null>(null)
  const [dayTypeId, setDayTypeId] = useState<number | null>(null)
  const [formatId, setFormatId] = useState<number | null>(null)
  const [targetMeetups, setTargetMeetups] = useState<number>(0)
  const [targetRevenue, setTargetRevenue] = useState<number>(0)

  // Apply to all checkboxes (Area is always required, so no applyToAllAreas)
  const [applyToAllDays, setApplyToAllDays] = useState(true)
  const [applyToAllFormats, setApplyToAllFormats] = useState(true)

  // Dimension options
  const [cities, setCities] = useState<DimensionOption[]>([])
  const [areas, setAreas] = useState<DimensionOption[]>([])
  const [dayTypes, setDayTypes] = useState<DimensionOption[]>([])
  const [formats, setFormats] = useState<DimensionOption[]>([])

  // Loading and error states
  const [loading, setLoading] = useState(false)
  const [loadingAreas, setLoadingAreas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Custom value input states
  const [showCustomArea, setShowCustomArea] = useState(false)
  const [showCustomDayType, setShowCustomDayType] = useState(false)
  const [showCustomFormat, setShowCustomFormat] = useState(false)
  const [customAreaValue, setCustomAreaValue] = useState('')
  const [customDayTypeValue, setCustomDayTypeValue] = useState('')
  const [customFormatValue, setCustomFormatValue] = useState('')

  // Load dimension options
  useEffect(() => {
    if (isOpen) {
      loadDimensions()
    }
  }, [isOpen])

  // Load areas when city changes
  useEffect(() => {
    if (selectedCityId) {
      loadAreasForCity(selectedCityId)
    } else {
      setAreas([])
    }
  }, [selectedCityId])

  // Populate form when editing
  useEffect(() => {
    if (editTarget) {
      setAreaId(editTarget.area_id)
      setDayTypeId(editTarget.day_type_id)
      setFormatId(editTarget.format_id)
      setTargetMeetups(editTarget.target_meetups)
      setTargetRevenue(editTarget.target_revenue)
      // Area is always required, so no applyToAllAreas
      setApplyToAllDays(editTarget.day_type_id === null)
      setApplyToAllFormats(editTarget.format_id === null)
    } else {
      resetForm()
    }
  }, [editTarget])

  const loadDimensions = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await DimensionalTargetsService.getAllDimensions()
      if (response.success) {
        setCities(response.dimensions.city.values.map(c => ({
          id: c.id,
          name: c.city_name || c.name
        })))
        setDayTypes(response.dimensions.day_type.values.map(d => ({
          id: d.id,
          name: d.day_type || d.name,
          is_custom: d.is_custom
        })))
        setFormats(response.dimensions.format.values.map(f => ({
          id: f.id,
          name: f.format_name || f.name,
          is_custom: f.is_custom
        })))
      }
    } catch (err) {
      setError('Failed to load dimension options')
      console.error('Error loading dimensions:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadAreasForCity = async (cityId: number) => {
    try {
      setLoadingAreas(true)
      const response = await DimensionalTargetsService.getAreasByCity(cityId)
      if (response.success) {
        setAreas(response.areas.map(a => ({
          id: a.id,
          name: a.name,
          is_custom: a.is_custom
        })))
      }
    } catch (err) {
      console.error('Error loading areas:', err)
      setAreas([])
    } finally {
      setLoadingAreas(false)
    }
  }

  const resetForm = () => {
    setSelectedCityId(null)
    setAreaId(null)
    setDayTypeId(null)
    setFormatId(null)
    setTargetMeetups(0)
    setTargetRevenue(0)
    // Area is always required, so no applyToAllAreas
    setApplyToAllDays(true)
    setApplyToAllFormats(true)
    setShowCustomArea(false)
    setShowCustomDayType(false)
    setShowCustomFormat(false)
    setCustomAreaValue('')
    setCustomDayTypeValue('')
    setCustomFormatValue('')
  }

  const handleAddCustomArea = async () => {
    if (!customAreaValue.trim() || !selectedCityId) return

    try {
      const response = await DimensionalTargetsService.addCustomDimensionValue(
        'area',
        customAreaValue.trim(),
        selectedCityId
      )
      if (response.success) {
        // Reload areas for the city
        await loadAreasForCity(selectedCityId)
        setAreaId(response.value.id)
        setCustomAreaValue('')
        setShowCustomArea(false)
      }
    } catch (err) {
      console.error('Error adding custom area:', err)
    }
  }

  const handleAddCustomDayType = async () => {
    if (!customDayTypeValue.trim()) return

    try {
      const response = await DimensionalTargetsService.addCustomDimensionValue(
        'day_type',
        customDayTypeValue.trim()
      )
      if (response.success) {
        await loadDimensions()
        setDayTypeId(response.value.id)
        setCustomDayTypeValue('')
        setShowCustomDayType(false)
      }
    } catch (err) {
      console.error('Error adding custom day type:', err)
    }
  }

  const handleAddCustomFormat = async () => {
    if (!customFormatValue.trim()) return

    try {
      const response = await DimensionalTargetsService.addCustomDimensionValue(
        'format',
        customFormatValue.trim()
      )
      if (response.success) {
        await loadDimensions()
        setFormatId(response.value.id)
        setCustomFormatValue('')
        setShowCustomFormat(false)
      }
    } catch (err) {
      console.error('Error adding custom format:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation - Area is required
    if (!areaId) {
      setError('Please select a city and area. Area is required for all targets.')
      return
    }

    if (targetMeetups <= 0) {
      setError('Target meetups must be greater than 0')
      return
    }

    try {
      setSaving(true)

      const targetData = {
        area_id: areaId, // Required
        day_type_id: applyToAllDays ? null : dayTypeId,
        format_id: applyToAllFormats ? null : formatId,
        target_meetups: targetMeetups,
        target_revenue: targetRevenue
      }

      if (editTarget) {
        // Update existing target
        if (mode === 'club') {
          await DimensionalTargetsService.updateClubDimensionalTarget(
            entityId,
            editTarget.id,
            targetData
          )
        } else {
          await DimensionalTargetsService.updateLaunchDimensionalTarget(
            entityId,
            editTarget.id,
            targetData
          )
        }
      } else {
        // Create new target
        if (mode === 'club') {
          await DimensionalTargetsService.createClubDimensionalTarget(entityId, targetData)
        } else {
          await DimensionalTargetsService.createLaunchDimensionalTarget(entityId, targetData)
        }
      }

      onSave()
      onClose()
      resetForm()
    } catch (err: any) {
      setError(err.message || 'Failed to save target')
      console.error('Error saving target:', err)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {editTarget ? 'Edit' : 'Add'} Dimensional Target
            </h2>
            <p className="text-sm text-gray-600">
              {entityName} {activityName ? `(${activityName})` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading dimensions...</div>
          ) : (
            <div className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-700">{error}</span>
                </div>
              )}

              {/* City Dropdown - Required to select Area */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedCityId || ''}
                  onChange={(e) => {
                    setSelectedCityId(e.target.value ? Number(e.target.value) : null)
                    setAreaId(null)
                  }}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select City</option>
                  {cities.map(city => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                  ))}
                </select>
              </div>

              {/* Area Dropdown with Custom Option - REQUIRED */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Area <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center space-x-2">
                  <select
                    value={areaId || ''}
                    onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : null)}
                    disabled={!selectedCityId || loadingAreas}
                    required
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="">
                      {!selectedCityId
                        ? 'Select city first'
                        : loadingAreas
                        ? 'Loading areas...'
                        : 'Select Area'
                      }
                    </option>
                    {areas.map(area => (
                      <option key={area.id} value={area.id}>
                        {area.name} {area.is_custom ? '(custom)' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowCustomArea(!showCustomArea)}
                    disabled={!selectedCityId}
                    className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {showCustomArea && (
                  <div className="mt-2 flex items-center space-x-2">
                    <input
                      type="text"
                      value={customAreaValue}
                      onChange={(e) => setCustomAreaValue(e.target.value)}
                      placeholder="Enter custom area name"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomArea}
                      className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Day Type Dropdown with Custom Option */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Day Type
                  </label>
                  <label className="flex items-center space-x-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={applyToAllDays}
                      onChange={(e) => {
                        setApplyToAllDays(e.target.checked)
                        if (e.target.checked) {
                          setDayTypeId(null)
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Apply to all days</span>
                  </label>
                </div>

                {!applyToAllDays && (
                  <>
                    <div className="flex items-center space-x-2">
                      <select
                        value={dayTypeId || ''}
                        onChange={(e) => setDayTypeId(e.target.value ? Number(e.target.value) : null)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select Day Type</option>
                        {dayTypes.map(dayType => (
                          <option key={dayType.id} value={dayType.id}>
                            {dayType.name} {dayType.is_custom ? '(custom)' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowCustomDayType(!showCustomDayType)}
                        className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    {showCustomDayType && (
                      <div className="mt-2 flex items-center space-x-2">
                        <input
                          type="text"
                          value={customDayTypeValue}
                          onChange={(e) => setCustomDayTypeValue(e.target.value)}
                          placeholder="Enter custom day type"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomDayType}
                          className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Format Dropdown with Custom Option */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Format
                  </label>
                  <label className="flex items-center space-x-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={applyToAllFormats}
                      onChange={(e) => {
                        setApplyToAllFormats(e.target.checked)
                        if (e.target.checked) {
                          setFormatId(null)
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Apply to all formats</span>
                  </label>
                </div>

                {!applyToAllFormats && (
                  <>
                    <div className="flex items-center space-x-2">
                      <select
                        value={formatId || ''}
                        onChange={(e) => setFormatId(e.target.value ? Number(e.target.value) : null)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select Format</option>
                        {formats.map(format => (
                          <option key={format.id} value={format.id}>
                            {format.name} {format.is_custom ? '(custom)' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowCustomFormat(!showCustomFormat)}
                        className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    {showCustomFormat && (
                      <div className="mt-2 flex items-center space-x-2">
                        <input
                          type="text"
                          value={customFormatValue}
                          onChange={(e) => setCustomFormatValue(e.target.value)}
                          placeholder="Enter custom format"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomFormat}
                          className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Target Meetups */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Meetups <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={targetMeetups || ''}
                  onChange={(e) => setTargetMeetups(parseInt(e.target.value) || 0)}
                  placeholder="e.g., 3"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Number of meetups per month for this dimension combination</p>
              </div>

              {/* Target Revenue */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Revenue (optional)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="number"
                    min="0"
                    value={targetRevenue || ''}
                    onChange={(e) => setTargetRevenue(parseInt(e.target.value) || 0)}
                    placeholder="e.g., 30000"
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Revenue target per month (in paisa internally)</p>
              </div>

              {/* Preview */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Target Summary</h4>
                <p className="text-sm text-blue-800">
                  <span className="font-medium">{targetMeetups} meetups</span>
                  {targetRevenue > 0 && (
                    <span> and <span className="font-medium">₹{targetRevenue.toLocaleString()}</span></span>
                  )}
                  {' in '}
                  <span className="font-medium">
                    {areaId
                      ? `${areas.find(a => a.id === areaId)?.name || 'Selected Area'}, ${cities.find(c => c.id === selectedCityId)?.name || ''}`
                      : '(select area)'
                    }
                  </span>
                  {' on '}
                  <span className="font-medium">{applyToAllDays ? 'All Days' : (dayTypes.find(d => d.id === dayTypeId)?.name || 'Selected Days')}</span>
                  {' for '}
                  <span className="font-medium">{applyToAllFormats ? 'All Formats' : (formats.find(f => f.id === formatId)?.name || 'Selected Format')}</span>
                </p>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={() => {
              onClose()
              resetForm()
            }}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || targetMeetups <= 0 || !areaId}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : editTarget ? 'Update Target' : 'Add Target'}
          </button>
        </div>
      </div>
    </div>
  )
}
