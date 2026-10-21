"""Authority registration: binding rules, first-come wins, kind purity."""

import pytest

from tests import helpers as H


def test_register_ok_and_views(vm, contract, operator, stranger):
    vm.sender = operator
    auth = contract.get_authority(
        contract.register_authority("bulletin.example.gov", "REGULATOR", "post"))
    assert auth["hostname"] == "bulletin.example.gov"
    assert auth["kind"] == "REGULATOR"
    assert auth["provider"] == str(operator).lower()
    assert auth["seq"] == 1

    page = contract.list_authorities(0, 10)
    assert page["total"] == 1
    assert page["items"][0]["hostname"] == "bulletin.example.gov"


def test_first_binding_is_the_only_binding(vm, contract, operator, stranger):
    vm.sender = operator
    contract.register_authority("bulletin.example.gov", "REGULATOR", "first")
    vm.sender = stranger
    with vm.expect_revert("[AUTHORITY_TAKEN]"):
        contract.register_authority("bulletin.example.gov", "MANUFACTURER", "second")
    # the original binding is untouched
    assert contract.get_authority("bulletin.example.gov")["kind"] == "REGULATOR"
    assert contract.get_authority(
        "bulletin.example.gov")["provider"] == str(operator).lower()


def test_kind_must_be_a_known_kind(vm, contract, operator):
    vm.sender = operator
    with vm.expect_revert("[AUTHORITY_KIND]"):
        contract.register_authority("bulletin.example.gov", "擀面杖", "nope")
    with vm.expect_revert("[AUTHORITY_KIND]"):
        contract.register_authority("bulletin.example.gov", "regulator", "wrong case")
    with vm.expect_revert("[AUTHORITY_KIND]"):
        contract.register_authority("bulletin.example.gov", "", "nothing")


def test_hostname_shape(vm, contract, operator):
    vm.sender = operator
    bad = [
        "https://bulletin.example.gov/path",
        "bulletin.example.gov/path",
        "-bulletin.example.gov",
        "bulletin..example.gov",
        "bulletin example gov",
        "",
        "b" * 101 + ".gov",
    ]
    for host in bad:
        with vm.expect_revert("["):
            contract.register_authority(host, "REGULATOR", "shape")
    # spelled variants are normalised, not separate authorities
    contract.register_authority("BULLETIN.Example.GOV.", "REGULATOR", "case")
    assert contract.get_authority("bulletin.example.gov")["hostname"] == \
        "bulletin.example.gov"


def test_unicode_host_rejected(vm, contract, operator):
    vm.sender = operator
    with vm.expect_revert("["):
        contract.register_authority("bülletîn.example.gov", "REGULATOR", "")


def test_note_trimmed_at_ceiling(vm, contract, operator):
    vm.sender = operator
    limit = contract.get_protocol_info()["limits"]["max_note"]
    contract.register_authority("bulletin.example.gov", "LOGISTICS",
                                "N" * (limit * 10))
    assert len(contract.get_authority("bulletin.example.gov")["note"]) == limit
