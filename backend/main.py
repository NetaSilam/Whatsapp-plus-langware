"""FastAPI backend for the WhatsApp-like chat app.

Run with: .venv/Scripts/uvicorn main:app --reload --port 8080  (Windows)
          .venv/bin/uvicorn  main:app --reload --port 8080  (macOS/Linux)

The Next.js frontend proxies /api/* here (next.config.ts). The terminal
WebSocket (/ws/terminal/*) is connected to directly since rewrites don't proxy
WebSockets. Interactive API docs: http://localhost:8080/docs
"""

from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import db  # noqa: E402
import realtime  # noqa: E402
from routes_auth import router as auth_router  # noqa: E402
from routes_conversations import router as conversations_router  # noqa: E402
from routes_messages import router as messages_router  # noqa: E402
from routes_presence import router as presence_router  # noqa: E402
from routes_uploads import router as uploads_router  # noqa: E402
from routes_users import router as users_router  # noqa: E402
from terminal import router as terminal_router  # noqa: E402
from terminal import terminal_manager  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_pool()
    await realtime.init()
    await terminal_manager.startup()
    yield
    await terminal_manager.shutdown()
    await realtime.close()
    await db.close_pool()


app = FastAPI(title="Chat API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="fastapi")


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(conversations_router)
app.include_router(messages_router)
app.include_router(presence_router)
app.include_router(uploads_router)
app.include_router(terminal_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
