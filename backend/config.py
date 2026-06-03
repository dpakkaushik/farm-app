from urllib.parse import quote_plus
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DB_SERVER: str = "localhost"
    DB_NAME: str = "farm_db"
    DB_DRIVER: str = "ODBC Driver 17 for SQL Server"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176"]

    @property
    def database_url(self) -> str:
        odbc = (
            f"DRIVER={{{self.DB_DRIVER}}};"
            f"SERVER={self.DB_SERVER};"
            f"DATABASE={self.DB_NAME};"
            f"Trusted_Connection=yes;"
            f"TrustServerCertificate=yes"
        )
        return f"mssql+pyodbc:///?odbc_connect={quote_plus(odbc)}"


settings = Settings()
