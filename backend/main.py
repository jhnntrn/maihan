from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import JSON, DateTime, Integer, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

APP_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("EVENTS_DB_PATH", APP_DIR / "events.db"))
if not DB_PATH.is_absolute():
    DB_PATH = APP_DIR / DB_PATH
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


class Base(DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String(1000), default="")
    time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    pictures: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


Base.metadata.create_all(bind=engine)


class EventCreate(BaseModel):
    name: str
    description: str = ""
    time: datetime
    pictures: list[str] = Field(default_factory=list)

    @field_validator("pictures", mode="before")
    @classmethod
    def ensure_list(cls, value):
        if value is None:
            return []
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass
            return [value]
        return value


class EventRead(BaseModel):
    id: int
    name: str
    description: str
    time: datetime
    pictures: list[str]

    model_config = ConfigDict(from_attributes=True)


app = FastAPI(title="Events API", version="1.0.0")

cors_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials="*" not in cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/events", response_model=list[EventRead])
def list_events():
    with Session(engine) as session:
        return session.scalars(select(Event).order_by(Event.time.asc())).all()


@app.post("/events", response_model=EventRead)
def create_event(payload: EventCreate):
    with Session(engine) as session:
        event = Event(
            name=payload.name,
            description=payload.description or "",
            time=payload.time,
            pictures=payload.pictures,
        )
        session.add(event)
        session.commit()
        session.refresh(event)
        return event


@app.delete("/events/{event_id}")
def delete_event(event_id: int):
    with Session(engine) as session:
        event = session.get(Event, event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        session.delete(event)
        session.commit()
        return {"ok": True}


@app.get("/")
def root():
    return {"status": "ok", "endpoints": ["/events"]}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
