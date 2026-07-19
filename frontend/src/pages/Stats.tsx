import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api'
import type { Stats as StatsT } from '../types'

const COLORS = ['#f2b134', '#7a1e3a', '#e94f75', '#6f4e37', '#767676', '#4aa3df', '#22c55e', '#a855f7']

export default function Stats() {
  const [s, setS] = useState<StatsT | null>(null)

  useEffect(() => {
    api.get<StatsT>('/activities/stats').then(setS)
  }, [])

  if (!s) return <div>Loading…</div>

  const byType = Object.entries(s.by_type).map(([name, value]) => ({ name, value }))
  const byWeekday = Object.entries(s.by_weekday).map(([name, value]) => ({ name, value }))
  const byHour = Object.entries(s.by_hour).map(([name, value]) => ({ name, value }))

  return (
    <div className="stack">
      <h1>Stats</h1>
      <div className="stat-tiles">
        <div className="stat-tile"><div className="big-number">{s.total}</div><div>Total signals</div></div>
        <div className="stat-tile"><div className="big-number">{s.streak_days}</div><div>Day streak</div></div>
      </div>

      <section>
        <h2>By type</h2>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={byType} dataKey="value" nameKey="name" outerRadius={80} label>
                {byType.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2>By day of week</h2>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={byWeekday}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#4aa3df" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2>By hour</h2>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={byHour}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#e94f75" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
