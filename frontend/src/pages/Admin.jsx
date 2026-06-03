import React, { useState } from 'react'
import { Plus, Trash2, X, CheckCircle2, Info, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../store'

const TABS = ['Crops','Inventory','Labour']

export default function Admin() {
  const [tab, setTab] = useState('Crops')
  return (
    <div className="h-full flex flex-col bg-[#0f1117]">
      <div className="shrink-0 px-4 pt-4 pb-0">
        <h2 className="text-lg font-bold text-white">Admin — Masters</h2>
        <p className="text-xs text-white/40 mb-3">Manage crop types, inventory items, labour categories</p>
        <div className="flex gap-2 border-b border-white/8">
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${tab===t?'border-[#1D9E75] text-[#1D9E75]':'border-transparent text-white/40'}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab==='Crops'    && <CropsMaster />}
        {tab==='Inventory'&& <InventoryMaster />}
        {tab==='Labour'   && <LabourMaster />}
      </div>
    </div>
  )
}

function CropsMaster() {
  const { cropMaster, cropCycles, addCrop, deleteCrop } = useAppStore()
  const [form, setForm] = useState(null)
  const [toast, setToast] = useState(null)
  const [toastType, setToastType] = useState('success')
  const showToast = (m, type='success') => { setToast(m); setToastType(type); setTimeout(()=>setToast(null),3000) }

  const save = () => {
    if (!form.name||!form.duration_days) return
    addCrop({ name:form.name, emoji:form.emoji||'🌾', color:form.color||'rgba(220,180,40,0.65)',
      outline:form.color||'rgba(220,180,40,0.9)', duration_days:parseInt(form.duration_days),
      pricePerQtl:parseFloat(form.pricePerQtl)||0, yieldPerAcre:parseFloat(form.yieldPerAcre)||0,
      activities:[] })
    showToast('Crop added'); setForm(null)
  }

  const handleDelete = (id) => {
    const result = deleteCrop(id)
    if (result?.blocked) {
      showToast(`Cannot delete — ${result.count} active cycle${result.count>1?'s':''} use this crop`, 'warn')
    } else {
      showToast('Crop removed')
    }
  }

  const COLORS = [
    { label:'Golden (Wheat)',  fill:'rgba(220,180,40,0.65)'  },
    { label:'Teal (Sugarcane)',fill:'rgba(29,158,117,0.55)'  },
    { label:'Amber (Mustard)', fill:'rgba(186,117,23,0.65)'  },
    { label:'Aqua (Paddy)',    fill:'rgba(100,180,150,0.60)' },
    { label:'Green (Grass)',   fill:'rgba(134,179,53,0.45)'  },
    { label:'Blue (Other)',    fill:'rgba(120,140,200,0.55)' },
  ]

  return (
    <div className="p-4 space-y-3 pb-6">
      <button onClick={()=>setForm({})} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
        <Plus size={14}/> Add Crop to Master
      </button>

      {form!==null&&(
        <div className="bg-[#161a23] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1D9E75]">New Crop</p>
          <FRow label="Crop name"><input className="finput" placeholder="e.g. Cotton" value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></FRow>
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Emoji"><input className="finput" placeholder="🌾" value={form.emoji||''} onChange={e=>setForm(p=>({...p,emoji:e.target.value}))}/></FRow>
            <FRow label="Duration (days)"><input type="number" className="finput" placeholder="120" value={form.duration_days||''} onChange={e=>setForm(p=>({...p,duration_days:e.target.value}))}/></FRow>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Yield/acre (qtl)"><input type="number" className="finput" value={form.yieldPerAcre||''} onChange={e=>setForm(p=>({...p,yieldPerAcre:e.target.value}))}/></FRow>
            <FRow label="Price/qtl (₹)"><input type="number" className="finput" value={form.pricePerQtl||''} onChange={e=>setForm(p=>({...p,pricePerQtl:e.target.value}))}/></FRow>
          </div>
          <FRow label="Map colour">
            <select className="finput" value={form.color||''} onChange={e=>setForm(p=>({...p,color:e.target.value}))} style={{background:'#1a2030'}}>
              <option value="" style={{background:'#1a2030'}}>Select…</option>
              {COLORS.map(c=><option key={c.fill} value={c.fill} style={{background:'#1a2030'}}>{c.label}</option>)}
            </select>
          </FRow>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl">Save</button>
            <button onClick={()=>setForm(null)} className="px-4 py-2.5 bg-white/8 text-white/60 text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {cropMaster.map(c=>{
        const activeCycles = cropCycles.filter(cc=>cc.cropId===c.id && cc.status==='active').length
        return (
          <div key={c.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg shrink-0" style={{background:c.color}}/>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{c.emoji} {c.name}</p>
              <p className="text-[10px] text-white/40">{c.duration_days} days · {c.yieldPerAcre} qtl/ac · ₹{c.pricePerQtl}/qtl</p>
              {activeCycles>0 && <p className="text-[10px] text-[#1D9E75] mt-0.5">{activeCycles} active cycle{activeCycles>1?'s':''}</p>}
            </div>
            <button onClick={()=>handleDelete(c.id)} className="text-white/20 hover:text-[#E24B4A] shrink-0 ml-2"><Trash2 size={15}/></button>
          </div>
        )
      })}
      {toast&&<Toast msg={toast} type={toastType}/>}
      <Style/>
    </div>
  )
}

function InventoryMaster() {
  const { inventoryMaster, addInventoryItem, deleteInventoryItem } = useAppStore()
  const [form, setForm] = useState(null)
  const [toast, setToast] = useState(null)
  const [toastType, setToastType] = useState('success')
  const showToast = (m, type='success') => { setToast(m); setToastType(type); setTimeout(()=>setToast(null),3000) }
  const CATS = ['seed','fertilizer','chemical','fuel','other']
  const CAT_LABEL = { seed:'Seed', fertilizer:'Fertilizer', chemical:'Chemical', fuel:'Fuel', other:'Other' }

  const save = () => {
    if (!form.name||!form.category||!form.unit) return
    addInventoryItem({ name:form.name, category:form.category, unit:form.unit,
      minThreshold:parseFloat(form.minThreshold)||0, costPerUnit:parseFloat(form.costPerUnit)||0 })
    showToast('Item added'); setForm(null)
  }

  const handleDelete = (id) => {
    const result = deleteInventoryItem(id)
    if (result?.blocked) {
      showToast('Cannot delete — item has purchase or issue records', 'warn')
    } else {
      showToast('Item removed')
    }
  }

  return (
    <div className="p-4 space-y-3 pb-6">
      <button onClick={()=>setForm({category:'fertilizer'})} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
        <Plus size={14}/> Add Inventory Item
      </button>

      {form!==null&&(
        <div className="bg-[#161a23] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1D9E75]">New Item</p>
          <FRow label="Name"><input className="finput" placeholder="e.g. DAP" value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></FRow>
          <FRow label="Category">
            <select className="finput" value={form.category||''} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={{background:'#1a2030'}}>
              {CATS.map(c=><option key={c} value={c} style={{background:'#1a2030'}}>{CAT_LABEL[c]}</option>)}
            </select>
          </FRow>
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Unit"><input className="finput" placeholder="kg/litre/bag" value={form.unit||''} onChange={e=>setForm(p=>({...p,unit:e.target.value}))}/></FRow>
            <FRow label="Cost/unit (₹)"><input type="number" className="finput" value={form.costPerUnit||''} onChange={e=>setForm(p=>({...p,costPerUnit:e.target.value}))}/></FRow>
          </div>
          <FRow label="Min stock alert"><input type="number" className="finput" placeholder="0" value={form.minThreshold||''} onChange={e=>setForm(p=>({...p,minThreshold:e.target.value}))}/></FRow>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl">Save</button>
            <button onClick={()=>setForm(null)} className="px-4 py-2.5 bg-white/8 text-white/60 text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {inventoryMaster.map(i=>(
        <div key={i.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">{i.name}</p>
            <p className="text-[10px] text-white/40">{CAT_LABEL[i.category]} · {i.unit} · ₹{i.costPerUnit}/unit · min {i.minThreshold}</p>
            <p className="text-[10px] text-[#1D9E75] mt-0.5">Stock: {i.currentStock} {i.unit}</p>
          </div>
          <button onClick={()=>handleDelete(i.id)} className="text-white/20 hover:text-[#E24B4A] ml-3"><Trash2 size={15}/></button>
        </div>
      ))}
      {toast&&<Toast msg={toast} type={toastType}/>}
      <Style/>
    </div>
  )
}

const WORK_TYPES = ['Farm Worker','Driver','Cook','Cleaning','Watchman','Gardener','Mechanic','Other']

function LabourMaster() {
  const { regularLabourers, contractualLabour, addRegularLabourer, deleteRegularLabourer, addContractualLabour, deleteContractualLabour } = useAppStore()
  const [tab, setTab]   = useState('regular')
  const [form, setForm] = useState(null)
  const [toast, setToast] = useState(null)
  const showToast = (m) => { setToast(m); setTimeout(()=>setToast(null),2500) }

  const saveRegular = () => {
    if (!form.name||!form.workType) return
    addRegularLabourer({ name:form.name, workType:form.workType, ratePerDay:parseFloat(form.ratePerDay)||400, phone:form.phone||'' })
    showToast('Labourer added'); setForm(null)
  }
  const saveContractual = () => {
    if (!form.name||!form.defaultRate) return
    addContractualLabour({ name:form.name, defaultRate:parseFloat(form.defaultRate) })
    showToast('Category added'); setForm(null)
  }

  return (
    <div className="p-4 space-y-3 pb-6">
      <div className="flex gap-1 bg-[#161a23] rounded-xl p-1">
        {[['regular','👤 Regular'],['contractual','🏗️ Contractual']].map(([k,lbl])=>(
          <button key={k} onClick={()=>{ setTab(k); setForm(null) }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${tab===k?'bg-[#1D9E75] text-white':'text-white/40'}`}>{lbl}</button>
        ))}
      </div>

      {tab==='regular' && (<>
        <p className="text-[11px] text-white/30 px-1">People you regularly call — tracked by name, work type and rate.</p>
        <button onClick={()=>setForm({workType:'Farm Worker'})} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
          <Plus size={14}/> Add Regular Labourer
        </button>
        {form!==null&&(
          <div className="bg-[#161a23] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
            <p className="text-xs font-bold text-[#1D9E75]">New Regular Labourer</p>
            <FRow label="Full name"><input className="finput" placeholder="e.g. Ramesh Kumar" value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></FRow>
            <FRow label="Kind of work">
              <select className="finput" value={form.workType||''} onChange={e=>setForm(p=>({...p,workType:e.target.value}))} style={{background:'#1a2030'}}>
                {WORK_TYPES.map(w=><option key={w} value={w} style={{background:'#1a2030'}}>{w}</option>)}
              </select>
            </FRow>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Rate/day (₹)"><input type="number" className="finput" placeholder="400" value={form.ratePerDay||''} onChange={e=>setForm(p=>({...p,ratePerDay:e.target.value}))}/></FRow>
              <FRow label="Phone"><input type="tel" className="finput" placeholder="optional" value={form.phone||''} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/></FRow>
            </div>
            <div className="flex gap-2">
              <button onClick={saveRegular} className="flex-1 py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl">Save</button>
              <button onClick={()=>setForm(null)} className="px-4 py-2.5 bg-white/8 text-white/60 text-xs rounded-xl">Cancel</button>
            </div>
          </div>
        )}
        {regularLabourers.map(l=>(
          <div key={l.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1D9E75]/15 flex items-center justify-center text-sm font-bold text-[#1D9E75] shrink-0">{l.name.charAt(0)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{l.name}</p>
              <p className="text-[10px] text-white/40">{l.workType} · ₹{l.ratePerDay}/day{l.phone?` · ${l.phone}`:''}</p>
            </div>
            <button onClick={()=>deleteRegularLabourer(l.id)} className="text-white/15 hover:text-[#E24B4A] shrink-0"><Trash2 size={15}/></button>
          </div>
        ))}
      </>)}

      {tab==='contractual' && (<>
        <p className="text-[11px] text-white/30 px-1">Bulk workers for harvesting, ploughing etc. Tracked by category, not individual name.</p>
        <button onClick={()=>setForm({})} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
          <Plus size={14}/> Add Labour Category
        </button>
        {form!==null&&(
          <div className="bg-[#161a23] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
            <p className="text-xs font-bold text-[#1D9E75]">New Category</p>
            <FRow label="Category name"><input className="finput" placeholder="e.g. Harvesting Labour" value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></FRow>
            <FRow label="Standard rate/day (₹)"><input type="number" className="finput" placeholder="400" value={form.defaultRate||''} onChange={e=>setForm(p=>({...p,defaultRate:e.target.value}))}/></FRow>
            <div className="flex gap-2">
              <button onClick={saveContractual} className="flex-1 py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl">Save</button>
              <button onClick={()=>setForm(null)} className="px-4 py-2.5 bg-white/8 text-white/60 text-xs rounded-xl">Cancel</button>
            </div>
          </div>
        )}
        {contractualLabour.map(l=>(
          <div key={l.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{l.name}</p>
              <p className="text-[10px] text-white/40">₹{l.defaultRate}/day standard rate</p>
            </div>
            <button onClick={()=>deleteContractualLabour(l.id)} className="text-white/15 hover:text-[#E24B4A]"><Trash2 size={15}/></button>
          </div>
        ))}
      </>)}
      {toast&&<Toast msg={toast}/>}
      <Style/>
    </div>
  )
}

const FRow = ({label,children}) => <div><label className="text-xs font-medium text-white/50 block mb-1.5">{label}</label>{children}</div>

function Toast({ msg, type='success' }) {
  const bg = type==='warn' ? '#BA7517' : '#1D9E75'
  const Icon = type==='warn' ? AlertTriangle : CheckCircle2
  return (
    <div className="fixed bottom-24 left-4 right-4 px-4 py-3 rounded-2xl text-sm font-medium text-white shadow-xl z-50 flex items-center gap-2" style={{background:bg}}>
      <Icon size={16}/> {msg}
    </div>
  )
}

const Style = () => <style>{`.finput{width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:10px 14px;color:white;font-size:14px;outline:none;}.finput:focus{border-color:#1D9E75;}`}</style>
