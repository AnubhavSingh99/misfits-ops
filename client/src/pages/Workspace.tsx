import React, { useState, useEffect } from 'react'
import { Plus, CheckSquare, Users, Star, Calendar, Clock, AlertCircle, Filter, Search, Edit2, Trash2 } from 'lucide-react'

interface Task {
  id: string
  title: string
  description?: string
  assignedTo: string
  assignedBy: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  deadline?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

interface POC {
  id: string
  name: string
  teamName: string
  email: string
  phone: string
  teamMembers: Array<{
    id: string
    name: string
    role: string
    email: string
    phone: string
  }>
  activities: string[]
}

// Default POCs for fallback - will be replaced by real data
const DEFAULT_POCS = ['Loading...']

const priorityColors = {
  low: 'bg-gray-100 text-gray-800 border-gray-300',
  medium: 'bg-blue-100 text-blue-800 border-blue-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  urgent: 'bg-red-100 text-red-800 border-red-300'
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  completed: 'bg-green-100 text-green-800 border-green-300'
}

export function Workspace() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [pocs, setPocs] = useState<POC[]>([])
  const [availableAssignees, setAvailableAssignees] = useState<string[]>(DEFAULT_POCS)
  const [activeTab, setActiveTab] = useState<'my_tasks' | 'team_view' | 'daily_tasks'>('my_tasks')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showBulkCreateForm, setShowBulkCreateForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [selectedPOC, setSelectedPOC] = useState<string>('All')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentUser] = useState('Admin') // This would come from auth context

  // Load POCs from database API and build assignee list on mount
  useEffect(() => {
    fetchPOCs()
  }, [])

  const fetchPOCs = async () => {
    try {
      // Try to fetch from database API first
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/tasks/assignees/pocs`)
      const data = await response.json()

      if (data.success && data.pocs.length > 0) {
        // Convert database POCs to the format expected by this component
        const pocData = data.pocs.map((dbPoc: any) => ({
          id: dbPoc.id.toString(),
          name: dbPoc.name,
          teamName: dbPoc.team_name || 'Operations Team',
          email: dbPoc.email || '',
          phone: dbPoc.phone || '',
          teamMembers: [], // TODO: Add team members handling if needed
          activities: dbPoc.activities || []
        }))

        setPocs(pocData)

        // Build assignee list from database POCs
        const assignees = ['Admin'] // Always include Admin
        pocData.forEach((poc: POC) => {
          assignees.push(poc.name)
          // Add team members if they exist
          poc.teamMembers.forEach(member => {
            assignees.push(`${member.name} (${poc.teamName})`)
          })
        })

        setAvailableAssignees(assignees)
        console.log('Loaded POCs from database:', pocData.length, 'POCs')
        return
      }
    } catch (error) {
      console.error('Error fetching POCs from API:', error)
    }

    // Fallback: try localStorage
    const savedPocs = localStorage.getItem('pocManagement_pocs')
    if (savedPocs) {
      try {
        const pocData = JSON.parse(savedPocs) as POC[]
        setPocs(pocData)

        // Build assignee list from localStorage POCs
        const assignees = ['Admin']
        pocData.forEach(poc => {
          assignees.push(poc.name)
          poc.teamMembers.forEach(member => {
            assignees.push(`${member.name} (${poc.teamName})`)
          })
        })

        setAvailableAssignees(assignees)
        console.log('Loaded POCs from localStorage:', pocData.length, 'POCs')
      } catch (error) {
        console.error('Error loading POCs from localStorage:', error)
        setAvailableAssignees(DEFAULT_POCS)
      }
    } else {
      // No POCs available - use default
      setAvailableAssignees(DEFAULT_POCS)
    }
  }

  // Load tasks from localStorage on mount
  useEffect(() => {
    const savedTasks = localStorage.getItem('taskTracker_tasks')
    if (savedTasks) {
      setTasks(JSON.parse(savedTasks))
    } else {
      // Initialize with sample tasks
      const sampleTasks: Task[] = [
        {
          id: '1',
          title: 'Review Q4 targets for Badminton',
          description: 'Review and finalize Q4 growth targets for badminton activities across all areas',
          assignedTo: 'POC 1',
          assignedBy: 'Admin',
          status: 'pending',
          priority: 'high',
          deadline: '2025-01-15',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: '2',
          title: 'Update club health metrics',
          description: 'Review and update the health calculation engine based on new requirements',
          assignedTo: 'POC 2',
          assignedBy: 'Admin',
          status: 'in_progress',
          priority: 'medium',
          deadline: '2025-01-20',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
      setTasks(sampleTasks)
      localStorage.setItem('taskTracker_tasks', JSON.stringify(sampleTasks))
    }
  }, [])

  // Save tasks to localStorage whenever tasks change
  useEffect(() => {
    localStorage.setItem('taskTracker_tasks', JSON.stringify(tasks))
  }, [tasks])

  const tabs = [
    { id: 'my_tasks', label: 'My Tasks', icon: CheckSquare },
    { id: 'team_view', label: 'Team View', icon: Users },
    { id: 'daily_tasks', label: 'Daily Tasks', icon: Star }
  ]

  const createTask = (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newTask: Task = {
      ...taskData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    setTasks(prev => [newTask, ...prev])
    setShowCreateForm(false)
  }

  const createBulkTasks = (tasksData: Array<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>) => {
    const newTasks = tasksData.map((taskData, index) => ({
      ...taskData,
      id: (Date.now() + index).toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }))
    setTasks(prev => [...newTasks, ...prev])
    setShowBulkCreateForm(false)
  }

  const updateTask = (taskId: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(task =>
      task.id === taskId
        ? {
            ...task,
            ...updates,
            updatedAt: new Date().toISOString(),
            completedAt: updates.status === 'completed' ? new Date().toISOString() : task.completedAt
          }
        : task
    ))
  }

  const deleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId))
  }

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = !searchQuery ||
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesPOC = selectedPOC === 'All' || task.assignedTo === selectedPOC
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter

    if (activeTab === 'my_tasks') {
      return matchesSearch && (task.assignedTo === currentUser || task.assignedBy === currentUser) &&
             matchesStatus && matchesPriority
    }

    if (activeTab === 'daily_tasks') {
      const today = new Date().toDateString()
      const isToday = task.deadline && new Date(task.deadline).toDateString() === today
      return matchesSearch && isToday && matchesPOC && matchesStatus && matchesPriority
    }

    return matchesSearch && matchesPOC && matchesStatus && matchesPriority
  })

  const isOverdue = (deadline?: string) => {
    if (!deadline) return false
    return new Date(deadline) < new Date() && new Date(deadline).toDateString() !== new Date().toDateString()
  }

  const isDueToday = (deadline?: string) => {
    if (!deadline) return false
    return new Date(deadline).toDateString() === new Date().toDateString()
  }

  const getTaskStats = () => {
    const totalTasks = filteredTasks.length
    const pendingTasks = filteredTasks.filter(t => t.status === 'pending').length
    const inProgressTasks = filteredTasks.filter(t => t.status === 'in_progress').length
    const completedTasks = filteredTasks.filter(t => t.status === 'completed').length
    const overdueTasks = filteredTasks.filter(t => isOverdue(t.deadline) && t.status !== 'completed').length
    const dueTodayTasks = filteredTasks.filter(t => isDueToday(t.deadline) && t.status !== 'completed').length

    return { totalTasks, pendingTasks, inProgressTasks, completedTasks, overdueTasks, dueTodayTasks }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Task Tracker</h1>
          <p className="text-gray-600 mt-1">Manage tasks, assignments, and deadlines</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>New Task</span>
          </button>
          <button
            onClick={() => setShowBulkCreateForm(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Bulk Create</span>
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <TaskStatsOverview stats={getTaskStats()} />

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {(activeTab === 'team_view' || activeTab === 'daily_tasks') && (
              <select
                value={selectedPOC}
                onChange={(e) => setSelectedPOC(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="All">All POCs</option>
                {availableAssignees.map(assignee => (
                  <option key={assignee} value={assignee}>{assignee}</option>
                ))}
              </select>
            )}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Task List */}
        <div className="p-6">
          <TaskList
            tasks={filteredTasks}
            currentUser={currentUser}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
            onEditTask={setEditingTask}
          />
        </div>
      </div>

      {/* Create/Edit Task Modal */}
      {(showCreateForm || editingTask) && (
        <TaskFormModal
          task={editingTask}
          currentUser={currentUser}
          availableAssignees={availableAssignees}
          onSave={editingTask ?
            (updates) => {
              updateTask(editingTask.id, updates)
              setEditingTask(null)
            } :
            createTask
          }
          onCancel={() => {
            setShowCreateForm(false)
            setEditingTask(null)
          }}
        />
      )}

      {/* Bulk Create Tasks Modal */}
      {showBulkCreateForm && (
        <BulkTaskFormModal
          currentUser={currentUser}
          availableAssignees={availableAssignees}
          onSave={createBulkTasks}
          onCancel={() => setShowBulkCreateForm(false)}
        />
      )}
    </div>
  )
}

function TaskStatsOverview({ stats }: { stats: any }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
      <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
        <div className="text-2xl font-bold text-gray-900">{stats.totalTasks}</div>
        <div className="text-sm text-gray-600">Total Tasks</div>
      </div>
      <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
        <div className="text-2xl font-bold text-yellow-600">{stats.pendingTasks}</div>
        <div className="text-sm text-gray-600">Pending</div>
      </div>
      <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
        <div className="text-2xl font-bold text-blue-600">{stats.inProgressTasks}</div>
        <div className="text-sm text-gray-600">In Progress</div>
      </div>
      <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
        <div className="text-2xl font-bold text-green-600">{stats.completedTasks}</div>
        <div className="text-sm text-gray-600">Completed</div>
      </div>
      <div className="bg-white p-4 rounded-lg border border-red-200 text-center">
        <div className="text-2xl font-bold text-red-600">{stats.overdueTasks}</div>
        <div className="text-sm text-gray-600">Overdue</div>
      </div>
      <div className="bg-white p-4 rounded-lg border border-orange-200 text-center">
        <div className="text-2xl font-bold text-orange-600">{stats.dueTodayTasks}</div>
        <div className="text-sm text-gray-600">Due Today</div>
      </div>
    </div>
  )
}

function TaskList({
  tasks,
  currentUser,
  onUpdateTask,
  onDeleteTask,
  onEditTask
}: {
  tasks: Task[]
  currentUser: string
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onDeleteTask: (id: string) => void
  onEditTask: (task: Task) => void
}) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks found</h3>
        <p className="text-gray-600">Create a new task to get started.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          currentUser={currentUser}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onEditTask={onEditTask}
        />
      ))}
    </div>
  )
}

function TaskCard({
  task,
  currentUser,
  onUpdateTask,
  onDeleteTask,
  onEditTask
}: {
  task: Task
  currentUser: string
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onDeleteTask: (id: string) => void
  onEditTask: (task: Task) => void
}) {
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() &&
                   new Date(task.deadline).toDateString() !== new Date().toDateString()
  const isDueToday = task.deadline && new Date(task.deadline).toDateString() === new Date().toDateString()

  return (
    <div className={`border rounded-lg p-4 ${isOverdue && task.status !== 'completed' ? 'border-red-300 bg-red-50' :
                      isDueToday && task.status !== 'completed' ? 'border-orange-300 bg-orange-50' :
                      'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-medium text-gray-900">{task.title}</h3>
            <span className={`px-2 py-1 text-xs font-medium rounded-full border ${priorityColors[task.priority]}`}>
              {task.priority}
            </span>
            <span className={`px-2 py-1 text-xs font-medium rounded-full border ${statusColors[task.status]}`}>
              {task.status.replace('_', ' ')}
            </span>
          </div>

          {task.description && (
            <p className="text-gray-600 mb-3">{task.description}</p>
          )}

          <div className="flex items-center space-x-6 text-sm text-gray-500">
            <div className="flex items-center space-x-1">
              <span>Assigned to:</span>
              <span className="font-medium">{task.assignedTo}</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>By:</span>
              <span className="font-medium">{task.assignedBy}</span>
            </div>
            {task.deadline && (
              <div className="flex items-center space-x-1">
                <Calendar className="h-4 w-4" />
                <span>Due: {new Date(task.deadline).toLocaleDateString('en-IN')}</span>
                {isOverdue && task.status !== 'completed' && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 ml-4">
          <select
            value={task.status}
            onChange={(e) => onUpdateTask(task.id, { status: e.target.value as Task['status'] })}
            className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>

          <button
            onClick={() => onEditTask(task)}
            className="p-1 text-gray-400 hover:text-blue-600"
          >
            <Edit2 className="h-4 w-4" />
          </button>

          <button
            onClick={() => onDeleteTask(task.id)}
            className="p-1 text-gray-400 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function TaskFormModal({
  task,
  currentUser,
  availableAssignees,
  onSave,
  onCancel
}: {
  task?: Task | null
  currentUser: string
  availableAssignees: string[]
  onSave: (taskData: any) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    assignedTo: task?.assignedTo || 'POC 1',
    assignedBy: task?.assignedBy || currentUser,
    priority: task?.priority || 'medium',
    deadline: task?.deadline || ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) return

    onSave({
      ...formData,
      status: task?.status || 'pending'
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">
          {task ? 'Edit Task' : 'Create New Task'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title*</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign to*</label>
            <select
              value={formData.assignedTo}
              onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              {availableAssignees.map(assignee => (
                <option key={assignee} value={assignee}>{assignee}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
            <input
              type="date"
              value={formData.deadline}
              onChange={(e) => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {task ? 'Update Task' : 'Create Task'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BulkTaskFormModal({
  currentUser,
  availableAssignees,
  onSave,
  onCancel
}: {
  currentUser: string
  availableAssignees: string[]
  onSave: (tasksData: any[]) => void
  onCancel: () => void
}) {
  const [tasks, setTasks] = useState([
    {
      title: '',
      description: '',
      assignedTo: availableAssignees[0] || 'POC 1',
      assignedBy: currentUser,
      priority: 'medium' as const,
      deadline: ''
    }
  ])

  const addTask = () => {
    setTasks(prev => [...prev, {
      title: '',
      description: '',
      assignedTo: availableAssignees[0] || 'POC 1',
      assignedBy: currentUser,
      priority: 'medium' as const,
      deadline: ''
    }])
  }

  const removeTask = (index: number) => {
    if (tasks.length > 1) {
      setTasks(prev => prev.filter((_, i) => i !== index))
    }
  }

  const updateTask = (index: number, field: string, value: string) => {
    setTasks(prev => prev.map((task, i) =>
      i === index ? { ...task, [field]: value } : task
    ))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const validTasks = tasks.filter(task => task.title.trim())
    if (validTasks.length > 0) {
      onSave(validTasks)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Create Multiple Tasks</h3>
            <p className="text-sm text-gray-500 mt-1">Add multiple tasks at once. You can assign them to different POCs and team members.</p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-6">
              {tasks.map((task, index) => (
                <div key={index} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-medium text-gray-900">Task #{index + 1}</h4>
                    {tasks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTask(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Title*</label>
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => updateTask(index, 'title', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Enter task title..."
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea
                        value={task.description}
                        onChange={(e) => updateTask(index, 'description', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        rows={2}
                        placeholder="Enter task description..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Assign to*</label>
                      <select
                        value={task.assignedTo}
                        onChange={(e) => updateTask(index, 'assignedTo', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        required
                      >
                        {availableAssignees.map(assignee => (
                          <option key={assignee} value={assignee}>{assignee}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                      <select
                        value={task.priority}
                        onChange={(e) => updateTask(index, 'priority', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                      <input
                        type="date"
                        value={task.deadline}
                        onChange={(e) => updateTask(index, 'deadline', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addTask}
              className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Another Task</span>
            </button>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {tasks.filter(task => task.title.trim()).length} task(s) ready to create
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={tasks.filter(task => task.title.trim()).length === 0}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create {tasks.filter(task => task.title.trim()).length} Task(s)
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}