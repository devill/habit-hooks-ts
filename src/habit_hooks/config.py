"""Load and validate the merged TOML config across the resolution chain."""

from __future__ import annotations

import tomllib
from pathlib import Path

from pydantic import BaseModel, ConfigDict


class SmellOverride(BaseModel):
    model_config = ConfigDict(extra="allow")

    severity: str | None = None
    guide: str | None = None
    disabled: bool | None = None
    title: str | None = None


class ScopeDefaults(BaseModel):
    model_config = ConfigDict(extra="allow")

    changedOnly: bool = False
    autoBranchOffMain: bool = False
    branchBase: str = "main"
    mainBranch: str = "main"


class SensorOverride(BaseModel):
    model_config = ConfigDict(extra="allow")

    disabled: bool | None = None
    command: str | None = None
    language: str | None = None
    files: list[str] | None = None
    args: list[str] | None = None


class Config(BaseModel):
    model_config = ConfigDict(extra="allow")

    plugins: list[str] = ["generic"]
    transformers: list[str] = []
    files: list[str] | None = None
    scope: ScopeDefaults = ScopeDefaults()
    sensors: dict[str, SensorOverride] = {}
    runners: dict[str, str] = {}
    smells: dict[str, SmellOverride] = {}


def _read_toml(path: Path) -> dict:
    if not path.is_file():
        return {}
    with path.open("rb") as f:
        return tomllib.load(f)


def load_config(project_dir: Path, config_path: Path | None = None) -> Config:
    """Merge the project's ``.habit-hooks/config.toml`` over plugin defaults."""
    path = config_path or project_dir / ".habit-hooks" / "config.toml"
    return Config(**_read_toml(path))
