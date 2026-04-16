from __future__ import annotations

import json
from copy import deepcopy
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def load_storybook_fixture(name: str) -> dict:
    fixture_path = FIXTURES_DIR / "parent_storybook" / name
    return deepcopy(json.loads(fixture_path.read_text(encoding="utf-8")))
