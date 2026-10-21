"""Typed configuration with mandatory validation. Refuses unsafe startup."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

VALID_MODES = {"RESEARCH", "BACKTEST", "PAPER", "DEMO", "LIVE"}
DEFAULT_INSTRUMENTS = ("EURUSD", "GBPUSD", "USDJPY")
DEFAULT_TIMEFRAMES = ("M15", "H1", "H4")


@dataclass(frozen=True)
class RiskConfig:
    risk_per_trade_pct: float = 0.25
    max_daily_loss_pct: float = 1.0
    max_drawdown_pct: float = 6.0
    max_positions: int = 2
    max_open_risk_pct: float = 1.5
    max_spread_pips: float = 2.0
    min_rr: float = 1.8
    max_consecutive_losses: int = 5
    max_orders_per_hour: int = 12


@dataclass(frozen=True)
class AppConfig:
    env: str = "development"
    trading_mode: str = "RESEARCH"
    instruments: tuple[str, ...] = DEFAULT_INSTRUMENTS
    timeframes: tuple[str, ...] = DEFAULT_TIMEFRAMES
    mongodb_uri: str = ""
    mongodb_database: str = "tradeoracle"
    market_data_provider: str = "synthetic"
    market_data_api_key: str = ""
    broker_provider: str = "paper"
    broker_environment: str = "DEMO"
    heartbeat_interval_seconds: int = 15
    cycle_interval_seconds: int = 30
    max_backtest_workers: int = 1
    log_level: str = "INFO"
    runtime_dir: Path = field(default_factory=lambda: Path("runtime"))
    risk: RiskConfig = field(default_factory=RiskConfig)

    @property
    def allows_execution(self) -> bool:
        return self.trading_mode in {"PAPER", "DEMO", "LIVE"}

    @property
    def is_live(self) -> bool:
        return self.trading_mode == "LIVE"


def _f(name: str, default: float) -> float:
    raw = os.getenv(name)
    return float(raw) if raw not in (None, "") else default


def _i(name: str, default: int) -> int:
    raw = os.getenv(name)
    return int(raw) if raw not in (None, "") else default


def load_config() -> AppConfig:
    mode = os.getenv("TRADING_MODE", "RESEARCH").upper()
    if mode not in VALID_MODES:
        raise ValueError(f"TRADING_MODE must be one of {sorted(VALID_MODES)}, got {mode!r}")

    instruments = tuple(
        s.strip().upper()
        for s in os.getenv("INSTRUMENTS", ",".join(DEFAULT_INSTRUMENTS)).split(",")
        if s.strip()
    )
    timeframes = tuple(
        s.strip().upper()
        for s in os.getenv("TIMEFRAMES", ",".join(DEFAULT_TIMEFRAMES)).split(",")
        if s.strip()
    )

    risk = RiskConfig(
        risk_per_trade_pct=_f("RISK_PER_TRADE_PCT", 0.25),
        max_daily_loss_pct=_f("MAX_DAILY_LOSS_PCT", 1.0),
        max_drawdown_pct=_f("MAX_DRAWDOWN_PCT", 6.0),
        max_positions=_i("MAX_POSITIONS", 2),
        max_open_risk_pct=_f("MAX_OPEN_RISK_PCT", 1.5),
        max_spread_pips=_f("MAX_SPREAD_PIPS", 2.0),
        min_rr=_f("MIN_RR", 1.8),
        max_consecutive_losses=_i("MAX_CONSECUTIVE_LOSSES", 5),
        max_orders_per_hour=_i("MAX_ORDERS_PER_HOUR", 12),
    )

    if risk.risk_per_trade_pct <= 0 or risk.risk_per_trade_pct > 5:
        raise ValueError("RISK_PER_TRADE_PCT must be in (0, 5]")
    if risk.max_daily_loss_pct <= 0:
        raise ValueError("MAX_DAILY_LOSS_PCT must be positive")

    cfg = AppConfig(
        env=os.getenv("APP_ENV", "development"),
        trading_mode=mode,
        instruments=instruments,
        timeframes=timeframes,
        mongodb_uri=os.getenv("MONGODB_URI", ""),
        mongodb_database=os.getenv("MONGODB_DATABASE", "tradeoracle"),
        market_data_provider=os.getenv("MARKET_DATA_PROVIDER", "synthetic"),
        market_data_api_key=os.getenv("MARKET_DATA_API_KEY", ""),
        broker_provider=os.getenv("BROKER_PROVIDER", "paper"),
        broker_environment=os.getenv("BROKER_ENVIRONMENT", "DEMO"),
        heartbeat_interval_seconds=_i("ENGINE_HEARTBEAT_INTERVAL_SECONDS", 15),
        cycle_interval_seconds=_i("ENGINE_CYCLE_INTERVAL_SECONDS", 30),
        max_backtest_workers=_i("MAX_BACKTEST_WORKERS", 1),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        risk=risk,
    )

    if cfg.is_live and cfg.broker_environment != "LIVE":
        raise ValueError("TRADING_MODE=LIVE requires BROKER_ENVIRONMENT=LIVE (explicit authorisation)")
    if cfg.is_live and not cfg.mongodb_uri:
        raise ValueError("TRADING_MODE=LIVE requires MONGODB_URI for durable audit/state")

    return cfg
