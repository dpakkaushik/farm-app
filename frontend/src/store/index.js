import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Masters ──────────────────────────────────────────────────────────────────
// cropMaster.activities = the activity schedule template for that crop.
// activities[].inputs = inventory item IDs from INVENTORY_MASTER_INIT.
// This is the single source of truth — Today.jsx reads templates from here,
// not from demo.js.

const CROP_MASTER_INIT = [
  {
    id: 'wheat', name: 'Wheat', emoji: '🌾',
    color: 'rgba(220,180,40,0.65)', outline: 'rgba(220,180,40,0.9)',
    duration_days: 120, pricePerQtl: 2200, yieldPerAcre: 15,
    activities: [
      { day: 0,   type: 'sowing',     label: 'Sowing — issue seeds to field',  inputs: ['s1'] },
      { day: 7,   type: 'irrigation', label: 'First irrigation after sowing',   inputs: [] },
      { day: 14,  type: 'fertilizer', label: 'Basal dose — DAP',               inputs: ['f1'] },
      { day: 21,  type: 'irrigation', label: 'Second irrigation',               inputs: [] },
      { day: 30,  type: 'weeding',    label: 'First weeding',                   inputs: [] },
      { day: 35,  type: 'irrigation', label: 'Crown root irrigation',            inputs: [] },
      { day: 45,  type: 'fertilizer', label: 'Top dressing — Urea',            inputs: ['f2'] },
      { day: 55,  type: 'irrigation', label: 'Jointing stage irrigation',        inputs: [] },
      { day: 65,  type: 'pesticide',  label: 'Pesticide spray (if needed)',      inputs: ['c1'] },
      { day: 75,  type: 'irrigation', label: 'Heading stage irrigation',         inputs: [] },
      { day: 90,  type: 'irrigation', label: 'Grain filling irrigation',         inputs: [] },
      { day: 110, type: 'irrigation', label: 'Pre-harvest irrigation',           inputs: [] },
      { day: 120, type: 'harvest',    label: 'Harvest',                         inputs: [] },
    ],
  },
  {
    id: 'sugarcane', name: 'Sugarcane', emoji: '🎋',
    color: 'rgba(29,158,117,0.55)', outline: 'rgba(29,158,117,0.85)',
    duration_days: 365, pricePerQtl: 350, yieldPerAcre: 280,
    activities: [
      { day: 0,   type: 'sowing',     label: 'Planting setts',                  inputs: ['s4'] },
      { day: 30,  type: 'irrigation', label: 'Irrigation',                       inputs: [] },
      { day: 45,  type: 'fertilizer', label: 'Nitrogen — Urea first dose',       inputs: ['f2'] },
      { day: 60,  type: 'weeding',    label: 'Weeding + earthing up',            inputs: [] },
      { day: 90,  type: 'irrigation', label: 'Irrigation',                       inputs: [] },
      { day: 120, type: 'fertilizer', label: 'Potash + Urea second dose',        inputs: ['f2', 'f3'] },
      { day: 150, type: 'irrigation', label: 'Irrigation',                       inputs: [] },
      { day: 210, type: 'irrigation', label: 'Irrigation',                       inputs: [] },
      { day: 240, type: 'fertilizer', label: 'Third fertilizer dose',            inputs: ['f2'] },
      { day: 300, type: 'irrigation', label: 'Irrigation',                       inputs: [] },
      { day: 365, type: 'harvest',    label: 'Harvest — crush season',           inputs: [] },
    ],
  },
  {
    id: 'mustard', name: 'Mustard', emoji: '🌻',
    color: 'rgba(186,117,23,0.65)', outline: 'rgba(186,117,23,0.85)',
    duration_days: 110, pricePerQtl: 5000, yieldPerAcre: 8,
    activities: [
      { day: 0,   type: 'sowing',     label: 'Sowing',                          inputs: ['s3'] },
      { day: 10,  type: 'irrigation', label: 'First irrigation',                 inputs: [] },
      { day: 20,  type: 'fertilizer', label: 'Basal dose — DAP + Urea',         inputs: ['f1', 'f2'] },
      { day: 30,  type: 'irrigation', label: 'Second irrigation',                inputs: [] },
      { day: 40,  type: 'weeding',    label: 'Weeding',                         inputs: [] },
      { day: 50,  type: 'fertilizer', label: 'Top dressing — Urea',             inputs: ['f2'] },
      { day: 60,  type: 'irrigation', label: 'Third irrigation',                 inputs: [] },
      { day: 70,  type: 'irrigation', label: 'Fourth irrigation (flowering)',     inputs: [] },
      { day: 80,  type: 'pesticide',  label: 'Aphid spray if needed',            inputs: ['c1'] },
      { day: 110, type: 'harvest',    label: 'Harvest',                          inputs: [] },
    ],
  },
  {
    id: 'paddy', name: 'Paddy / Rice', emoji: '🌾',
    color: 'rgba(100,180,150,0.60)', outline: 'rgba(100,180,150,0.85)',
    duration_days: 130, pricePerQtl: 1900, yieldPerAcre: 20,
    activities: [
      { day: 0,   type: 'sowing',     label: 'Transplanting seedlings',          inputs: ['s2'] },
      { day: 10,  type: 'fertilizer', label: 'Basal dose',                       inputs: ['f1'] },
      { day: 20,  type: 'weeding',    label: 'First weeding',                    inputs: [] },
      { day: 35,  type: 'fertilizer', label: 'Urea first dose',                  inputs: ['f2'] },
      { day: 50,  type: 'pesticide',  label: 'Pesticide spray',                  inputs: ['c1'] },
      { day: 70,  type: 'fertilizer', label: 'Urea second dose',                 inputs: ['f2'] },
      { day: 100, type: 'irrigation', label: 'Flush irrigation (last)',           inputs: [] },
      { day: 130, type: 'harvest',    label: 'Harvest',                          inputs: [] },
    ],
  },
  {
    id: 'grass', name: 'Animal Grass', emoji: '🌿',
    color: 'rgba(134,179,53,0.45)', outline: 'rgba(134,179,53,0.7)',
    duration_days: null, pricePerQtl: null, yieldPerAcre: null,
    activities: [],
  },
]

// Inventory items. IDs are the FK target for:
//   purchases.itemId, issues.itemId, cropMaster[].activities[].inputs[]
const INVENTORY_MASTER_INIT = [
  { id: 's1', name: 'Wheat Seeds HD-3086',  category: 'seed',       unit: 'kg',         currentStock: 120, minThreshold: 20,  costPerUnit: 45   },
  { id: 's2', name: 'Paddy Seeds PB-1121',  category: 'seed',       unit: 'kg',         currentStock: 30,  minThreshold: 10,  costPerUnit: 55   },
  { id: 's3', name: 'Mustard Seeds',         category: 'seed',       unit: 'kg',         currentStock: 8,   minThreshold: 5,   costPerUnit: 110  },
  { id: 's4', name: 'Sugarcane Setts',       category: 'seed',       unit: 'kg',         currentStock: 400, minThreshold: 50,  costPerUnit: 4    },
  { id: 'f1', name: 'DAP',                   category: 'fertilizer', unit: 'bag (50kg)', currentStock: 8,   minThreshold: 5,   costPerUnit: 1350 },
  { id: 'f2', name: 'Urea',                  category: 'fertilizer', unit: 'bag (50kg)', currentStock: 12,  minThreshold: 10,  costPerUnit: 280  },
  { id: 'f3', name: 'Potash (MOP)',           category: 'fertilizer', unit: 'bag (50kg)', currentStock: 4,   minThreshold: 2,   costPerUnit: 1100 },
  { id: 'f4', name: 'Zinc Sulphate',          category: 'fertilizer', unit: 'kg',         currentStock: 15,  minThreshold: 5,   costPerUnit: 65   },
  { id: 'c1', name: 'Chlorpyrifos 50EC',     category: 'chemical',   unit: 'litre',      currentStock: 6,   minThreshold: 2,   costPerUnit: 350  },
  { id: 'c2', name: 'Glyphosate',            category: 'chemical',   unit: 'litre',      currentStock: 3,   minThreshold: 1,   costPerUnit: 280  },
  { id: 'o1', name: 'Diesel',                category: 'fuel',       unit: 'litre',      currentStock: 200, minThreshold: 50,  costPerUnit: 92   },
  { id: 'o2', name: 'Engine Oil',            category: 'other',      unit: 'litre',      currentStock: 5,   minThreshold: 2,   costPerUnit: 180  },
]

// Regular labourers — named individuals. FK: labourLogs.labourTypeId when type='regular'
const REGULAR_LABOURERS_INIT = [
  { id: 'rl1', name: 'Ramesh Kumar', workType: 'Farm Worker', ratePerDay: 400, phone: '' },
  { id: 'rl2', name: 'Suresh Singh', workType: 'Driver',      ratePerDay: 700, phone: '' },
  { id: 'rl3', name: 'Mohan Lal',    workType: 'Farm Worker', ratePerDay: 400, phone: '' },
  { id: 'rl4', name: 'Ramu Prasad',  workType: 'Farm Worker', ratePerDay: 400, phone: '' },
]

// Contractual labour categories. FK: labourLogs.labourTypeId when type='contractual'
const CONTRACTUAL_LABOUR_INIT = [
  { id: 'cl1', name: 'General Field Labour',   defaultRate: 400 },
  { id: 'cl2', name: 'Harvesting Labour',       defaultRate: 500 },
  { id: 'cl3', name: 'Spray / Chemical Labour', defaultRate: 400 },
  { id: 'cl4', name: 'Ploughing Labour',        defaultRate: 450 },
  { id: 'cl5', name: 'Irrigation Labour',       defaultRate: 350 },
]

// ─── Crop cycles ──────────────────────────────────────────────────────────────
// cropId → FK to cropMaster[].id
// Do NOT store cropName — derive it at display time via cropMaster.find(c => c.id === cropId)
const CROP_CYCLES_INIT = [
  { id: 'cc1',  plotId: 'p', plotLabel: 'Plot P', cropId: 'sugarcane', sowDate: '2025-10-27', harvestDate: '2026-10-27', status: 'active', acres: 1.5 },
  { id: 'cc2',  plotId: 'a', plotLabel: 'Plot A', cropId: 'wheat',     sowDate: '2026-02-15', harvestDate: '2026-06-15', status: 'active', acres: 2.0 },
  { id: 'cc3',  plotId: 'm', plotLabel: 'Plot M', cropId: 'wheat',     sowDate: '2026-02-27', harvestDate: '2026-06-27', status: 'active', acres: 2.0 },
  { id: 'cc4',  plotId: 'l', plotLabel: 'Plot L', cropId: 'sugarcane', sowDate: '2025-10-27', harvestDate: '2026-10-27', status: 'active', acres: 3.5 },
  { id: 'cc5',  plotId: 'k', plotLabel: 'Plot K', cropId: 'wheat',     sowDate: '2026-02-27', harvestDate: '2026-06-27', status: 'active', acres: 4.0 },
  { id: 'cc6',  plotId: 'j', plotLabel: 'Plot J', cropId: 'wheat',     sowDate: '2026-02-27', harvestDate: '2026-06-27', status: 'active', acres: 4.0 },
  { id: 'cc7',  plotId: 'i', plotLabel: 'Plot I', cropId: 'wheat',     sowDate: '2026-02-27', harvestDate: '2026-06-27', status: 'active', acres: 2.5 },
  { id: 'cc8',  plotId: 'b', plotLabel: 'Plot B', cropId: 'mustard',   sowDate: '2026-03-22', harvestDate: '2026-07-10', status: 'active', acres: 5.5 },
  { id: 'cc9',  plotId: 'c', plotLabel: 'Plot C', cropId: 'sugarcane', sowDate: '2025-10-27', harvestDate: '2026-10-27', status: 'active', acres: 5.0 },
  { id: 'cc10', plotId: 'd', plotLabel: 'Plot D', cropId: 'sugarcane', sowDate: '2025-10-27', harvestDate: '2026-10-27', status: 'active', acres: 5.0 },
  { id: 'cc11', plotId: 'e', plotLabel: 'Plot E', cropId: 'sugarcane', sowDate: '2025-12-17', harvestDate: '2026-08-20', status: 'active', acres: 7.0 },
  { id: 'cc12', plotId: 'f', plotLabel: 'Plot F', cropId: 'wheat',     sowDate: '2026-02-10', harvestDate: '2026-06-10', status: 'active', acres: 5.0 },
  { id: 'cc13', plotId: 'g', plotLabel: 'Plot G', cropId: 'wheat',     sowDate: '2026-02-22', harvestDate: '2026-06-22', status: 'active', acres: 3.0 },
]

// ─── Transactions ─────────────────────────────────────────────────────────────
// purchases.itemId → FK to inventoryMaster[].id
const PURCHASES_INIT = [
  { id: 'pu1', itemId: 'f1', date: '2026-04-10', qty: 15,  unitPrice: 1350, totalCost: 20250, vendor: 'Ram Fertilizers',  invoiceNo: 'RF-2024',  notes: 'Seasonal stock' },
  { id: 'pu2', itemId: 'f2', date: '2026-04-10', qty: 20,  unitPrice: 280,  totalCost: 5600,  vendor: 'Ram Fertilizers',  invoiceNo: 'RF-2025',  notes: '' },
  { id: 'pu3', itemId: 's1', date: '2025-11-01', qty: 200, unitPrice: 45,   totalCost: 9000,  vendor: 'Agri Seeds House', invoiceNo: 'ASH-110',  notes: 'Rabi seeds' },
  { id: 'pu4', itemId: 'o1', date: '2026-04-22', qty: 300, unitPrice: 92,   totalCost: 27600, vendor: 'HP Petrol Pump',   invoiceNo: 'HP-5521',  notes: 'Tractor fuel' },
  { id: 'pu5', itemId: 'c1', date: '2026-03-15', qty: 10,  unitPrice: 350,  totalCost: 3500,  vendor: 'Krishi Kendra',    invoiceNo: 'KK-889',   notes: 'Pest stock' },
]

// issues.itemId    → FK to inventoryMaster[].id
// issues.cropCycleId → FK to cropCycles[].id (null = farm-wide, not cycle-specific)
const ISSUES_INIT = [
  { id: 'is1', cropCycleId: 'cc2', itemId: 'f2', plotId: 'a',   plotLabel: 'Plot A', date: '2026-04-15', qty: 3,  totalCost: 840,  purpose: 'Top dressing Urea — Wheat',   activityType: 'fertilizer' },
  { id: 'is2', cropCycleId: 'cc3', itemId: 'f1', plotId: 'm',   plotLabel: 'Plot M', date: '2026-03-20', qty: 2,  totalCost: 2700, purpose: 'Basal dose DAP',               activityType: 'fertilizer' },
  { id: 'is3', cropCycleId: 'cc7', itemId: 'c1', plotId: 'i',   plotLabel: 'Plot I', date: '2026-05-22', qty: 2,  totalCost: 700,  purpose: 'Pest spray — yellowing leaves', activityType: 'pesticide'  },
  { id: 'is4', cropCycleId: null,  itemId: 'o1', plotId: 'all', plotLabel: 'All',    date: '2026-04-20', qty: 80, totalCost: 7360, purpose: 'Tractor fuel — ploughing',      activityType: 'other'      },
]

// labourLogs.labourTypeId → FK to contractualLabour[].id or regularLabourers[].id
const LABOUR_LOGS_INIT = [
  { id: 'll1', labourTypeId: 'cl1', labourName: 'General Field Labour',   plotId: 'b',   plotLabel: 'Plot B', date: '2026-05-18', workers: 8, hours: 8, ratePerDay: 400, totalCost: 3200, purpose: 'Weeding — Mustard' },
  { id: 'll2', labourTypeId: 'cl5', labourName: 'Irrigation Labour',      plotId: 'all', plotLabel: 'All',    date: '2026-05-20', workers: 4, hours: 6, ratePerDay: 350, totalCost: 1400, purpose: 'Irrigation supervision' },
  { id: 'll3', labourTypeId: 'cl1', labourName: 'General Field Labour',   plotId: 'k',   plotLabel: 'Plot K', date: '2026-04-05', workers: 6, hours: 8, ratePerDay: 400, totalCost: 2400, purpose: 'Weeding' },
]

// activities.cropCycleId → FK to cropCycles[].id
const ACTIVITIES_INIT = [
  { id: 'ac1', cropCycleId: 'cc2', plotId: 'a', plotLabel: 'Plot A', type: 'irrigation', date: '2026-05-15', notes: 'Final pre-harvest irrigation', workers: 2 },
  { id: 'ac2', cropCycleId: 'cc8', plotId: 'b', plotLabel: 'Plot B', type: 'weeding',    date: '2026-05-18', notes: 'Manual weeding done',           workers: 8 },
  { id: 'ac3', cropCycleId: 'cc7', plotId: 'i', plotLabel: 'Plot I', type: 'pesticide',  date: '2026-05-22', notes: 'Chlorpyrifos for yellowing',    workers: 2 },
]

const SCRAP_SALES_INIT = [
  { id: 'sc1', description: 'Empty fertilizer bags', date: '2026-04-25', qty: 45, unit: 'bags', rate: 12,   total: 540,  buyer: 'Kabadi Wala' },
  { id: 'sc2', description: 'Old tractor parts',     date: '2026-03-10', qty: 1,  unit: 'lot',  rate: 2500, total: 2500, buyer: 'Scrap dealer Ramesh' },
]

// mediaItems.plotId — loose reference to plot. In a future backend this becomes entity_type + entity_id.
const MEDIA_INIT = [
  { id: 'm1',  type: 'photo', plotId: 'a', plotLabel: 'Plot A', activity: 'irrigation', date: '2026-05-15', caption: 'First irrigation after sowing — soil moisture looking good', url: 'https://picsum.photos/seed/farm-irr-a/600/400',   uploadedBy: 'Manager' },
  { id: 'm2',  type: 'photo', plotId: 'b', plotLabel: 'Plot B', activity: 'weeding',    date: '2026-05-18', caption: 'Manual weeding complete — mustard rows clear',               url: 'https://picsum.photos/seed/farm-weed-b/600/400',  uploadedBy: 'Manager' },
  { id: 'm3',  type: 'photo', plotId: 'f', plotLabel: 'Plot F', activity: 'harvesting', date: '2026-05-20', caption: 'Wheat ready for harvest — golden and dry',                   url: 'https://picsum.photos/seed/farm-harv-f/600/400',  uploadedBy: 'Manager' },
  { id: 'm4',  type: 'video', plotId: 'c', plotLabel: 'Plot C', activity: 'irrigation', date: '2026-05-12', caption: 'Irrigation channel — even water distribution confirmed',     url: null, thumbnail: 'https://picsum.photos/seed/farm-vid-c/600/400',  duration: '0:42', uploadedBy: 'Manager' },
  { id: 'm5',  type: 'photo', plotId: 'i', plotLabel: 'Plot I', activity: 'pesticide',  date: '2026-05-22', caption: 'Yellowing on north corner — spray applied',                 url: 'https://picsum.photos/seed/farm-pest-i/600/400',  uploadedBy: 'Manager' },
  { id: 'm6',  type: 'photo', plotId: 'k', plotLabel: 'Plot K', activity: 'fertilizer', date: '2026-04-15', caption: 'Urea top dressing — even spread confirmed',                 url: 'https://picsum.photos/seed/farm-fert-k/600/400',  uploadedBy: 'Manager' },
  { id: 'm7',  type: 'photo', plotId: 'l', plotLabel: 'Plot L', activity: 'irrigation', date: '2026-04-20', caption: 'Sugarcane third irrigation — dense growth visible',          url: 'https://picsum.photos/seed/farm-cane-l/600/400',  uploadedBy: 'Manager' },
  { id: 'm8',  type: 'video', plotId: 'f', plotLabel: 'Plot F', activity: 'harvesting', date: '2026-04-28', caption: 'Harvester at work — wheat yield looking strong',            url: null, thumbnail: 'https://picsum.photos/seed/farm-hvid-f/600/400', duration: '1:15', uploadedBy: 'Manager' },
  { id: 'm9',  type: 'photo', plotId: 'a', plotLabel: 'Plot A', activity: 'weeding',    date: '2026-04-05', caption: 'Post-irrigation weeding — clean rows',                      url: 'https://picsum.photos/seed/farm-weed-a2/600/400', uploadedBy: 'Manager' },
  { id: 'm10', type: 'photo', plotId: 'b', plotLabel: 'Plot B', activity: 'sowing',     date: '2026-03-22', caption: 'Mustard sowing day — well-prepped bed',                     url: 'https://picsum.photos/seed/farm-sow-b/600/400',   uploadedBy: 'Manager' },
  { id: 'm11', type: 'photo', plotId: 'd', plotLabel: 'Plot D', activity: 'irrigation', date: '2026-04-18', caption: 'Plot D irrigation — sugarcane looking dense',               url: 'https://picsum.photos/seed/farm-irr-d/600/400',   uploadedBy: 'Manager' },
  { id: 'm12', type: 'photo', plotId: 'g', plotLabel: 'Plot G', activity: 'fertilizer', date: '2026-04-10', caption: 'DAP basal dose — before second irrigation',                url: 'https://picsum.photos/seed/farm-dap-g/600/400',   uploadedBy: 'Manager' },
]

// ─── Map store ────────────────────────────────────────────────────────────────
const useMapStore = create(
  persist(
    (set) => ({
      zoom: 15, center: [80.486362, 28.506379], bearing: 0, pitch: 0,
      setMapState: (state) => set(state),
      overlay: null,
      setOverlay: (overlay) => set({ overlay }),
      clearOverlay: () => set({ overlay: null }),
    }),
    { name: 'farm-map-state-v2', partialize: (s) => ({ zoom: s.zoom, center: s.center, bearing: s.bearing, pitch: s.pitch }) }
  )
)

// ─── Main app store ───────────────────────────────────────────────────────────
const useAppStore = create(
  persist(
    (set, get) => ({
      cropMaster:        CROP_MASTER_INIT,
      inventoryMaster:   INVENTORY_MASTER_INIT,
      regularLabourers:  REGULAR_LABOURERS_INIT,
      contractualLabour: CONTRACTUAL_LABOUR_INIT,
      purchases:         PURCHASES_INIT,
      issues:            ISSUES_INIT,
      labourLogs:        LABOUR_LOGS_INIT,
      activities:        ACTIVITIES_INIT,
      scrapSales:        SCRAP_SALES_INIT,
      cropCycles:        CROP_CYCLES_INIT,
      mediaItems:        MEDIA_INIT,
      sprayReminders:    [],

      // ── Crop master ──────────────────────────────────────────────────────────
      addCrop: (crop) => set(s => ({
        cropMaster: [...s.cropMaster, { ...crop, id: Date.now().toString(), activities: crop.activities || [] }],
      })),
      updateCrop: (id, data) => set(s => ({
        cropMaster: s.cropMaster.map(c => c.id === id ? { ...c, ...data } : c),
      })),
      // Returns { blocked: true, count: N } if active cycles reference this crop.
      // Caller must show a warning — do not delete in that case.
      deleteCrop: (id) => {
        const count = get().cropCycles.filter(c => c.cropId === id && c.status === 'active').length
        if (count > 0) return { blocked: true, count }
        set(s => ({ cropMaster: s.cropMaster.filter(c => c.id !== id) }))
        return { blocked: false }
      },

      // ── Inventory master ─────────────────────────────────────────────────────
      addInventoryItem: (item) => set(s => ({
        inventoryMaster: [...s.inventoryMaster, { ...item, id: Date.now().toString(), currentStock: 0 }],
      })),
      updateInventoryItem: (id, data) => set(s => ({
        inventoryMaster: s.inventoryMaster.map(i => i.id === id ? { ...i, ...data } : i),
      })),
      // Returns { blocked: true } if purchases or issues reference this item.
      deleteInventoryItem: (id) => {
        const hasPurchases = get().purchases.some(p => p.itemId === id)
        const hasIssues    = get().issues.some(i => i.itemId === id)
        if (hasPurchases || hasIssues) return { blocked: true }
        set(s => ({ inventoryMaster: s.inventoryMaster.filter(i => i.id !== id) }))
        return { blocked: false }
      },

      // ── Labour masters ───────────────────────────────────────────────────────
      addRegularLabourer:     (l)  => set(s => ({ regularLabourers:  [...s.regularLabourers,  { ...l,  id: 'rl' + Date.now() }] })),
      deleteRegularLabourer:  (id) => set(s => ({ regularLabourers:  s.regularLabourers.filter(l => l.id !== id) })),
      addContractualLabour:   (l)  => set(s => ({ contractualLabour: [...s.contractualLabour, { ...l,  id: 'cl' + Date.now() }] })),
      deleteContractualLabour:(id) => set(s => ({ contractualLabour: s.contractualLabour.filter(l => l.id !== id) })),

      // ── Purchases — adds stock ───────────────────────────────────────────────
      recordPurchase: (purchase) => {
        const id = 'pu' + Date.now()
        set(s => ({
          purchases: [{ ...purchase, id }, ...s.purchases],
          inventoryMaster: s.inventoryMaster.map(i =>
            i.id === purchase.itemId
              ? { ...i, currentStock: i.currentStock + purchase.qty, costPerUnit: purchase.unitPrice }
              : i
          ),
        }))
      },

      // ── Issue item to a crop cycle — reduces stock ───────────────────────────
      // issue.cropCycleId: FK to cropCycles (null for farm-wide issues like diesel)
      issueItem: (issue) => {
        const id = 'is' + Date.now()
        set(s => ({
          issues: [{ ...issue, id }, ...s.issues],
          inventoryMaster: s.inventoryMaster.map(i =>
            i.id === issue.itemId
              ? { ...i, currentStock: Math.max(0, i.currentStock - issue.qty) }
              : i
          ),
        }))
      },

      // ── Labour log ───────────────────────────────────────────────────────────
      logLabour: (log) => set(s => ({ labourLogs: [{ ...log, id: 'll' + Date.now() }, ...s.labourLogs] })),

      // ── Activity log ─────────────────────────────────────────────────────────
      // act.cropCycleId: FK to cropCycles
      logActivity: (act) => set(s => ({
        activities: [{ ...act, id: 'ac' + Date.now(), date: act.date || new Date().toISOString().slice(0, 10) }, ...s.activities],
      })),

      // ── Spray reminders ──────────────────────────────────────────────────────
      addSprayReminder:    (r)  => set(s => ({ sprayReminders: [{ ...r, id: 'sr' + Date.now(), done: false }, ...s.sprayReminders] })),
      dismissSprayReminder:(id) => set(s => ({ sprayReminders: s.sprayReminders.map(r => r.id === id ? { ...r, done: true } : r) })),

      // ── Scrap sale ───────────────────────────────────────────────────────────
      addScrapSale: (sale) => set(s => ({ scrapSales: [{ ...sale, id: 'sc' + Date.now() }, ...s.scrapSales] })),

      // ── Crop cycles ──────────────────────────────────────────────────────────
      // Store only cropId (FK to cropMaster). Never store cropName.
      addCropCycle:    (cycle) => set(s => ({ cropCycles: [{ ...cycle, id: 'cc' + Date.now() }, ...s.cropCycles] })),
      updateCropCycle: (id, data) => set(s => ({ cropCycles: s.cropCycles.map(c => c.id === id ? { ...c, ...data } : c) })),

      // ── Media ────────────────────────────────────────────────────────────────
      addMediaItem: (item) => set(s => ({ mediaItems: [{ ...item, id: 'm' + Date.now() }, ...s.mediaItems] })),
    }),
    {
      name: 'farm-app-v1',
      partialize: (s) => {
        const { mediaItems, ...rest } = s
        return rest
      },
    }
  )
)

// Legacy store (kept for Field.jsx compatibility)
const useFarmStore = create((set) => ({
  farm: null, plots: [], alerts: [], diary: null,
  setFarm:   (farm)   => set({ farm }),
  setPlots:  (plots)  => set({ plots }),
  setAlerts: (alerts) => set({ alerts }),
  setDiary:  (diary)  => set({ diary }),
}))

export { useMapStore, useAppStore, useFarmStore }
