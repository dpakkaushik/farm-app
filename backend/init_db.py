"""Run this once: py init_db.py — creates farm_db, all tables, seeds master data."""
import pyodbc
from database import Base, engine
from models import *  # registers all models with Base


def create_database():
    conn = pyodbc.connect(
        "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;"
        "DATABASE=master;Trusted_Connection=yes;TrustServerCertificate=yes"
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("IF NOT EXISTS (SELECT name FROM sys.databases WHERE name='farm_db') CREATE DATABASE farm_db")
    conn.close()
    print("OK Database farm_db ready")


def create_tables():
    Base.metadata.create_all(bind=engine)
    print("OK All tables created")


def seed(db):
    from models.master import Plot, Crop, CropActivityTemplate, InventoryItem, Labourer, LabourCategory
    from models.ops import CropCycle, InventoryPurchase, InventoryIssue, ActivityLog, LabourLog
    from datetime import date

    if db.query(Crop).count() > 0:
        print("SKIP Data already seeded")
        return

    # ── Plots ──────────────────────────────────────────────────────────────────
    plots = [
        Plot(id="a", name="Plot A", area_acres=2.0,  soil_type="Loamy",  water_source="Borewell"),
        Plot(id="b", name="Plot B", area_acres=5.5,  soil_type="Loamy",  water_source="Borewell"),
        Plot(id="c", name="Plot C", area_acres=5.0,  soil_type="Clay",   water_source="Canal"),
        Plot(id="d", name="Plot D", area_acres=5.0,  soil_type="Clay",   water_source="Canal"),
        Plot(id="e", name="Plot E", area_acres=10.5, soil_type="Loamy",  water_source="Canal"),
        Plot(id="f", name="Plot F", area_acres=5.0,  soil_type="Loamy",  water_source="Borewell"),
        Plot(id="g", name="Plot G", area_acres=3.0,  soil_type="Sandy",  water_source="Borewell"),
        Plot(id="h", name="Plot H", area_acres=4.0,  soil_type="Sandy",  water_source="Rain-fed"),
        Plot(id="i", name="Plot I", area_acres=2.5,  soil_type="Loamy",  water_source="Borewell"),
        Plot(id="j", name="Plot J", area_acres=4.0,  soil_type="Loamy",  water_source="Borewell"),
        Plot(id="k", name="Plot K", area_acres=4.0,  soil_type="Loamy",  water_source="Borewell"),
        Plot(id="l", name="Plot L", area_acres=3.5,  soil_type="Clay",   water_source="Canal"),
        Plot(id="m", name="Plot M", area_acres=2.0,  soil_type="Loamy",  water_source="Borewell"),
        Plot(id="n", name="Plot N", area_acres=1.0,  soil_type="Sandy",  water_source="Rain-fed"),
        Plot(id="p", name="Plot P", area_acres=1.5,  soil_type="Loamy",  water_source="Borewell"),
    ]
    db.add_all(plots)

    # ── Crops ──────────────────────────────────────────────────────────────────
    crops = [
        Crop(id="wheat",     name="Wheat",        emoji="🌾", map_color="rgba(220,180,40,0.65)",  map_outline="rgba(220,180,40,0.9)",  duration_days=120, price_per_qtl=2200, yield_per_acre=15),
        Crop(id="sugarcane", name="Sugarcane",     emoji="🎋", map_color="rgba(29,158,117,0.55)",  map_outline="rgba(29,158,117,0.85)", duration_days=365, price_per_qtl=350,  yield_per_acre=280),
        Crop(id="mustard",   name="Mustard",       emoji="🌻", map_color="rgba(186,117,23,0.65)",  map_outline="rgba(186,117,23,0.85)", duration_days=110, price_per_qtl=5000, yield_per_acre=8),
        Crop(id="paddy",     name="Paddy / Rice",  emoji="🌾", map_color="rgba(100,180,150,0.60)", map_outline="rgba(100,180,150,0.85)",duration_days=130, price_per_qtl=1900, yield_per_acre=20),
        Crop(id="grass",     name="Animal Grass",  emoji="🌿", map_color="rgba(134,179,53,0.45)",  map_outline="rgba(134,179,53,0.7)",  duration_days=None,price_per_qtl=None, yield_per_acre=None),
    ]
    db.add_all(crops)

    # ── Activity Templates ─────────────────────────────────────────────────────
    templates = [
        # Wheat
        CropActivityTemplate(crop_id="wheat", day_number=0,   activity_type="sowing",     label="Sowing — issue seeds to field",  inputs="s1"),
        CropActivityTemplate(crop_id="wheat", day_number=7,   activity_type="irrigation", label="First irrigation after sowing",   inputs=""),
        CropActivityTemplate(crop_id="wheat", day_number=14,  activity_type="fertilizer", label="Basal dose — DAP",               inputs="f1"),
        CropActivityTemplate(crop_id="wheat", day_number=21,  activity_type="irrigation", label="Second irrigation",               inputs=""),
        CropActivityTemplate(crop_id="wheat", day_number=30,  activity_type="weeding",    label="First weeding",                   inputs=""),
        CropActivityTemplate(crop_id="wheat", day_number=35,  activity_type="irrigation", label="Crown root irrigation",            inputs=""),
        CropActivityTemplate(crop_id="wheat", day_number=45,  activity_type="fertilizer", label="Top dressing — Urea",            inputs="f2"),
        CropActivityTemplate(crop_id="wheat", day_number=55,  activity_type="irrigation", label="Jointing stage irrigation",        inputs=""),
        CropActivityTemplate(crop_id="wheat", day_number=65,  activity_type="pesticide",  label="Pesticide spray (if needed)",      inputs="c1"),
        CropActivityTemplate(crop_id="wheat", day_number=75,  activity_type="irrigation", label="Heading stage irrigation",         inputs=""),
        CropActivityTemplate(crop_id="wheat", day_number=90,  activity_type="irrigation", label="Grain filling irrigation",         inputs=""),
        CropActivityTemplate(crop_id="wheat", day_number=110, activity_type="irrigation", label="Pre-harvest irrigation",           inputs=""),
        CropActivityTemplate(crop_id="wheat", day_number=120, activity_type="harvest",    label="Harvest",                         inputs=""),
        # Sugarcane
        CropActivityTemplate(crop_id="sugarcane", day_number=0,   activity_type="sowing",     label="Planting setts",              inputs="s4"),
        CropActivityTemplate(crop_id="sugarcane", day_number=30,  activity_type="irrigation", label="Irrigation",                   inputs=""),
        CropActivityTemplate(crop_id="sugarcane", day_number=45,  activity_type="fertilizer", label="Urea first dose",              inputs="f2"),
        CropActivityTemplate(crop_id="sugarcane", day_number=60,  activity_type="weeding",    label="Weeding + earthing up",        inputs=""),
        CropActivityTemplate(crop_id="sugarcane", day_number=90,  activity_type="irrigation", label="Irrigation",                   inputs=""),
        CropActivityTemplate(crop_id="sugarcane", day_number=120, activity_type="fertilizer", label="Potash + Urea second dose",    inputs="f2,f3"),
        CropActivityTemplate(crop_id="sugarcane", day_number=150, activity_type="irrigation", label="Irrigation",                   inputs=""),
        CropActivityTemplate(crop_id="sugarcane", day_number=210, activity_type="irrigation", label="Irrigation",                   inputs=""),
        CropActivityTemplate(crop_id="sugarcane", day_number=240, activity_type="fertilizer", label="Third fertilizer dose",        inputs="f2"),
        CropActivityTemplate(crop_id="sugarcane", day_number=300, activity_type="irrigation", label="Irrigation",                   inputs=""),
        CropActivityTemplate(crop_id="sugarcane", day_number=365, activity_type="harvest",    label="Harvest — crush season",       inputs=""),
        # Mustard
        CropActivityTemplate(crop_id="mustard", day_number=0,   activity_type="sowing",     label="Sowing",                        inputs="s3"),
        CropActivityTemplate(crop_id="mustard", day_number=10,  activity_type="irrigation", label="First irrigation",               inputs=""),
        CropActivityTemplate(crop_id="mustard", day_number=20,  activity_type="fertilizer", label="Basal dose — DAP + Urea",       inputs="f1,f2"),
        CropActivityTemplate(crop_id="mustard", day_number=30,  activity_type="irrigation", label="Second irrigation",              inputs=""),
        CropActivityTemplate(crop_id="mustard", day_number=40,  activity_type="weeding",    label="Weeding",                       inputs=""),
        CropActivityTemplate(crop_id="mustard", day_number=50,  activity_type="fertilizer", label="Top dressing — Urea",           inputs="f2"),
        CropActivityTemplate(crop_id="mustard", day_number=60,  activity_type="irrigation", label="Third irrigation",               inputs=""),
        CropActivityTemplate(crop_id="mustard", day_number=70,  activity_type="irrigation", label="Fourth irrigation (flowering)",  inputs=""),
        CropActivityTemplate(crop_id="mustard", day_number=80,  activity_type="pesticide",  label="Aphid spray if needed",         inputs="c1"),
        CropActivityTemplate(crop_id="mustard", day_number=110, activity_type="harvest",    label="Harvest",                       inputs=""),
        # Paddy
        CropActivityTemplate(crop_id="paddy", day_number=0,   activity_type="sowing",     label="Transplanting seedlings",          inputs="s2"),
        CropActivityTemplate(crop_id="paddy", day_number=10,  activity_type="fertilizer", label="Basal dose",                       inputs="f1"),
        CropActivityTemplate(crop_id="paddy", day_number=20,  activity_type="weeding",    label="First weeding",                    inputs=""),
        CropActivityTemplate(crop_id="paddy", day_number=35,  activity_type="fertilizer", label="Urea first dose",                  inputs="f2"),
        CropActivityTemplate(crop_id="paddy", day_number=50,  activity_type="pesticide",  label="Pesticide spray",                  inputs="c1"),
        CropActivityTemplate(crop_id="paddy", day_number=70,  activity_type="fertilizer", label="Urea second dose",                 inputs="f2"),
        CropActivityTemplate(crop_id="paddy", day_number=100, activity_type="irrigation", label="Flush irrigation (last)",           inputs=""),
        CropActivityTemplate(crop_id="paddy", day_number=130, activity_type="harvest",    label="Harvest",                          inputs=""),
    ]
    db.add_all(templates)

    # ── Inventory Items ────────────────────────────────────────────────────────
    items = [
        InventoryItem(id="s1", name="Wheat Seeds HD-3086", category="seed",       unit="kg",         current_stock=120, min_threshold=20,  cost_per_unit=45),
        InventoryItem(id="s2", name="Paddy Seeds PB-1121", category="seed",       unit="kg",         current_stock=30,  min_threshold=10,  cost_per_unit=55),
        InventoryItem(id="s3", name="Mustard Seeds",        category="seed",       unit="kg",         current_stock=8,   min_threshold=5,   cost_per_unit=110),
        InventoryItem(id="s4", name="Sugarcane Setts",      category="seed",       unit="kg",         current_stock=400, min_threshold=50,  cost_per_unit=4),
        InventoryItem(id="f1", name="DAP",                  category="fertilizer", unit="bag (50kg)", current_stock=8,   min_threshold=5,   cost_per_unit=1350),
        InventoryItem(id="f2", name="Urea",                 category="fertilizer", unit="bag (50kg)", current_stock=12,  min_threshold=10,  cost_per_unit=280),
        InventoryItem(id="f3", name="Potash (MOP)",          category="fertilizer", unit="bag (50kg)", current_stock=4,   min_threshold=2,   cost_per_unit=1100),
        InventoryItem(id="f4", name="Zinc Sulphate",         category="fertilizer", unit="kg",         current_stock=15,  min_threshold=5,   cost_per_unit=65),
        InventoryItem(id="c1", name="Chlorpyrifos 50EC",    category="chemical",   unit="litre",      current_stock=6,   min_threshold=2,   cost_per_unit=350),
        InventoryItem(id="c2", name="Glyphosate",           category="chemical",   unit="litre",      current_stock=3,   min_threshold=1,   cost_per_unit=280),
        InventoryItem(id="o1", name="Diesel",               category="fuel",       unit="litre",      current_stock=200, min_threshold=50,  cost_per_unit=92),
        InventoryItem(id="o2", name="Engine Oil",           category="other",      unit="litre",      current_stock=5,   min_threshold=2,   cost_per_unit=180),
    ]
    db.add_all(items)

    # ── Labourers ──────────────────────────────────────────────────────────────
    db.add_all([
        Labourer(id="rl1", name="Ramesh Kumar", work_type="Farm Worker", rate_per_day=400),
        Labourer(id="rl2", name="Suresh Singh", work_type="Driver",      rate_per_day=700),
        Labourer(id="rl3", name="Mohan Lal",    work_type="Farm Worker", rate_per_day=400),
        Labourer(id="rl4", name="Ramu Prasad",  work_type="Farm Worker", rate_per_day=400),
    ])
    db.add_all([
        LabourCategory(id="cl1", name="General Field Labour",   default_rate=400),
        LabourCategory(id="cl2", name="Harvesting Labour",       default_rate=500),
        LabourCategory(id="cl3", name="Spray / Chemical Labour", default_rate=400),
        LabourCategory(id="cl4", name="Ploughing Labour",        default_rate=450),
        LabourCategory(id="cl5", name="Irrigation Labour",       default_rate=350),
    ])

    # ── Crop Cycles ────────────────────────────────────────────────────────────
    cycles = [
        CropCycle(id="cc1",  plot_id="p", crop_id="sugarcane", sow_date=date(2025,10,27), expected_harvest_date=date(2026,10,27), status="active", acres=1.5),
        CropCycle(id="cc2",  plot_id="a", crop_id="wheat",     sow_date=date(2026,2,15),  expected_harvest_date=date(2026,6,15),  status="active", acres=2.0),
        CropCycle(id="cc3",  plot_id="m", crop_id="wheat",     sow_date=date(2026,2,27),  expected_harvest_date=date(2026,6,27),  status="active", acres=2.0),
        CropCycle(id="cc4",  plot_id="l", crop_id="sugarcane", sow_date=date(2025,10,27), expected_harvest_date=date(2026,10,27), status="active", acres=3.5),
        CropCycle(id="cc5",  plot_id="k", crop_id="wheat",     sow_date=date(2026,2,27),  expected_harvest_date=date(2026,6,27),  status="active", acres=4.0),
        CropCycle(id="cc6",  plot_id="j", crop_id="wheat",     sow_date=date(2026,2,27),  expected_harvest_date=date(2026,6,27),  status="active", acres=4.0),
        CropCycle(id="cc7",  plot_id="i", crop_id="wheat",     sow_date=date(2026,2,27),  expected_harvest_date=date(2026,6,27),  status="active", acres=2.5),
        CropCycle(id="cc8",  plot_id="b", crop_id="mustard",   sow_date=date(2026,3,22),  expected_harvest_date=date(2026,7,10),  status="active", acres=5.5),
        CropCycle(id="cc9",  plot_id="c", crop_id="sugarcane", sow_date=date(2025,10,27), expected_harvest_date=date(2026,10,27), status="active", acres=5.0),
        CropCycle(id="cc10", plot_id="d", crop_id="sugarcane", sow_date=date(2025,10,27), expected_harvest_date=date(2026,10,27), status="active", acres=5.0),
        CropCycle(id="cc11", plot_id="e", crop_id="sugarcane", sow_date=date(2025,12,17), expected_harvest_date=date(2026,8,20),  status="active", acres=7.0),
        CropCycle(id="cc12", plot_id="f", crop_id="wheat",     sow_date=date(2026,2,10),  expected_harvest_date=date(2026,6,10),  status="active", acres=5.0),
        CropCycle(id="cc13", plot_id="g", crop_id="wheat",     sow_date=date(2026,2,22),  expected_harvest_date=date(2026,6,22),  status="active", acres=3.0),
    ]
    db.add_all(cycles)

    # ── Inventory Purchases ────────────────────────────────────────────────────
    db.add_all([
        InventoryPurchase(id="pu1", item_id="f1", purchase_date=date(2026,4,10), qty=15,  unit_price=1350, total_cost=20250, vendor="Ram Fertilizers",  invoice_no="RF-2024"),
        InventoryPurchase(id="pu2", item_id="f2", purchase_date=date(2026,4,10), qty=20,  unit_price=280,  total_cost=5600,  vendor="Ram Fertilizers",  invoice_no="RF-2025"),
        InventoryPurchase(id="pu3", item_id="s1", purchase_date=date(2025,11,1), qty=200, unit_price=45,   total_cost=9000,  vendor="Agri Seeds House", invoice_no="ASH-110"),
        InventoryPurchase(id="pu4", item_id="o1", purchase_date=date(2026,4,22), qty=300, unit_price=92,   total_cost=27600, vendor="HP Petrol Pump",   invoice_no="HP-5521"),
        InventoryPurchase(id="pu5", item_id="c1", purchase_date=date(2026,3,15), qty=10,  unit_price=350,  total_cost=3500,  vendor="Krishi Kendra",    invoice_no="KK-889"),
    ])

    # ── Inventory Issues ───────────────────────────────────────────────────────
    db.add_all([
        InventoryIssue(id="is1", cycle_id="cc2", item_id="f2", plot_id="a", plot_label="Plot A", issue_date=date(2026,4,15), qty=3,  total_cost=840,  purpose="Top dressing Urea",   activity_type="fertilizer"),
        InventoryIssue(id="is2", cycle_id="cc3", item_id="f1", plot_id="m", plot_label="Plot M", issue_date=date(2026,3,20), qty=2,  total_cost=2700, purpose="Basal dose DAP",       activity_type="fertilizer"),
        InventoryIssue(id="is3", cycle_id="cc7", item_id="c1", plot_id="i", plot_label="Plot I", issue_date=date(2026,5,22), qty=2,  total_cost=700,  purpose="Pest spray",           activity_type="pesticide"),
        InventoryIssue(id="is4", cycle_id=None,  item_id="o1", plot_id="",  plot_label="All",    issue_date=date(2026,4,20), qty=80, total_cost=7360, purpose="Tractor fuel",         activity_type="other"),
    ])

    # ── Activity Logs ──────────────────────────────────────────────────────────
    db.add_all([
        ActivityLog(id="ac1", cycle_id="cc2", plot_id="a", plot_label="Plot A", activity_type="irrigation", date_performed=date(2026,5,15), notes="Final pre-harvest irrigation", workers=2),
        ActivityLog(id="ac2", cycle_id="cc8", plot_id="b", plot_label="Plot B", activity_type="weeding",    date_performed=date(2026,5,18), notes="Manual weeding done",           workers=8),
        ActivityLog(id="ac3", cycle_id="cc7", plot_id="i", plot_label="Plot I", activity_type="pesticide",  date_performed=date(2026,5,22), notes="Chlorpyrifos for yellowing",    workers=2),
    ])

    # ── Labour Logs ────────────────────────────────────────────────────────────
    db.add_all([
        LabourLog(id="ll1", labour_type_id="cl1", labour_name="General Field Labour", plot_id="b", plot_label="Plot B", date=date(2026,5,18), workers=8, hours=8, rate_per_day=400, total_cost=3200, purpose="Weeding — Mustard"),
        LabourLog(id="ll2", labour_type_id="cl5", labour_name="Irrigation Labour",    plot_id="",  plot_label="All",    date=date(2026,5,20), workers=4, hours=6, rate_per_day=350, total_cost=1400, purpose="Irrigation supervision"),
        LabourLog(id="ll3", labour_type_id="cl1", labour_name="General Field Labour", plot_id="k", plot_label="Plot K", date=date(2026,4,5),  workers=6, hours=8, rate_per_day=400, total_cost=2400, purpose="Weeding"),
    ])

    db.commit()
    print("OK All master and operational data seeded")


if __name__ == "__main__":
    create_database()
    create_tables()
    from database import SessionLocal
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
    print("\nDONE: farm_db is ready. Connect in SSMS: Server=localhost, Windows Auth")
