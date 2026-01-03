from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from sqlalchemy import JSON, Column, DateTime, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

DB_PATH = Path("./events.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


class Base(DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(String(1000))
    time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    pictures: Mapped[List[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=datetime.utcnow
    )


Base.metadata.create_all(bind=engine)


class EventCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    time: datetime
    pictures: List[str] = []

    @field_validator("pictures", mode="before")
    def ensure_list(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                pass
            return [v]
        return v


class EventRead(BaseModel):
    id: int
    name: str
    description: Optional[str]
    time: datetime
    pictures: List[str]

    class Config:
        from_attributes = True


app = FastAPI(title="Events API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"]
    ,
    allow_headers=["*"],
)


@app.get("/events", response_model=List[EventRead])
def list_events():
    with Session(engine) as session:
        events = session.query(Event).order_by(Event.time.asc()).all()
        return events


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
