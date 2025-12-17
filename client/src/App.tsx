import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Workspace } from './pages/Workspace'
import { Analytics } from './pages/Analytics'
import { RevenueGrowth } from './pages/RevenueGrowth'
import { ScalingUpload } from './pages/ScalingUpload'
import { POCManagement } from './pages/POCManagement'
import { ScalingPlanner } from './pages/ScalingPlanner'
import { WoWTrackingPage } from './pages/WoWTracking'
import { HealthDashboard } from './pages/HealthDashboard'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/workspace" element={<Workspace />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/revenue-growth" element={<RevenueGrowth />} />
        <Route path="/scaling-upload" element={<ScalingUpload />} />
        <Route path="/poc-management" element={<POCManagement />} />
        <Route path="/scaling-planner" element={<ScalingPlanner />} />
        <Route path="/wow-tracking" element={<WoWTrackingPage />} />
        <Route path="/health-dashboard" element={<HealthDashboard />} />
      </Routes>
    </Layout>
  )
}

export default App