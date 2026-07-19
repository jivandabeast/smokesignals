import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Login from './pages/Login'
import Register from './pages/Register'
import BootstrapAdmin from './pages/BootstrapAdmin'
import Feed from './pages/Feed'
import Post from './pages/Post'
import Friends from './pages/Friends'
import Circles from './pages/Circles'
import History from './pages/History'
import MapView from './pages/MapView'
import Stats from './pages/Stats'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import Notifications from './pages/Notifications'
import Layout from './components/Layout'

export default function App() {
  const { user, loading, needsBootstrap } = useAuth()

  if (loading) {
    return <div className="center-screen">Loading…</div>
  }

  if (needsBootstrap) {
    return (
      <Routes>
        <Route path="*" element={<BootstrapAdmin />} />
      </Routes>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Feed />} />
        <Route path="/post" element={<Post />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/circles" element={<Circles />} />
        <Route path="/history" element={<History />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/profile" element={<Profile />} />
        {user.is_admin && <Route path="/admin" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
