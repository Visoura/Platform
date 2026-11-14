import uvicorn

from .settings import API_PORT

if __name__ == "__main__":
    uvicorn.run("engine.app:app", host="0.0.0.0", port=API_PORT, log_level="warning")
