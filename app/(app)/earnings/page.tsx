'use client'

import { useState } from 'react'
import { PoundSterling, Star, Briefcase, Clock, TrendingUp } from 'lucide-react'
import { MOCK_EARNINGS, WEEK_STATS } from '@/lib/mock-data'

type Period = 'today' | 'week' | 'month'

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
}

const PERIOD_DATA: Record<Period, { total: number; trips: number; hours: number; tips: number; base: number }> = {
  today: { total: 185.00, trips: 1, hours: 4.5, tips: 0, base: 185.00 },
  week: { total: 2840.00, trips: 18, hours: 42, tips: 310.00, base: 2530.00 },
  month: { total: 10420.00, trips: 68, hours: 158, tips: 1140.00, base: 9280.00 },
}

export default function EarningsPage() {
  const [period, setPeriod] = useState<Period>('week')
  const data = PERIOD_DATA[period]
  const todayEntries = MOCK_EARNINGS.filter((e) => e.date === '2026-05-29')

  return (
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-white font-bold text-xl">Earnings</h1>
        <p className="text-white/40 text-xs mt-1">Your payment summary</p>
      </div>

      {/* Period Selector */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-5">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              period === p ? 'text-[#020813]' : 'text-white/40 hover:text-white/60'
            }`}
            style={period === p ? { background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' } : {}}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Total Earnings Card */}
      <div
        className="rounded-2xl p-5 mb-5"
        style={{
          background: 'linear-gradient(135deg, rgba(213,165,56,0.15), rgba(169,121,24,0.08))',
          border: '1px solid rgba(213,165,56,0.25)',
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#d5a538]/70 mb-2">
          {PERIOD_LABELS[period]} Earnings
        </p>
        <div className="flex items-end gap-1">
          <PoundSterling size={24} className="text-[#d5a538] mb-1" />
          <span className="text-white font-bold text-4xl">{data.total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
        </div>

        {/* Breakdown */}
        <div className="flex gap-4 mt-4 pt-4 border-t border-[#d5a538]/15">
          <div>
            <p className="text-[#d5a538]/60 text-[10px] uppercase tracking-wide">Base Fares</p>
            <p className="text-white font-semibold text-sm mt-0.5">£{data.base.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-[#d5a538]/60 text-[10px] uppercase tracking-wide">Tips</p>
            <p className="text-white font-semibold text-sm mt-0.5">£{data.tips.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
          <Briefcase size={16} className="mx-auto mb-1 text-[#d5a538]" />
          <p className="text-white font-bold text-lg">{data.trips}</p>
          <p className="text-white/30 text-[10px] uppercase tracking-wide">Jobs</p>
        </div>
        <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
          <Clock size={16} className="mx-auto mb-1 text-[#d5a538]" />
          <p className="text-white font-bold text-lg">{data.hours}h</p>
          <p className="text-white/30 text-[10px] uppercase tracking-wide">Online</p>
        </div>
        <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
          <Star size={16} className="mx-auto mb-1 text-[#d5a538]" />
          <p className="text-white font-bold text-lg">{WEEK_STATS.avgRating}</p>
          <p className="text-white/30 text-[10px] uppercase tracking-wide">Rating</p>
        </div>
      </div>

      {/* Per-job Average */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} className="text-[#d5a538]" />
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Averages</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-white/40 text-xs">Per job</p>
            <p className="text-white font-semibold text-base mt-0.5">
              £{(data.total / (data.trips || 1)).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-white/40 text-xs">Per hour</p>
            <p className="text-white font-semibold text-base mt-0.5">
              £{(data.total / (data.hours || 1)).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Trips */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-semibold text-sm">Recent Jobs</h2>
      </div>

      <div className="space-y-3">
        {MOCK_EARNINGS.map((entry) => (
          <div key={entry.jobId} className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-white font-medium text-sm">{entry.passenger}</p>
                <p className="text-white/30 text-xs mt-0.5">{entry.date}</p>
              </div>
              <div className="text-right">
                <p className="text-[#d5a538] font-bold">£{entry.total.toFixed(2)}</p>
                {entry.tip > 0 && (
                  <p className="text-green-400 text-xs mt-0.5">+£{entry.tip.toFixed(2)} tip</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/30">
              <span>{entry.pickup}</span>
              <span>→</span>
              <span>{entry.dropoff}</span>
            </div>
            {entry.rating && (
              <div className="flex items-center gap-0.5 mt-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={11}
                    className={i < entry.rating! ? 'text-[#d5a538]' : 'text-white/15'}
                    fill={i < entry.rating! ? '#d5a538' : 'none'}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
