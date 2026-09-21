"""
push-token storage (sqlite).

holds expo/web push tokens with their registered location so the episode
detector can target notifications to a city/region. zero-config local file,
same pattern as the sqlite cache.
"""

import logging
import os
import sqlite3
import time
from functools import lru_cache
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# MFRAMAPA_DATA_DIR points at a mounted volume in production so subscriptions
# survive container recreation; falls back to home for local dev / tests.
_DATA_DIR = os.getenv("MFRAMAPA_DATA_DIR", os.path.expanduser("~"))
_DEFAULT_DB = os.path.join(_DATA_DIR, ".mframapa_push.db")


class PushTokenStore:
    def __init__(self, db_path: str = _DEFAULT_DB):
        self.db_path = db_path
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS push_tokens (
                    token      TEXT PRIMARY KEY,
                    platform   TEXT NOT NULL,
                    lat        REAL NOT NULL,
                    lon        REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )
            self._migrate(conn)

    @staticmethod
    def _migrate(conn: sqlite3.Connection) -> None:
        # user_id + threshold_offset: schema for personal alert thresholds
        # (workstream 3). Nullable — a device can still register anonymously,
        # same as today. Consulting threshold_offset when deciding whether to
        # send an alert is not implemented yet (see backend/alerts/episode_detector.py);
        # this only carries the value so registration doesn't need a second migration later.
        existing = {row[1] for row in conn.execute("PRAGMA table_info(push_tokens)")}
        if "user_id" not in existing:
            conn.execute("ALTER TABLE push_tokens ADD COLUMN user_id TEXT")
        if "threshold_offset" not in existing:
            conn.execute("ALTER TABLE push_tokens ADD COLUMN threshold_offset REAL")

    def register(
        self,
        token: str,
        platform: str,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        user_id: Optional[str] = None,
        threshold_offset: Optional[float] = None,
    ) -> None:
        # lat/lon optional for web subscribe-before-locate; daily facts use all(),
        # episode targeting uses near() and simply misses 0,0 placeholders.
        la = float(lat) if lat is not None else 0.0
        lo = float(lon) if lon is not None else 0.0
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO push_tokens (token, platform, lat, lon, updated_at, user_id, threshold_offset)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(token) DO UPDATE SET
                    platform=excluded.platform, lat=excluded.lat,
                    lon=excluded.lon, updated_at=excluded.updated_at,
                    user_id=excluded.user_id, threshold_offset=excluded.threshold_offset
                """,
                (token, platform, la, lo, time.time(), user_id, threshold_offset),
            )

    def all(self) -> List[Dict[str, Any]]:
        return self._query("SELECT token, platform, lat, lon FROM push_tokens", ())

    def near(self, lat: float, lon: float, radius_deg: float = 0.75) -> List[Dict[str, Any]]:
        # tokens within a bounding box around (lat, lon) — coarse city targeting.
        return self._query(
            "SELECT token, platform, lat, lon FROM push_tokens "
            "WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
            (lat - radius_deg, lat + radius_deg, lon - radius_deg, lon + radius_deg),
        )

    def count(self) -> int:
        with sqlite3.connect(self.db_path) as conn:
            return int(conn.execute("SELECT COUNT(*) FROM push_tokens").fetchone()[0])

    def _query(self, sql: str, params: tuple) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(sql, params).fetchall()
        return [{"token": t, "platform": p, "lat": la, "lon": lo} for t, p, la, lo in rows]


@lru_cache(maxsize=1)
def get_push_store() -> PushTokenStore:
    return PushTokenStore(os.getenv("MFRAMAPA_PUSH_DB", _DEFAULT_DB))
