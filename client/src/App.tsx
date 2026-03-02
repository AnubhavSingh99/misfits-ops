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
import DimensionalDashboard from './pages/DimensionalDashboard'
import ScalingTargets from './components/ScalingTargets'
import ScalingPlannerV2 from './pages/ScalingPlannerV2'
import LeaderRequirementsDashboard from './pages/LeaderRequirementsDashboard'
import VenueRequirementsDashboard from './pages/VenueRequirementsDashboard'
import CustomerServiceDashboard from './pages/CustomerServiceDashboard'
import SharkTankInvites from './pages/SharkTankInvites'
import SharkTankCRM from './pages/SharkTankCRM'
import StartYourClub from './pages/StartYourClub'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ScalingPlannerV2 />} />
        <Route path="/workspace" element={<Workspace />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/revenue-growth" element={<RevenueGrowth />} />
        <Route path="/scaling-upload" element={<ScalingUpload />} />
        <Route path="/poc-management" element={<POCManagement />} />
        <Route path="/scaling-planner" element={<ScalingPlanner />} />
        <Route path="/wow-tracking" element={<WoWTrackingPage />} />
        <Route path="/health-dashboard" element={<HealthDashboard />} />
        <Route path="/scaling-targets" element={<ScalingTargets />} />
        <Route path="/dimensional-dashboard" element={<DimensionalDashboard />} />
        <Route path="/scaling-planner-v2" element={<ScalingPlannerV2 />} />
        <Route path="/leader-requirements" element={<LeaderRequirementsDashboard />} />
        <Route path="/venue-requirements" element={<VenueRequirementsDashboard />} />
        <Route path="/customer-service" element={<CustomerServiceDashboard />} />
        <Route path="/shark-tank-invites" element={<SharkTankInvites />} />
        <Route path="/shark-tank" element={<SharkTankCRM />} />
        <Route path="/start-your-club" element={<StartYourClub />} />
      </Routes>
    </Layout>
  )
}

export default App