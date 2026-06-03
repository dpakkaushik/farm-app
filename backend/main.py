from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from routers import plots, crops, inventory, labour, cycles, activities

app = FastAPI(title="Farm Management API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(plots.router,      prefix="/plots",      tags=["plots"])
app.include_router(crops.router,      prefix="/crops",      tags=["crops"])
app.include_router(inventory.router,  prefix="/inventory",  tags=["inventory"])
app.include_router(labour.router,     prefix="/labour",     tags=["labour"])
app.include_router(cycles.router,     prefix="/cycles",     tags=["cycles"])
app.include_router(activities.router, prefix="/activities", tags=["activities"])

@app.get("/health")
def health():
    return {"status": "ok"}
