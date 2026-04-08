"""
MultiAgent Roadmap - Main Application Entry Point

Starts the FastAPI server with all multi-agent capabilities.
"""

import uvicorn
from backend.core.config import settings

def main():
    """Run the application server."""
    uvicorn.run(
        "backend.api.server:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
        reload_dirs=["backend"] if settings.DEBUG else None,
    )

if __name__ == "__main__":
    main()
