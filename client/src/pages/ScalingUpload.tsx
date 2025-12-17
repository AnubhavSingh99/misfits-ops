import React, { useState } from 'react'
import { Upload, Download, FileText, CheckCircle, AlertCircle, ArrowRight, Target, Building2, PlusCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// Upload Type Definitions
type UploadType = 'working-sheet' | 'existing-clubs' | 'new-clubs'

interface WorkingSheetRow {
  activity: string
  city: string
  area: string
  current_meetups: string
  target_meetups: string
  target_attendees: string
  poc_assigned: string
  timeline: string
}

interface ExistingClubsRow {
  club_id: string
  club_name: string
  activity: string
  city: string
  area: string
  current_meetups: string
  target_meetups: string
  target_revenue: string
  target_attendees: string
  poc_assigned: string
}

interface NewClubsRow {
  club_name: string
  activity: string
  city: string
  area: string
  target_meetups: string
  target_revenue: string
  target_attendees: string
  target_launch_date: string
  poc_assigned: string
  leader_name?: string
  venue_status?: string
  notes?: string
}

interface UploadResults {
  total: number
  created: string[]
  failed: Array<{ club: string; error: string }>
  uploadType: UploadType
}

export function ScalingUpload() {
  const [selectedUploadType, setSelectedUploadType] = useState<UploadType>('working-sheet')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'completed' | 'error'>('idle')
  const [results, setResults] = useState<UploadResults | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const navigate = useNavigate()

  const uploadTypes = [
    {
      type: 'working-sheet' as UploadType,
      title: 'Working Sheet',
      description: 'Activity scaling plan with current and target meetups',
      icon: Target,
      color: 'blue'
    },
    {
      type: 'existing-clubs' as UploadType,
      title: 'Existing Clubs Targets',
      description: 'Set targets for existing clubs',
      icon: Building2,
      color: 'green'
    },
    {
      type: 'new-clubs' as UploadType,
      title: 'New Club Launch',
      description: 'New clubs to launch with targets',
      icon: PlusCircle,
      color: 'purple'
    }
  ]

  const handleFileUpload = async (selectedFile: File) => {
    if (!selectedFile) return

    setFile(selectedFile)
    setUploadStatus('processing')

    try {
      const text = await selectedFile.text()
      const parsed = parseCSV(text)

      // Validation based on upload type
      const validationErrors: string[] = []
      parsed.forEach((row, i) => {
        if (selectedUploadType === 'working-sheet') {
          if (!row.activity) validationErrors.push(`Row ${i + 2}: Missing activity`)
          if (!row.city) validationErrors.push(`Row ${i + 2}: Missing city`)
          if (!row.target_meetups) validationErrors.push(`Row ${i + 2}: Missing target meetups`)
        } else if (selectedUploadType === 'existing-clubs') {
          if (!row.club_id) validationErrors.push(`Row ${i + 2}: Missing club ID`)
          if (!row.target_meetups) validationErrors.push(`Row ${i + 2}: Missing target meetups`)
          if (!row.target_revenue) validationErrors.push(`Row ${i + 2}: Missing target revenue`)
        } else if (selectedUploadType === 'new-clubs') {
          if (!row.club_name) validationErrors.push(`Row ${i + 2}: Missing club name`)
          if (!row.activity) validationErrors.push(`Row ${i + 2}: Missing activity`)
          if (!row.city) validationErrors.push(`Row ${i + 2}: Missing city`)
          if (!row.target_launch_date) validationErrors.push(`Row ${i + 2}: Missing launch date`)
        }
      })

      if (validationErrors.length > 0) {
        setErrors(validationErrors)
        setUploadStatus('error')
        return
      }

      setPreview(parsed)
      setUploadStatus('idle')
      setErrors([])
    } catch (error) {
      setErrors(['Failed to parse CSV file'])
      setUploadStatus('error')
    }
  }

  const parseCSV = (text: string): any[] => {
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim())

    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim())
      const row: any = {}

      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })

      return row
    })
  }

  const downloadTemplate = () => {
    let template = ''
    let filename = ''

    switch (selectedUploadType) {
      case 'working-sheet':
        template = `activity,city,area,current_meetups,target_meetups,target_attendees,poc_assigned,timeline
Running,Mumbai,Andheri,8,12,300,Rahul,Q1-2024
Photography,Delhi,CP,5,8,160,Priya,Q1-2024
Books,Bangalore,Koramangala,3,6,120,Amit,Q2-2024`
        filename = 'working_sheet_template.csv'
        break

      case 'existing-clubs':
        template = `club_id,club_name,activity,city,area,current_meetups,target_meetups,target_revenue,target_attendees,poc_assigned
C001,Mumbai Running #5,Running,Mumbai,Andheri,8,12,180000,300,Rahul
C002,Delhi Photography #3,Photography,Delhi,CP,5,8,120000,160,Priya
C003,Bangalore Books #2,Books,Bangalore,Koramangala,3,6,90000,120,Amit`
        filename = 'existing_clubs_targets_template.csv'
        break

      case 'new-clubs':
        template = `club_name,activity,city,area,target_meetups,target_revenue,target_attendees,target_launch_date,poc_assigned,leader_name,venue_status,notes
Mumbai Running #10,Running,Mumbai,Bandra,8,150000,240,2024-02-01,Rahul,TBD,Identified,Prime location
Delhi Photography #5,Photography,Delhi,Hauz Khas,6,100000,150,2024-02-15,Priya,John Doe,Confirmed,Popular area
Bangalore Books #4,Books,Bangalore,Indiranagar,4,80000,100,2024-03-01,Amit,Jane Smith,Searching,High demand`
        filename = 'new_clubs_launch_template.csv'
        break
    }

    const blob = new Blob([template], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const processUpload = async () => {
    if (!file) return;

    setUploadStatus('processing')

    try {
      // Import the ScalingPlannerService
      const { ScalingPlannerService } = await import('../services/api');

      // Call the new upload API
      const response = await ScalingPlannerService.uploadPlan(file, selectedUploadType);

      const results: UploadResults = {
        total: preview.length,
        created: preview.map(row => selectedUploadType === 'working-sheet' ? `${row.activity} - ${row.city}` : row.club_name || row.club_id),
        failed: response.errors?.map(error => ({ club: 'Unknown', error })) || [],
        uploadType: selectedUploadType
      }

      setResults(results)
      setUploadStatus('completed')
    } catch (error) {
      setUploadStatus('error')
      setErrors([error instanceof Error ? error.message : 'Failed to process upload'])
    }
  }

  if (uploadStatus === 'completed' && results) {
    return <UploadResults results={results} onGoToDashboard={() => navigate('/')} />
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">📈 Scaling Plan Uploads</h1>
        <p className="text-gray-600">Upload working sheets, existing club targets, or new club launches</p>
      </div>

      {/* Upload Type Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {uploadTypes.map((uploadType) => {
          const Icon = uploadType.icon
          const isSelected = selectedUploadType === uploadType.type
          return (
            <div
              key={uploadType.type}
              onClick={() => {
                setSelectedUploadType(uploadType.type)
                setFile(null)
                setPreview([])
                setErrors([])
              }}
              className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
                isSelected
                  ? `border-${uploadType.color}-500 bg-${uploadType.color}-50`
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="text-center">
                <Icon className={`h-12 w-12 mx-auto mb-4 ${
                  isSelected ? `text-${uploadType.color}-600` : 'text-gray-400'
                }`} />
                <h3 className={`text-lg font-semibold mb-2 ${
                  isSelected ? `text-${uploadType.color}-900` : 'text-gray-900'
                }`}>
                  {uploadType.title}
                </h3>
                <p className={`text-sm ${
                  isSelected ? `text-${uploadType.color}-700` : 'text-gray-600'
                }`}>
                  {uploadType.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Upload Box */}
      <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-8 text-center">
        <input
          type="file"
          accept=".csv,.xlsx"
          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload" className="cursor-pointer">
          <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">
            📁 Upload {uploadTypes.find(t => t.type === selectedUploadType)?.title}
          </div>
          <div className="text-sm text-gray-500">
            CSV or Excel file with your data
          </div>
        </label>

        {file && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-center space-x-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <span className="text-blue-900 font-medium">{file.name}</span>
            </div>
          </div>
        )}
      </div>

      {/* Download Template */}
      <div className="flex justify-center">
        <button
          onClick={downloadTemplate}
          className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <Download className="h-4 w-4" />
          <span>Download {uploadTypes.find(t => t.type === selectedUploadType)?.title} Template</span>
        </button>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <h3 className="font-medium text-red-800">Upload Errors</h3>
          </div>
          <ul className="list-disc list-inside space-y-1">
            {errors.map((error, index) => (
              <li key={index} className="text-sm text-red-700">{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Preview: {preview.length} records to process
            </h3>
            <span className="text-sm text-gray-500">
              Showing first 5 rows
            </span>
          </div>

          <PreviewTable uploadType={selectedUploadType} data={preview.slice(0, 5)} />

          {preview.length > 5 && (
            <p className="text-center text-gray-500 mt-3">
              ... and {preview.length - 5} more records
            </p>
          )}

          <div className="flex justify-center mt-6">
            <button
              onClick={processUpload}
              disabled={uploadStatus === 'processing'}
              className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadStatus === 'processing' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>🚀 Process Upload</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewTable({ uploadType, data }: { uploadType: UploadType; data: any[] }) {
  if (uploadType === 'working-sheet') {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-900">Activity</th>
              <th className="px-3 py-2 text-left font-medium text-gray-900">City/Area</th>
              <th className="px-3 py-2 text-left font-medium text-gray-900">Current Meetups</th>
              <th className="px-3 py-2 text-left font-medium text-gray-900">Target Meetups</th>
              <th className="px-3 py-2 text-left font-medium text-gray-900">Target Attendees</th>
              <th className="px-3 py-2 text-left font-medium text-gray-900">POC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-900 font-medium">{row.activity}</td>
                <td className="px-3 py-2 text-gray-600">{row.city}, {row.area}</td>
                <td className="px-3 py-2 text-gray-600">{row.current_meetups}</td>
                <td className="px-3 py-2 text-green-600 font-medium">{row.target_meetups}</td>
                <td className="px-3 py-2 text-blue-600 font-medium">{row.target_attendees}</td>
                <td className="px-3 py-2 text-gray-600">{row.poc_assigned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (uploadType === 'existing-clubs') {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-900">Club</th>
              <th className="px-3 py-2 text-left font-medium text-gray-900">Activity</th>
              <th className="px-3 py-2 text-left font-medium text-gray-900">Current → Target Meetups</th>
              <th className="px-3 py-2 text-left font-medium text-gray-900">Target Revenue</th>
              <th className="px-3 py-2 text-left font-medium text-gray-900">Target Attendees</th>
              <th className="px-3 py-2 text-left font-medium text-gray-900">POC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <div className="text-gray-900 font-medium">{row.club_name}</div>
                  <div className="text-xs text-gray-500">{row.club_id}</div>
                </td>
                <td className="px-3 py-2 text-gray-600">{row.activity}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center space-x-1">
                    <span className="text-gray-600">{row.current_meetups}</span>
                    <ArrowRight className="h-3 w-3 text-gray-400" />
                    <span className="text-green-600 font-medium">{row.target_meetups}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-green-600 font-medium">₹{parseInt(row.target_revenue).toLocaleString('en-IN')}</td>
                <td className="px-3 py-2 text-blue-600 font-medium">{row.target_attendees}</td>
                <td className="px-3 py-2 text-gray-600">{row.poc_assigned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // new-clubs
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-900">Club Name</th>
            <th className="px-3 py-2 text-left font-medium text-gray-900">Activity</th>
            <th className="px-3 py-2 text-left font-medium text-gray-900">Location</th>
            <th className="px-3 py-2 text-left font-medium text-gray-900">Targets</th>
            <th className="px-3 py-2 text-left font-medium text-gray-900">Launch Date</th>
            <th className="px-3 py-2 text-left font-medium text-gray-900">POC</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-900 font-medium">{row.club_name}</td>
              <td className="px-3 py-2 text-gray-600">{row.activity}</td>
              <td className="px-3 py-2 text-gray-600">{row.city}, {row.area}</td>
              <td className="px-3 py-2">
                <div className="text-xs space-y-1">
                  <div className="text-green-600 font-medium">{row.target_meetups} meetups</div>
                  <div className="text-blue-600">₹{parseInt(row.target_revenue).toLocaleString('en-IN')}</div>
                  <div className="text-purple-600">{row.target_attendees} attendees</div>
                </div>
              </td>
              <td className="px-3 py-2 text-gray-600">{row.target_launch_date}</td>
              <td className="px-3 py-2 text-gray-600">{row.poc_assigned}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UploadResults({ results, onGoToDashboard }: { results: UploadResults; onGoToDashboard: () => void }) {
  const getUploadTypeTitle = (type: UploadType) => {
    switch (type) {
      case 'working-sheet': return 'Working Sheet'
      case 'existing-clubs': return 'Existing Clubs Targets'
      case 'new-clubs': return 'New Club Launches'
    }
  }

  const getSuccessMessage = (type: UploadType) => {
    switch (type) {
      case 'working-sheet': return 'Activity scaling plans processed'
      case 'existing-clubs': return 'Club targets updated'
      case 'new-clubs': return 'New clubs created'
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-gray-900 mb-2">✅ Upload Complete!</h2>
        <p className="text-gray-600">{getUploadTypeTitle(results.uploadType)} processed successfully</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="text-3xl font-bold text-green-600 mb-2">{results.created.length}</div>
          <div className="text-green-800">{getSuccessMessage(results.uploadType)}</div>
        </div>

        {results.failed.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <div className="text-3xl font-bold text-red-600 mb-2">{results.failed.length}</div>
            <div className="text-red-800">Failed</div>
          </div>
        )}
      </div>

      {/* Processed Items List */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Processed Items:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {results.created.map(item => (
            <div key={item} className="flex items-center space-x-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-gray-700">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">What Happens Next:</h3>
        <ul className="space-y-2 mb-6">
          <li className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <span className="text-blue-800">All data is now in the scaling planner</span>
          </li>
          <li className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <span className="text-blue-800">Targets are mapped to activities and POCs</span>
          </li>
          <li className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <span className="text-blue-800">Revenue pipeline updated automatically</span>
          </li>
        </ul>

        <div className="flex space-x-4">
          <button
            onClick={onGoToDashboard}
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <span>Go to Dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => window.location.href = '/scaling-planner'}
            className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <span>View Scaling Planner</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}