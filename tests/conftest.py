"""pytest configuration for Hatchmade contract tests (gltest Direct Mode)."""

import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from gltest.direct import VMContext  # noqa: E402
from gltest.direct.loader import create_address  # noqa: E402

CONTRACT_PATH = ROOT / "contracts" / "hatchmade.py"


@pytest.fixture
def vm():
    """A fresh direct-mode VM, active for the whole test."""
    vm = VMContext()
    with vm.activate():
        yield vm


@pytest.fixture
def contract(vm):
    """The contract, deployed once per test, no constructor args."""
    from gltest.direct.loader import deploy_contract
    return deploy_contract(CONTRACT_PATH, vm)


@pytest.fixture
def operator():
    return create_address("operator")


@pytest.fixture
def reviewer():
    return create_address("reviewer")


@pytest.fixture
def source_provider():
    return create_address("source_provider")


@pytest.fixture
def stranger():
    return create_address("stranger")
