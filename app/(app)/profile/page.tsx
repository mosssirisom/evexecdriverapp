import { logout } from '@/app/actions/auth'
import { MOCK_DRIVER } from '@/lib/mock-data'
import {
  Car,
  Star,
  Shield,
  FileCheck,
  ChevronRight,
  Phone,
  Mail,
  AlertTriangle,
  LogOut,
  Bell,
  HelpCircle,
} from 'lucide-react'

function DocRow({ label, expiry, status }: { label: string; expiry: string; status: string }) {
  const isWarning = status === 'expiring_soon'
  const isExpired = status === 'expired'
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3">
        {isWarning ? (
          <AlertTriangle size={15} className="text-amber-400 flex-shrink-0" />
        ) : (
          <FileCheck size={15} className={isExpired ? 'text-red-400' : 'text-green-400'} />
        )}
        <span className="text-white/80 text-sm">{label}</span>
      </div>
      <div className="text-right">
        <span
          className={`text-xs font-semibold ${
            isExpired ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-green-400'
          }`}
        >
          {isExpired ? 'Expired' : isWarning ? 'Expiring Soon' : 'Valid'}
        </span>
        <p className="text-white/30 text-[10px] mt-0.5">{expiry}</p>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const driver = MOCK_DRIVER
  const initials = driver.name.split(' ').map((n) => n[0]).join('')

  return (
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-4">
      <h1 className="text-white font-bold text-xl mb-6">Profile</h1>

      {/* Driver Card */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-[#020813] flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-lg">{driver.name}</h2>
            <p className="text-white/40 text-xs">{driver.id}</p>
            <div className="flex items-center gap-1 mt-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={13}
                  className={i < Math.floor(driver.rating) ? 'text-[#d5a538]' : 'text-white/15'}
                  fill={i < Math.floor(driver.rating) ? '#d5a538' : 'none'}
                />
              ))}
              <span className="text-[#d5a538] text-xs ml-1 font-semibold">{driver.rating}</span>
              <span className="text-white/30 text-xs">· {driver.totalTrips.toLocaleString()} trips</span>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <Mail size={14} className="text-white/30" />
            {driver.email}
          </div>
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <Phone size={14} className="text-white/30" />
            {driver.phone}
          </div>
        </div>
      </div>

      {/* Vehicle */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Car size={14} className="text-[#d5a538]" />
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Vehicle</p>
        </div>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-wide">Make & Model</p>
            <p className="text-white text-sm font-medium mt-0.5">{driver.vehicle.make} {driver.vehicle.model}</p>
          </div>
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-wide">Year</p>
            <p className="text-white text-sm font-medium mt-0.5">{driver.vehicle.year}</p>
          </div>
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-wide">Colour</p>
            <p className="text-white text-sm font-medium mt-0.5">{driver.vehicle.color}</p>
          </div>
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-wide">Registration</p>
            <p className="text-white text-sm font-medium mt-0.5 font-mono">{driver.vehicle.plate}</p>
          </div>
        </div>
      </div>

      {/* Documents */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={14} className="text-[#d5a538]" />
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Documents</p>
        </div>
        <DocRow
          label="Driver's Licence"
          status={driver.documents.license.status}
          expiry={driver.documents.license.expiry}
        />
        <DocRow
          label="Insurance"
          status={driver.documents.insurance.status}
          expiry={driver.documents.insurance.expiry}
        />
        <DocRow
          label="Vehicle Inspection"
          status={driver.documents.inspection.status}
          expiry={driver.documents.inspection.expiry}
        />
      </div>

      {/* Settings */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl overflow-hidden mb-4">
        {[
          { icon: Bell, label: 'Notifications' },
          { icon: HelpCircle, label: 'Help & Support' },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="w-full flex items-center justify-between px-4 py-3.5 border-b border-white/5 last:border-0 active:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <Icon size={16} className="text-white/40" />
              <span className="text-white/80 text-sm">{label}</span>
            </div>
            <ChevronRight size={15} className="text-white/20" />
          </button>
        ))}
      </div>

      {/* Logout */}
      <form action={logout}>
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-red-500/25 text-red-400 text-sm font-semibold bg-red-500/8 active:opacity-70 transition-opacity"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </form>

      <p className="text-center text-white/15 text-xs mt-4">EV Exec Driver v0.1.0</p>
    </div>
  )
}
