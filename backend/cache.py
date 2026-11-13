import hashlib
import os
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Optional, Tuple


class BoundedLRUCache:
    """Two-tier in-memory + bounded 500 MB disk LRU cache."""

    def __init__(
        self,
        cache_dir: Optional[str] = None,
        high_watermark_bytes: int = 480 * 1024 * 1024,
        low_watermark_bytes: int = 380 * 1024 * 1024,
        max_mem_items: int = 64,
    ):
        if cache_dir is None:
            cache_dir = os.environ.get("SPHEREX_CACHE_DIR")
            if not cache_dir:
                cache_dir = str(Path(__file__).resolve().parent / "cache" / "spherex")
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.high_watermark = high_watermark_bytes
        self.low_watermark = low_watermark_bytes
        self.max_mem_items = max_mem_items
        self._lock = threading.RLock()
        self._mem: OrderedDict[str, Tuple[bytes, dict]] = OrderedDict()
        self._disk_index: OrderedDict[str, int] = OrderedDict()
        self._total_disk_bytes = 0
        self._scan_existing()

    def _scan_existing(self) -> None:
        files = sorted(self.cache_dir.glob("*.bin"), key=lambda p: p.stat().st_atime)
        for p in files:
            key = p.stem
            size = p.stat().st_size
            self._disk_index[key] = size
            self._total_disk_bytes += size

    @staticmethod
    def make_key(*parts: Any) -> str:
        raw = "|".join(str(p) for p in parts)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]

    def has(self, key: str) -> bool:
        with self._lock:
            if key in self._mem:
                return True
            return (self.cache_dir / f"{key}.bin").exists() and (self.cache_dir / f"{key}.json").exists()

    def get(self, key: str) -> Optional[Tuple[bytes, dict]]:
        with self._lock:
            if key in self._mem:
                self._mem.move_to_end(key)
                return self._mem[key]

            bin_path = self.cache_dir / f"{key}.bin"
            meta_path = self.cache_dir / f"{key}.json"
            if bin_path.exists() and meta_path.exists():
                import json

                data = bin_path.read_bytes()
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                if key in self._disk_index:
                    self._disk_index.move_to_end(key, last=True)
                else:
                    self._disk_index[key] = len(data)
                self._put_mem(key, data, meta)
                return data, meta
            return None

    def put(self, key: str, data: bytes, meta: dict) -> None:
        import json

        with self._lock:
            self._put_mem(key, data, meta)
            bin_path = self.cache_dir / f"{key}.bin"
            meta_path = self.cache_dir / f"{key}.json"
            bin_path.write_bytes(data)
            meta_path.write_text(json.dumps(meta), encoding="utf-8")

            old_size = self._disk_index.get(key, 0)
            self._disk_index[key] = len(data)
            self._disk_index.move_to_end(key)
            self._total_disk_bytes += len(data) - old_size
            self._evict_if_needed()

    def _put_mem(self, key: str, data: bytes, meta: dict) -> None:
        self._mem[key] = (data, meta)
        self._mem.move_to_end(key)
        while len(self._mem) > self.max_mem_items:
            self._mem.popitem(last=False)

    def _evict_if_needed(self) -> None:
        if self._total_disk_bytes <= self.high_watermark:
            return
        while self._total_disk_bytes > self.low_watermark and self._disk_index:
            evict_key, size = self._disk_index.popitem(last=False)
            self._total_disk_bytes -= size
            (self.cache_dir / f"{evict_key}.bin").unlink(missing_ok=True)
            (self.cache_dir / f"{evict_key}.json").unlink(missing_ok=True)
            self._mem.pop(evict_key, None)


class JobStore:
    """In-memory async job registry with 2-hour retention."""

    def __init__(self, ttl_seconds: int = 7200):
        self.ttl_seconds = ttl_seconds
        self._lock = threading.RLock()
        self._jobs: dict[str, dict] = {}

    def create(self, job_id: str, payload: dict) -> dict:
        with self._lock:
            self._prune()
            record = {
                "job_id": job_id,
                "status": "pending",
                "created_at": time.time(),
                "completed_rasters": [],
                "total_requested": payload.get("total_requested", 1),
                "error": None,
            }
            self._jobs[job_id] = record
            return record

    def update(self, job_id: str, **fields: Any) -> Optional[dict]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            job.update(fields)
            return dict(job)

    def get(self, job_id: str) -> Optional[dict]:
        with self._lock:
            self._prune()
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def _prune(self) -> None:
        cutoff = time.time() - self.ttl_seconds
        expired = [jid for jid, rec in self._jobs.items() if rec["created_at"] < cutoff]
        for jid in expired:
            del self._jobs[jid]
