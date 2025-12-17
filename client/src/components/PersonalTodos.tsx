import React, { useState } from 'react'
import { Plus, Check, X, Calendar, Flag } from 'lucide-react'
import clsx from 'clsx'

interface PersonalTodo {
  id: string
  content: string
  completed: boolean
  dueDate?: Date
  priority: 'low' | 'medium' | 'high'
  createdAt: Date
}

export function PersonalTodos() {
  const [todos, setTodos] = useState<PersonalTodo[]>([
    {
      id: '1',
      content: 'Call investor about Series A',
      completed: false,
      dueDate: new Date(),
      priority: 'high',
      createdAt: new Date()
    },
    {
      id: '2',
      content: 'Lunch with new CMO (Ankit)',
      completed: false,
      dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000),
      priority: 'medium',
      createdAt: new Date()
    },
    {
      id: '3',
      content: 'Review Q4 strategy presentation',
      completed: false,
      priority: 'medium',
      createdAt: new Date()
    },
    {
      id: '4',
      content: 'Morning run (6 AM)',
      completed: true,
      priority: 'low',
      createdAt: new Date()
    }
  ])

  const [newTodo, setNewTodo] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)

  const addTodo = () => {
    if (newTodo.trim()) {
      const todo: PersonalTodo = {
        id: Date.now().toString(),
        content: newTodo.trim(),
        completed: false,
        priority: 'medium',
        createdAt: new Date()
      }
      setTodos([...todos, todo])
      setNewTodo('')
    }
  }

  const toggleTodo = (id: string) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ))
  }

  const deleteTodo = (id: string) => {
    setTodos(todos.filter(todo => todo.id !== id))
  }

  const priorityColors = {
    low: 'text-gray-500',
    medium: 'text-yellow-500',
    high: 'text-red-500'
  }

  const activeTodos = todos.filter(todo => !todo.completed)
  const completedTodos = todos.filter(todo => todo.completed)

  return (
    <div className="space-y-4">
      {/* Add new todo */}
      <div className="flex space-x-2">
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && addTodo()}
          placeholder="What's on your mind?"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={addTodo}
          className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Active todos */}
      <div className="space-y-2">
        {activeTodos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            onToggle={() => toggleTodo(todo.id)}
            onDelete={() => deleteTodo(todo.id)}
          />
        ))}
      </div>

      {/* Completed todos toggle */}
      {completedTodos.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1"
          >
            <Check className="h-4 w-4" />
            <span>{showCompleted ? 'Hide' : 'Show'} completed ({completedTodos.length})</span>
          </button>

          {showCompleted && (
            <div className="mt-2 space-y-2">
              {completedTodos.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={() => toggleTodo(todo.id)}
                  onDelete={() => deleteTodo(todo.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TodoItem({ todo, onToggle, onDelete }: {
  todo: PersonalTodo
  onToggle: () => void
  onDelete: () => void
}) {
  const priorityColors = {
    low: 'text-gray-500',
    medium: 'text-yellow-500',
    high: 'text-red-500'
  }

  const isOverdue = todo.dueDate && todo.dueDate < new Date() && !todo.completed
  const isToday = todo.dueDate && todo.dueDate.toDateString() === new Date().toDateString()

  return (
    <div className={clsx(
      'flex items-start space-x-3 p-3 rounded-lg border',
      todo.completed ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-gray-300'
    )}>
      <button
        onClick={onToggle}
        className={clsx(
          'flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5',
          todo.completed
            ? 'bg-green-500 border-green-500'
            : 'border-gray-300 hover:border-green-500'
        )}
      >
        {todo.completed && <Check className="h-3 w-3 text-white" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={clsx(
          'text-sm',
          todo.completed ? 'line-through text-gray-500' : 'text-gray-900'
        )}>
          {todo.content}
        </p>

        <div className="flex items-center space-x-3 mt-1">
          <div className="flex items-center space-x-1">
            <Flag className={clsx('h-3 w-3', priorityColors[todo.priority])} />
            <span className="text-xs text-gray-500 capitalize">{todo.priority}</span>
          </div>

          {todo.dueDate && (
            <div className="flex items-center space-x-1">
              <Calendar className="h-3 w-3 text-gray-400" />
              <span className={clsx(
                'text-xs',
                isOverdue ? 'text-red-600' : isToday ? 'text-orange-600' : 'text-gray-500'
              )}>
                {todo.dueDate.toLocaleDateString('en-IN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onDelete}
        className="flex-shrink-0 text-gray-400 hover:text-red-500 p-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}