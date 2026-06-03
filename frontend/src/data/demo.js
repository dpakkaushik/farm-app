// ── Shared demo data ─────────────────────────────────────────────────────────
// In production this all comes from the FastAPI backend.
// Today: 2026-05-25

export const CROP_TEMPLATES = [
  {
    id: 'wheat', name: 'Wheat (Rabi)', emoji: '🌾', duration_days: 120,
    activities: [
      { day: 0,   type: 'sowing',      label: 'Sowing — issue seeds to field',          inputs: ['Wheat Seeds'] },
      { day: 7,   type: 'irrigation',  label: 'First irrigation after sowing',           inputs: [] },
      { day: 14,  type: 'fertilizer',  label: 'Basal dose — DAP',                       inputs: ['DAP'] },
      { day: 21,  type: 'irrigation',  label: 'Second irrigation',                       inputs: [] },
      { day: 30,  type: 'weeding',     label: 'First weeding',                           inputs: [] },
      { day: 35,  type: 'irrigation',  label: 'Crown root irrigation',                   inputs: [] },
      { day: 45,  type: 'fertilizer',  label: 'Top dressing — Urea',                    inputs: ['Urea'] },
      { day: 55,  type: 'irrigation',  label: 'Jointing stage irrigation',               inputs: [] },
      { day: 65,  type: 'pesticide',   label: 'Pesticide spray (if needed)',              inputs: ['Chlorpyrifos'] },
      { day: 75,  type: 'irrigation',  label: 'Heading stage irrigation',                inputs: [] },
      { day: 90,  type: 'irrigation',  label: 'Grain filling irrigation',                inputs: [] },
      { day: 110, type: 'irrigation',  label: 'Pre-harvest irrigation',                  inputs: [] },
      { day: 120, type: 'harvest',     label: 'Harvest',                                 inputs: [] },
    ],
  },
  {
    id: 'mustard', name: 'Mustard', emoji: '🌻', duration_days: 110,
    activities: [
      { day: 0,   type: 'sowing',      label: 'Sowing',                                  inputs: ['Mustard Seeds'] },
      { day: 10,  type: 'irrigation',  label: 'First irrigation',                        inputs: [] },
      { day: 20,  type: 'fertilizer',  label: 'Basal dose — DAP + Urea',                inputs: ['DAP','Urea'] },
      { day: 30,  type: 'irrigation',  label: 'Second irrigation',                       inputs: [] },
      { day: 40,  type: 'weeding',     label: 'Weeding',                                 inputs: [] },
      { day: 50,  type: 'fertilizer',  label: 'Top dressing — Urea',                    inputs: ['Urea'] },
      { day: 60,  type: 'irrigation',  label: 'Third irrigation',                        inputs: [] },
      { day: 70,  type: 'irrigation',  label: 'Fourth irrigation (flowering)',            inputs: [] },
      { day: 80,  type: 'pesticide',   label: 'Aphid spray if needed',                   inputs: ['Chlorpyrifos'] },
      { day: 110, type: 'harvest',     label: 'Harvest',                                 inputs: [] },
    ],
  },
  {
    id: 'sugarcane', name: "Sugarcane (Plant Crop)", emoji: '🎋', duration_days: 365,
    activities: [
      { day: 0,   type: 'sowing',      label: 'Planting setts',                          inputs: ['Sugarcane Setts'] },
      { day: 30,  type: 'irrigation',  label: 'Irrigation',                              inputs: [] },
      { day: 45,  type: 'fertilizer',  label: 'Nitrogen — Urea first dose',              inputs: ['Urea'] },
      { day: 60,  type: 'weeding',     label: 'Weeding + earthing up',                   inputs: [] },
      { day: 90,  type: 'irrigation',  label: 'Irrigation',                              inputs: [] },
      { day: 120, type: 'fertilizer',  label: 'Potash + Urea second dose',               inputs: ['Urea','Potash (MOP)'] },
      { day: 150, type: 'irrigation',  label: 'Irrigation',                              inputs: [] },
      { day: 210, type: 'irrigation',  label: 'Irrigation',                              inputs: [] },
      { day: 240, type: 'fertilizer',  label: 'Third fertilizer dose',                   inputs: ['Urea'] },
      { day: 300, type: 'irrigation',  label: 'Irrigation',                              inputs: [] },
      { day: 365, type: 'harvest',     label: 'Harvest — crush season',                  inputs: [] },
    ],
  },
  {
    id: 'paddy', name: 'Paddy / Rice (Kharif)', emoji: '🌾', duration_days: 130,
    activities: [
      { day: 0,   type: 'sowing',      label: 'Transplanting seedlings',                 inputs: ['Paddy Seeds'] },
      { day: 10,  type: 'fertilizer',  label: 'Basal dose',                              inputs: ['DAP'] },
      { day: 20,  type: 'weeding',     label: 'First weeding',                           inputs: [] },
      { day: 35,  type: 'fertilizer',  label: 'Urea first dose',                         inputs: ['Urea'] },
      { day: 50,  type: 'pesticide',   label: 'Pesticide spray',                         inputs: ['Chlorpyrifos'] },
      { day: 70,  type: 'fertilizer',  label: 'Urea second dose',                        inputs: ['Urea'] },
      { day: 100, type: 'irrigation',  label: 'Flush irrigation (last)',                  inputs: [] },
      { day: 130, type: 'harvest',     label: 'Harvest',                                 inputs: [] },
    ],
  },
]

export const INVENTORY = {
  seeds: [
    { id:'s1', name:'Wheat Seeds HD-3086', qty:120, unit:'kg',  cost_per_unit:45,  min_threshold:20, icon:'🌾' },
    { id:'s2', name:'Paddy Seeds PB-1121', qty:30,  unit:'kg',  cost_per_unit:55,  min_threshold:10, icon:'🌾' },
    { id:'s3', name:'Mustard Seeds',       qty:8,   unit:'kg',  cost_per_unit:110, min_threshold:5,  icon:'🌻' },
    { id:'s4', name:'Sugarcane Setts',     qty:400, unit:'kg',  cost_per_unit:4,   min_threshold:50, icon:'🎋' },
  ],
  fertilizers: [
    { id:'f1', name:'DAP',           qty:8,  unit:'bag (50kg)', cost_per_unit:1350, min_threshold:5,  icon:'🧪' },
    { id:'f2', name:'Urea',          qty:12, unit:'bag (50kg)', cost_per_unit:280,  min_threshold:10, icon:'🧪' },
    { id:'f3', name:'Potash (MOP)',   qty:4,  unit:'bag (50kg)', cost_per_unit:1100, min_threshold:2,  icon:'🧪' },
    { id:'f4', name:'Chlorpyrifos',  qty:2,  unit:'litre',      cost_per_unit:350,  min_threshold:3,  icon:'🧴' },
    { id:'f5', name:'FYM Manure',    qty:200,unit:'quintal',    cost_per_unit:80,   min_threshold:50, icon:'🌱' },
  ],
  machines: [
    { id:'m1', name:'Tractor (35HP)',      qty:1, unit:'unit',    status:'available', icon:'🚜' },
    { id:'m2', name:'Rotavator',           qty:1, unit:'unit',    status:'available', icon:'🔧' },
    { id:'m3', name:'Water Pump (7.5HP)',  qty:2, unit:'unit',    status:'available', icon:'💧' },
    { id:'m4', name:'Sprayer (Manual)',    qty:3, unit:'unit',    status:'available', icon:'🔫' },
    { id:'m5', name:'Thresher',           qty:1, unit:'unit',    status:'in-use',    icon:'⚙️' },
    { id:'m6', name:'Diesel',             qty:80, unit:'litre',  status:null,        icon:'⛽', min_threshold:20, cost_per_unit:95 },
  ],
  livestock: [
    { id:'l1', name:'Cows / Bullocks',  qty:2,  unit:'head',    notes:'For draft and organic manure',  icon:'🐄' },
    { id:'l2', name:'Buffaloes',        qty:1,  unit:'head',    notes:'Milk + draft work',              icon:'🐃' },
    { id:'l3', name:'Goats',            qty:6,  unit:'head',    notes:'Grazing on Plot N',              icon:'🐐' },
  ],
}

// Today = May 25, 2026 — tasks auto-generated from crop cycles
export const TODAY_TASKS = [
  {
    id:'t1', status:'overdue', overdue_days:2,
    plot:'Plot I', acres:2.5, crop:'Wheat', day_in_cycle:88,
    activity_type:'pesticide',
    label:'Follow-up pest spray — was due May 23',
    note:'Chlorpyrifos applied May 22. Check if yellowing has improved. Re-spray if needed.',
    suggested_inputs:[{ name:'Chlorpyrifos', qty:1, unit:'litre' }],
    suggested_labor: 1,
  },
  {
    id:'t2', status:'today',
    plot:'Plot B', acres:5.5, crop:'Mustard', day_in_cycle:70,
    activity_type:'irrigation',
    label:'Fourth irrigation — flowering stage',
    note:'Critical irrigation. Crop is in flowering — do not skip.',
    suggested_inputs:[{ name:'Diesel', qty:5, unit:'litre' }],
    suggested_labor: 1,
  },
  {
    id:'t3', status:'today',
    plot:'Plot E', acres:10.5, crop:'Cane + Mustard', day_in_cycle:160,
    activity_type:'fertilizer',
    label:'Urea top dressing',
    note:'Apply near base of sugarcane rows. Keep away from mustard plants.',
    suggested_inputs:[{ name:'Urea', qty:4, unit:'bag (50kg)' }],
    suggested_labor: 2,
  },
  {
    id:'t4', status:'today',
    plot:'Plot J', acres:4, crop:'Wheat', day_in_cycle:88,
    activity_type:'irrigation',
    label:'Grain filling irrigation',
    note:'Standard irrigation. 6th in wheat cycle.',
    suggested_inputs:[{ name:'Diesel', qty:3, unit:'litre' }],
    suggested_labor: 1,
  },
  {
    id:'t5', status:'today',
    plot:'Plot C', acres:5, crop:"Oct'24 Sugarcane", day_in_cycle:210,
    activity_type:'irrigation',
    label:'Irrigation (Day 210)',
    note:'Monthly irrigation for sugarcane.',
    suggested_inputs:[{ name:'Diesel', qty:4, unit:'litre' }],
    suggested_labor: 1,
  },
]

export const UPCOMING_TASKS = [
  { date:'Tomorrow',    plot:'Plot A',   crop:'Wheat',     label:'Final pre-harvest irrigation', activity_type:'irrigation' },
  { date:'Tomorrow',    plot:'Plot E',   crop:'Cane+Mustard', label:'Check mustard aphid presence', activity_type:'observation' },
  { date:'In 2 days',  plot:'Plot G',   crop:'Wheat',     label:'Final pre-harvest irrigation', activity_type:'irrigation' },
  { date:'In 3 days',  plot:'Plot D',   crop:'Sugarcane', label:'Weeding',                      activity_type:'weeding' },
  { date:'In 5 days',  plot:'Plot A',   crop:'Wheat',     label:'HARVEST WINDOW OPENS',         activity_type:'harvest' },
  { date:'In 5 days',  plot:'Plot F',   crop:'Wheat',     label:'Harvest ready — book labour',  activity_type:'harvest' },
]

// Fields with recently completed harvests (for harvest recording form)
export const HARVESTED_FIELDS = [
  { id:'f', label:'Plot F', acres:5,  crop:'Wheat', harvest_date:'2026-05-25', cycle_days:106 },
]

// Fields approaching harvest (can pre-record)
export const NEAR_HARVEST_FIELDS = [
  { id:'a', label:'Plot A', acres:1,   crop:'Wheat',   days_to_harvest:5  },
  { id:'g', label:'Plot G', acres:5,   crop:'Wheat',   days_to_harvest:15 },
  { id:'b', label:'Plot B', acres:5.5, crop:'Mustard', days_to_harvest:40 },
]

export const PAST_HARVESTS = [
  {
    id:'h1', date:'2025-04-10', crop:'Wheat', fields:'A, F, G, M, K, J',
    total_acres:21, qty_qtl:315, rate_per_qtl:2200, revenue:693000,
    labor_cost:28000, input_cost:161000, net_profit:504000,
    buyer:'Girish Traders — Lakhimpur', payment:'Received',
  },
  {
    id:'h2', date:'2024-11-15', crop:'Paddy', fields:'H, I, B',
    total_acres:16.5, qty_qtl:247, rate_per_qtl:1500, revenue:370500,
    labor_cost:22000, input_cost:126000, net_profit:222500,
    buyer:'Local mandi', payment:'Received',
  },
  {
    id:'h3', date:'2024-04-05', crop:'Wheat', fields:'A, F, G, M, K, J, I',
    total_acres:23.5, qty_qtl:329, rate_per_qtl:2000, revenue:658000,
    labor_cost:30000, input_cost:181500, net_profit:446500,
    buyer:'Girish Traders — Lakhimpur', payment:'Received',
  },
]

export const ACTIVITY_ICONS = {
  irrigation: '💧', fertilizer: '🧪', weeding: '🌿', pesticide: '🔫',
  sowing: '🌱', harvest: '🌾', observation: '👁', other: '📋',
}
