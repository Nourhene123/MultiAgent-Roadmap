"""
Application configuration settings.

Loaded from environment variables with sensible defaults.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_path)


class Settings:
    """Application settings configuration."""

    # Project
    PROJECT_NAME: str = "MultiAgent Roadmap"
    VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # API
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8002"))

    # Azure OpenAI
    AZURE_OPENAI_ENDPOINT: str = os.getenv("AZURE_OPENAI_ENDPOINT", "")
    AZURE_OPENAI_KEY: str = os.getenv("AZURE_OPENAI_KEY", "")
    AZURE_OPENAI_DEPLOYMENT: str = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
    AZURE_API_VERSION: str = os.getenv("AZURE_API_VERSION", "2024-02-15-preview")

    # Azure Search
    AZURE_SEARCH_ENDPOINT: str = os.getenv("AZURE_SEARCH_ENDPOINT", "")
    AZURE_SEARCH_KEY: str = os.getenv("AZURE_SEARCH_KEY", "")
    AZURE_SEARCH_INDEX: str = os.getenv("AZURE_SEARCH_INDEX", "index-subul-semantic-v2")

    # Cosmos DB
    COSMOS_ENDPOINT: str = os.getenv("COSMOS_ENDPOINT", "")
    COSMOS_KEY: str = os.getenv("COSMOS_KEY", "")
    COSMOS_DB_NAME: str = os.getenv("COSMOS_DB_NAME", "EduTech_AI_Production")
    COSMOS_CONTAINER: str = os.getenv("COSMOS_CONTAINER", "AgentRoadmap")

    # Paths
    BASE_DIR: Path = Path(__file__).parent.parent.parent        # project root
    DATA_DIR: Path = Path(__file__).parent.parent / "data"      # backend/data/
    SAVED_ROADMAPS_DIR: Path = DATA_DIR / "saved_roadmaps"

    class Config:
        env_file = ".env"


settings = Settings()
