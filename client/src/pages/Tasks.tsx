import React, { useState, useEffect } from 'react'
import { Plus, Edit, Save, X, Trash2, CheckCircle, Clock, AlertCircle, Users, User, Calendar } from 'lucide-react'

interface Task {
  id: number
  title: string
  description: string
  assigned_to_poc_id: number | null
  assigned_to_user_id: string | null
  assigned_poc_name: string | null
  assigned_user_name: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  due_date: string | null
  club_id: string | null
  club_name: string | null
  activity: string | null
  city: string | null
  created_by: string
  created_at: string
  updated_at: string
  completed_at: string | null
  comments_count: number
}

interface POC {
  id: number
  name: string
  poc_type: string
  activities: string[]
  cities: string[]
  team_name: string
  email: string
  phone: string
}

interface User {
  id: string
  name: string
  email: string
  role: string
  city: string
  activity: string
}

interface TaskStats {
  total: number
  pending: number
  in_progress: number
  completed: number
  cancelled: number
  overdue: number
  due_soon: number
}

const priorityColors = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800'
}

const statusColors = {
  pending: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
}

const statusIcons = {
  pending: Clock,
  in_progress: AlertCircle,
  completed: CheckCircle,
  cancelled: X
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [pocs, setPocs] = useState<POC[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddTask, setShowAddTask] = useState(false)
  const [editingTask, setEditingTask] = useState<number | null>(null)

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assigned_to_poc_id: null as number | null,
    assigned_to_user_id: null as string | null,
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    due_date: '',
    activity: '',
    city: ''
  })

  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    assigned_to_poc_id: '',
    activity: '',
    city: ''
  })

  useEffect(() => {
    fetchTasks()
    fetchPOCs()
    fetchUsers()
  }, [filters])

  const fetchTasks = async () => {
    try {
      setLoading(true)
      const queryParams = new URLSearchParams()

      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value)
      })

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/tasks?${queryParams}`)
      const data = await response.json()

      if (data.success) {
        setTasks(data.tasks)
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPOCs = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/tasks/assignees/pocs`)
      const data = await response.json()

      if (data.success) {
        setPocs(data.pocs)
      }
    } catch (error) {
      console.error('Error fetching POCs:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/tasks/assignees/users`)
      const data = await response.json()

      if (data.success) {
        setUsers(data.users)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const addTask = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newTask,
          created_by: 'Operations Team'
        })
      })

      const data = await response.json()

      if (data.success) {
        setTasks([data.task, ...tasks])
        setNewTask({
          title: '',
          description: '',
          assigned_to_poc_id: null,
          assigned_to_user_id: null,
          priority: 'medium',
          due_date: '',
          activity: '',
          city: ''
        })
        setShowAddTask(false)
        fetchTasks() // Refresh to get updated stats
      }
    } catch (error) {
      console.error('Error creating task:', error)
      alert('Failed to create task')
    }
  }

  const updateTask = async (taskId: number, updates: Partial<Task>) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      })

      const data = await response.json()

      if (data.success) {
        setTasks(tasks.map(task => task.id === taskId ? data.task : task))
        setEditingTask(null)
        fetchTasks() // Refresh to get updated stats
      }
    } catch (error) {
      console.error('Error updating task:', error)
    }
  }

  const deleteTask = async (taskId: number) => {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/tasks/${taskId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setTasks(tasks.filter(task => task.id !== taskId))
        fetchTasks() // Refresh to get updated stats
      }
    } catch (error) {
      console.error('Error deleting task:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString()
  }

  const isDueSoon = (dueDate: string) => {
    const due = new Date(dueDate)
    const now = new Date()
    const diffTime = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= 3
  }

  if (loading && tasks.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading tasks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900">Task Tracker</h1>
            </div>
            <button
              onClick={() => setShowAddTask(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Task
            </button>
          </div>
          <p className="text-gray-600">
            Manage and track operational tasks with POC assignments
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-600">Total Tasks</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="text-2xl font-bold text-gray-500">{stats.pending}</div>
              <div className="text-sm text-gray-600">Pending</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="text-2xl font-bold text-blue-600">{stats.in_progress}</div>
              <div className="text-sm text-gray-600">In Progress</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="text-2xl font-bold text-red-600">{stats.cancelled}</div>
              <div className="text-sm text-gray-600">Cancelled</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="text-2xl font-bold text-red-500">{stats.overdue}</div>
              <div className="text-sm text-gray-600">Overdue</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="text-2xl font-bold text-orange-500">{stats.due_soon}</div>
              <div className="text-sm text-gray-600">Due Soon</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigned POC</label>
              <select
                value={filters.assigned_to_poc_id}
                onChange={(e) => setFilters({ ...filters, assigned_to_poc_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All POCs</option>
                {pocs.map(poc => (
                  <option key={poc.id} value={poc.id}>
                    {poc.name} ({poc.poc_type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Activity</label>
              <input
                type="text"
                value={filters.activity}
                onChange={(e) => setFilters({ ...filters, activity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Filter by activity"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={filters.city}
                onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Filter by city"
              />
            </div>
          </div>
        </div>

        {/* Add Task Modal */}
        {showAddTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Add New Task</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter task title"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Enter task description"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assign to POC</label>
                    <select
                      value={newTask.assigned_to_poc_id || ''}
                      onChange={(e) => setNewTask({
                        ...newTask,
                        assigned_to_poc_id: e.target.value ? parseInt(e.target.value) : null
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select POC...</option>
                      {pocs.map(poc => (
                        <option key={poc.id} value={poc.id}>
                          {poc.name} ({poc.poc_type}) - {poc.team_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assign to User</label>
                    <select
                      value={newTask.assigned_to_user_id || ''}
                      onChange={(e) => setNewTask({
                        ...newTask,
                        assigned_to_user_id: e.target.value || null
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select User...</option>
                      {users.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.role}) - {user.city}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={newTask.priority}
                      onChange={(e) => setNewTask({
                        ...newTask,
                        priority: e.target.value as 'low' | 'medium' | 'high' | 'urgent'
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={newTask.due_date}
                      onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Activity</label>
                    <input
                      type="text"
                      value={newTask.activity}
                      onChange={(e) => setNewTask({ ...newTask, activity: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Related activity"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={newTask.city}
                    onChange={(e) => setNewTask({ ...newTask, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Related city"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={addTask}
                  disabled={!newTask.title}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300"
                >
                  Create Task
                </button>
                <button
                  onClick={() => setShowAddTask(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tasks List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Tasks ({tasks.length})</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tasks.map((task) => {
                  const StatusIcon = statusIcons[task.status]
                  const dueDate = task.due_date ? new Date(task.due_date) : null
                  const overdue = dueDate && isOverdue(task.due_date!)
                  const dueSoon = dueDate && isDueSoon(task.due_date!)

                  return (
                    <tr key={task.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{task.title}</div>
                          {task.description && (
                            <div className="text-sm text-gray-500 mt-1">{task.description}</div>
                          )}
                          <div className="flex gap-2 mt-1">
                            {task.activity && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                {task.activity}
                              </span>
                            )}
                            {task.city && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                {task.city}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-1">
                          {task.assigned_poc_name && (
                            <div className="flex items-center gap-1 text-sm">
                              <Users className="h-3 w-3" />
                              <span className="text-purple-600 font-medium">{task.assigned_poc_name}</span>
                            </div>
                          )}
                          {task.assigned_user_name && (
                            <div className="flex items-center gap-1 text-sm">
                              <User className="h-3 w-3" />
                              <span className="text-blue-600">{task.assigned_user_name}</span>
                            </div>
                          )}
                          {!task.assigned_poc_name && !task.assigned_user_name && (
                            <span className="text-gray-400 text-sm">Unassigned</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColors[task.priority]}`}>
                          {task.priority.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <StatusIcon className="h-4 w-4" />
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[task.status]}`}>
                            {task.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {dueDate ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span className={`text-sm ${overdue ? 'text-red-600 font-medium' : dueSoon ? 'text-orange-600 font-medium' : 'text-gray-600'}`}>
                              {formatDate(task.due_date!)}
                            </span>
                            {overdue && <span className="text-red-500 text-xs">(Overdue)</span>}
                            {dueSoon && !overdue && <span className="text-orange-500 text-xs">(Due Soon)</span>}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">No due date</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingTask(task.id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {tasks.length === 0 && !loading && (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No tasks found. Create your first task to get started.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}