"""Server-side storage for a signed-in user's health profile.

Separate table from Supabase auth (which only holds email/tier in
app_metadata — see backend/api/supabase_admin.py) because a health condition
list is sensitive personal data, not an auth concern. Uses the same
service-role REST pattern as supabase_admin.py rather than the supabase-py
SDK, since nothing else in this backend depends on that SDK.

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. See
docs/db/health_profiles.sql for the table + RLS policy to create once in the
Supabase dashboard — this module does not create the table itself.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

_TIMEOUT = 15
_TABLE = "health_profiles"

# fields a client is allowed to set; anything else in a request body is dropped
# rather than written verbatim to postgrest.
_WRITABLE_FIELDS = {"home_location", "work_location", "health_conditions", "routine"}


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


def configured() -> bool:
    return bool(_base()) and bool(_headers())


def get_profile(user_id: str) -> Optional[Dict[str, Any]]:
    base, headers = _base(), _headers()
    if not base or not headers:
        return None
    try:
        resp = requests.get(
            base, headers=headers,
            params={"user_id": f"eq.{user_id}", "select": "*", "limit": 1},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        rows = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning("health profile lookup failed for %s: %s", user_id, e)
        return None
    return rows[0] if rows else None


def upsert_profile(user_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    base, headers = _base(), _headers()
    if not base or not headers:
        logger.error("supabase not configured — cannot save health profile")
        return None

    payload = {k: v for k, v in fields.items() if k in _WRITABLE_FIELDS}
    payload["user_id"] = user_id
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        resp = requests.post(
            base,
            headers={**headers, "Prefer": "resolution=merge-duplicates,return=representation"},
            json=payload,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        rows = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.error("health profile save failed for %s: %s", user_id, e)
        return None
    return rows[0] if rows else None


def delete_profile(user_id: str) -> bool:
    base, headers = _base(), _headers()
    if not base or not headers:
        return False
    try:
        resp = requests.delete(base, headers=headers, params={"user_id": f"eq.{user_id}"}, timeout=_TIMEOUT)
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.error("health profile delete failed for %s: %s", user_id, e)
        return False
    return True
