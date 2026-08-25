import { Plus } from 'lucide-react'

// The one "add a record" row every register uses, at the TOP of its list — the
// Herd tab's dashed "+ Add Animal", promoted to the app-wide shape (owner, 25 Aug:
// "in my opinion this is better; assets and inventory should have a similar add").
export default function AddButton({ onClick, children, className = '' }) {
  return (
    <button onClick={onClick}
      className={`w-full py-2.5 rounded-xl text-xs font-semibold border-2 border-dashed flex items-center justify-center gap-2 ${className}`}
      style={{ borderColor: '#8A9A5B40', color: '#8A9A5B', background: '#8A9A5B08' }}>
      <Plus size={14} /> {children}
    </button>
  )
}
