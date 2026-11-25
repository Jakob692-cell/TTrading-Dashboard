"""
Client für die offizielle Fortnite Data API (Epic Games, öffentlich, kein API-Key nötig).

Basis-URL: https://api.fortnite.com/ecosystem/v1
Doku (Swagger): https://api.fortnite.com/ecosystem/v1/docs/

Wichtige Eigenschaften der API:
  * Historie nur 7 Tage (from darf nicht älter sein).
  * Metriken sind null, wenn eine Map < 5 Unique Players im Intervall hatte.
  * Cloudflare blockt Requests ohne User-Agent (HTTP 403 / error code 1010).
  * Rate-Limit (HTTP 429) greift bei ~150+ Requests/Sekunde -> wir drosseln + retry.
"""

from __future__ import annotations

import time
import threading
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from typing import Iterable, Iterator

import requests

BASE_URL = "https://api.fortnite.com/ecosystem/v1"
USER_AGENT = "fortnite-map-scout/1.0"

METRIC_KEYS = [
    "peakCCU", "uniquePlayers", "plays", "minutesPlayed",
    "averageMinutesPerPlayer", "favorites", "recommendations", "retention",
]


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class FortniteDataAPI:
    def __init__(self, max_rps: float = 40.0, timeout: float = 30.0, retries: int = 6):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
        adapter = requests.adapters.HTTPAdapter(pool_connections=32, pool_maxsize=32)
        self.session.mount("https://", adapter)
        self.timeout = timeout
        self.retries = retries
        self._min_interval = 1.0 / max_rps if max_rps else 0.0
        self._lock = threading.Lock()
        self._next_slot = 0.0

    # ------------------------------------------------------------------ core
    def _throttle(self) -> None:
        if not self._min_interval:
            return
        with self._lock:
            now = time.monotonic()
            slot = max(now, self._next_slot)
            self._next_slot = slot + self._min_interval
        delay = slot - time.monotonic()
        if delay > 0:
            time.sleep(delay)

    def get(self, path: str, params: dict | None = None) -> dict | None:
        """GET mit Throttling + Retry. Gibt None bei 404 zurück."""
        url = path if path.startswith("http") else BASE_URL + path
        backoff = 1.0
        for attempt in range(self.retries + 1):
            self._throttle()
            try:
                r = self.session.get(url, params=params, timeout=self.timeout)
            except requests.RequestException:
                if attempt == self.retries:
                    raise
                time.sleep(backoff)
                backoff *= 2
                continue
            if r.status_code == 200:
                return r.json()
            if r.status_code == 404:
                return None
            if r.status_code in (429, 500, 502, 503, 504) and attempt < self.retries:
                time.sleep(backoff)
                backoff = min(backoff * 2, 30)
                continue
            raise RuntimeError(f"HTTP {r.status_code} für {r.url}: {r.text[:300]}")
        return None

    # ------------------------------------------------------------- islands
    def iter_islands(self, page_size: int = 1000) -> Iterator[dict]:
        """Alle öffentlichen Islands (Code, Titel, Creator, Tags). ~285k Stück, ~1 Min."""
        after = None
        while True:
            params = {"size": page_size}
            if after:
                params["after"] = after
            d = self.get("/islands", params)
            if not d or not d.get("data"):
                return
            for item in d["data"]:
                item.pop("meta", None)
                yield item
            after = d["meta"]["page"].get("nextCursor")
            if not after:
                return

    def island(self, code: str) -> dict | None:
        return self.get(f"/islands/{code}")

    def island_metrics(self, code: str, interval: str = "day",
                       days: int = 7, metrics: Iterable[str] | None = None) -> dict | None:
        params: dict = {}
        if interval == "day":
            start = (utcnow() - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
            params["from"] = iso(start)
        if metrics:
            params["metrics"] = list(metrics)
        return self.get(f"/islands/{code}/metrics/{interval}", params)

    def island_rankings(self, code: str, hours: int | None = None) -> list[dict]:
        params = {}
        if hours:
            params = {"from": iso(utcnow() - timedelta(hours=hours)), "to": iso(utcnow())}
        d = self.get(f"/islands/{code}/rankings", params)
        return (d or {}).get("data", [])

    # -------------------------------------------------------------- genres
    def genres(self) -> list[dict]:
        return (self.get("/genres") or {}).get("data", [])

    def genre_rankings(self, slug: str, top: int = 200, at: datetime | None = None) -> dict:
        """Top-N einer Genre-Rangliste (stündlicher Snapshot). Gibt {meta, items} zurück."""
        items: list[dict] = []
        after = None
        meta: dict = {}
        while len(items) < top:
            params: dict = {"size": min(1000, top - len(items))}
            if at:
                params["at"] = iso(at.replace(minute=0, second=0, microsecond=0))
            if after:
                params["after"] = after
            d = self.get(f"/genres/{slug}/rankings", params)
            if not d:
                break
            meta = d.get("meta", {})
            items += [{"code": x["islandCode"], "rank": x["rank"]} for x in d.get("data", [])]
            after = meta.get("page", {}).get("nextCursor")
            if not after or not d.get("data"):
                break
        return {"meta": meta, "items": items[:top]}

    # ----------------------------------------------------------- ecosystem
    def ecosystem_metrics(self, interval: str = "day") -> dict:
        params = {}
        if interval == "day":
            params["from"] = iso((utcnow() - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0))
        return self.get(f"/metrics/{interval}", params) or {}

    # ------------------------------------------------------------- batch
    def many(self, fn, args: list, workers: int = 12, progress: str | None = None) -> list:
        out = [None] * len(args)
        done = 0

        def run(i):
            nonlocal done
            out[i] = fn(args[i])
            done += 1
            if progress and done % 250 == 0:
                print(f"  {progress}: {done}/{len(args)}", flush=True)

        with ThreadPoolExecutor(workers) as ex:
            list(ex.map(run, range(len(args))))
        return out
