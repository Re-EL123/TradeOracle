"""Structured logging with sensible defaults. Rotation handled by journald/systemd."""
from __future__ import annotations

import logging
import sys


def setup_logging(level: str = "INFO") -> logging.Logger:
    root = logging.getLogger()
    if root.handlers:
        return logging.getLogger("tradeoracle")

    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)-7s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%SZ",
        )
    )
    # Force UTC-ish timestamps via converter
    logging.Formatter.converter = _utc
    root.addHandler(handler)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    return logging.getLogger("tradeoracle")


def _utc(*args):
    import time

    return time.gmtime(*args)
