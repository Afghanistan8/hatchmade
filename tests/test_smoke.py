"""Smoke test: direct-mode wiring, deploy, first write/view round trip."""

from tests import helpers as H


def test_deploy_and_first_views(vm, contract, operator):
    info = contract.get_protocol_info()
    assert info["rules"] == "hatchmade-gate-1"
    assert info["schema"] == "hatchmade.evidence-gate@1"
    assert "REGULATOR" in info["authority_kinds"]
    assert info["counts"]["case"] == 0

    catalog = contract.get_error_catalog()
    assert "[GATE_RULE]" in catalog
    assert "[NOT_CLEAR]" in catalog


def test_authority_register_and_view(vm, contract, operator):
    vm.sender = operator
    H.register_authorities(contract)
    auth = contract.get_authority(H.HOSTS["REGULATOR"])
    assert auth["kind"] == "REGULATOR"
    assert auth["provider"] == str(operator).lower()
    bound = contract.authority_bound(H.HOSTS["REGULATOR"])
    assert bound == {"hostname": H.HOSTS["REGULATOR"], "bound": True,
                     "kind": "REGULATOR"}


def test_open_case_and_gate_blocked(vm, contract, operator):
    vm.sender = operator
    case_id, digest = H.standard_case(
        contract, vm, llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    assert case_id == "C1"
    assert len(digest) == 64

    gate = contract.get_gate(case_id)
    assert gate["gate"] == "BLOCKED"
    assert gate["settled_outcome"] == "NONE"

    assess_id = contract.request_assessment(case_id)
    assert assess_id == "A1"
    outcome = contract.execute_assessment(assess_id)
    assert outcome == "QUARANTINE"

    gate = contract.get_gate(case_id)
    assert gate["settled_outcome"] == "QUARANTINE"
    assert gate["gate"] == "BLOCKED"

    record = contract.get_assessment(assess_id)
    assert record["status"] == "FINALIZED"
    assert record["outcome"] == "QUARANTINE"
    assert len(record["decision_digest"]) == 64
    for receipt in record["receipts"]:
        assert receipt["fetch_ok"] is True or receipt["fetch_ok"] == 1
        assert receipt["digest_match"] is True or receipt["digest_match"] == 1
