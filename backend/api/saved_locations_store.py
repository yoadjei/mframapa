"""Server-side sync for a signed-in user's saved locations.

The PWA's saved-locations feature (frontend-pwa/src/features/savedLocations/)
already works fully client-side via localStorage — this module only adds
account-level sync on top, so a signed-in user's saved cities follow them to
a new device. Same service-role REST pattern as profile_store.py.

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. See
docs/db/saved_locations.sql for the table + RLS policy.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

_TIMEOUT = 15
_TABLE = "saved_locations"


def _base() -> Optional[str]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    return f"{url}/rest/v1/{_TABLE}" if url else None


def _headers() -> Optional[Dict[str, str]]:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        return None
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def list_locations(user_id: str) -> List[Dict[str, Any]]:
    base, headers = _base(), _headers()
    if not base or not headers:
        return []
    try:
        resp = requests.get(
            base, headers=headers,
            params={"user_id": f"eq.{user_id}", "select": "name,lat,lon,country", "order": "created_at.desc"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning("saved locations list failed for %s: %s", user_id, e)
        return []


def save_location(user_id: str, name: str, lat: float, lon: float, country: Optional[str]) -> bool:
    base, headers = _base(), _headers()
    if not base or not headers:
        return False
    try:
        resp = requests.post(
            base,
            headers={**headers, "Prefer": "resolution=merge-duplicates"},
            json={"user_id": user_id, "name": name, "lat": lat, "lon": lon, "country": country},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.warning("saved location save failed for %s: %s", user_id, e)
        return False
    return True


def delete_location(user_id: str, name: str) -> bool:
    base, headers = _base(), _headers()
    if not base or not headers:
        return False
    try:
        resp = requests.delete(
            base, headers=headers,
            params={"user_id": f"eq.{user_id}", "name": f"eq.{name}"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.warning("saved location delete failed for %s: %s", user_id, e)
        return False
    return True
