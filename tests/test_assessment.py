"""Assessment: the request/exercise split, outcomes, floors, and agreement."""

import json

import pytest
import re

from tests import helpers as H


def floor_names(record):
    return [f["floor"] for f in record["floors"]]


def decision_digest_of(record):
    """Independently recomputed: the test mirrors the protocol, not the code."""
    rows = sorted(
        [[d["source_id"], int(d["fetch_ok"]), int(d["digest_match"]),
          d["effective"]] for d in record["decisions"]],
        key=lambda r: r[0])
    return H.sha256_hex(json.dumps(rows, sort_keys=True, separators=(",", ":")))


def test_request_refused_on_open_case(vm, contract, operator):
    vm.sender = operator
    H.register_authorities(contract)
    cid = contract.open_case("Aero-Puck", "LOT-9751")
    with vm.expect_revert("[INCOMPLETE_PACKET]"):
        contract.request_assessment(cid)


def test_request_binds_the_packet(vm, contract, operator):
    vm.sender = operator
    cid, digest = H.standard_case(contract, vm)
    aid = contract.request_assessment(cid)
    record = contract.get_assessment(aid)
    assert record["status"] == "REQUESTED"
    assert record["packet_sha256"] == digest
    assert record["product"] == "Aero-Puck AP-1150"
    assert record["lot"] == "LOT-9751"
    assert record["requested_by"] == str(operator).lower()


def test_pending_ceiling(vm, contract, operator):
    vm.sender = operator
    cid, _ = H.standard_case(contract, vm)
    for _ in range(5):
        contract.request_assessment(cid)
    with vm.expect_revert("[PENDING]"):
        contract.request_assessment(cid)


def test_execute_refused_when_not_requested(vm, contract, operator):
    vm.sender = operator
    cid, _ = H.standard_case(contract, vm)
    with vm.expect_revert("[NOT_FOUND]"):
        contract.execute_assessment("A9")
    aid = contract.request_assessment(cid)
    contract.execute_assessment(aid)
    with vm.expect_revert("[WRONG_STATE]"):
        contract.execute_assessment(aid)  # already finalised


def test_quarantine_path(vm, contract, operator):
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    aid = contract.request_assessment(cid)
    outcome = contract.execute_assessment(aid)
    assert outcome == "QUARANTINE"

    record = contract.get_assessment(aid)
    assert record["status"] == "FINALIZED"
    assert record["judgments"][0]["result"] == "RECALLED"
    assert record["judgments"][0]["held"] is False or \
        record["judgments"][0]["held"] == False
    assert record["judgments"][0]["effective"] == "RECALLED"
    assert record["floors"] == []
    assert record["decision_digest"] == decision_digest_of(record)

    case = contract.get_case(cid)
    assert case["state"] == "SETTLED"
    assert case["settled_outcome"] == "QUARANTINE"

    gate = contract.get_gate(cid)
    assert gate["gate"] == "BLOCKED"
    assert any("QUARANTINE" in r for r in gate["blocked_reasons"])


def test_clear_path_but_the_gate_stays_closed(vm, contract, operator):
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, bulletin=H.OTHER_LOT_BULLETIN,
        llm_reply=H.recall_reply(H.OTHER_LOT_BULLETIN, result="NOT_RECALLED"))
    aid = contract.request_assessment(cid)
    outcome = contract.execute_assessment(aid)
    assert outcome == "CLEAR"
    assert contract.get_assessment(aid)["floors"] == []

    case = contract.get_case(cid)
    assert case["settled_outcome"] == "CLEAR"
    gate = contract.get_gate(cid)
    assert gate["gate"] == "BLOCKED"        # released only by the reviewer
    assert any("appointment" in r for r in gate["blocked_reasons"])


def test_uncertain_bullin_names_nothing(vm, contract, operator):
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, bulletin=H.UNRELATED_BULLETIN,
        llm_reply=H.recall_reply(H.UNRELATED_BULLETIN, result="UNCERTAIN"))
    aid = contract.request_assessment(cid)
    outcome = contract.execute_assessment(aid)
    assert outcome == "REVIEW"
    judgments = contract.get_assessment(aid)["judgments"]
    assert judgments[0]["effective"] == "UNCERTAIN"
    assert contract.get_case(cid)["settled_outcome"] == "REVIEW"


def test_ungrounded_recalled_is_held(vm, contract, operator):
    """A RECALLED whose basis quotes nothing in the bulletin is held at UNCERTAIN."""
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, llm_reply=H.note_reply("RECALLED"))
    aid = contract.request_assessment(cid)
    outcome = contract.execute_assessment(aid)
    assert outcome == "REVIEW"
    judgments = contract.get_assessment(aid)["judgments"]
    assert judgments[0]["result"] == "RECALLED"       # what the reader said
    assert judgments[0]["held"] is True or judgments[0]["held"] == True
    assert judgments[0]["effective"] == "UNCERTAIN"   # what the floor held
    assert "GROUNDING_HELD" in floor_names(contract.get_assessment(aid))


def test_ungrounded_not_recalled_is_held_too(vm, contract, operator):
    """A false clearance must survive exactly the same discipline."""
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, bulletin=H.OTHER_LOT_BULLETIN,
        llm_reply=H.note_reply("NOT_RECALLED"))
    aid = contract.request_assessment(cid)
    assert contract.execute_assessment(aid) == "REVIEW"


def test_garbage_model_output_is_a_floor_not_a_crash(vm, contract, operator):
    vm.sender = operator
    cid, _ = H.standard_case(contract, vm, llm_reply=H.garbage_reply())
    aid = contract.request_assessment(cid)
    outcome = contract.execute_assessment(aid)
    assert outcome == "REVIEW"
    record = contract.get_assessment(aid)
    assert "MODEL_READ" in floor_names(record)
    judgments = record["judgments"]
    assert judgments[0]["effective"] == "UNCERTAIN"


def test_digest_mismatch_fails_the_packet(vm, contract, operator):
    """Live bytes do not match what was pinned: the packet is broken."""
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    # the manifest moved after the freeze
    H.mock_web(vm, [(H.URL_LOGISTICS, 200, H.MANIFEST_OTHER_LOT)])
    aid = contract.request_assessment(cid)
    outcome = contract.execute_assessment(aid)
    assert outcome == "REVIEW"
    record = contract.get_assessment(aid)
    assert "DIGEST_MISMATCH" in floor_names(record)
    by_id = {r["source_id"]: r for r in record["receipts"]}
    assert str(by_id["C1#3"]["digest_match"]) in ("False", "false") or \
        not by_id["C1#3"]["digest_match"]


def test_fetch_status_floor(vm, contract, operator):
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    H.mock_web(vm, [(H.URL_MANUFACTURER, 404, "not found")])
    aid = contract.request_assessment(cid)
    assert contract.execute_assessment(aid) == "REVIEW"
    record = contract.get_assessment(aid)
    assert "FETCH_STATUS" in floor_names(record)
    by_id = {r["source_id"]: r for r in record["receipts"]}
    assert str(by_id["C1#2"]["fetch_ok"]) in ("False", "false") or \
        not by_id["C1#2"]["fetch_ok"]


def test_http_500_that_returns_bytes_is_no_either(vm, contract, operator):
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    H.mock_web(vm, [(H.URL_REGULATOR, 500, H.PERMANENT_BULLETIN)])
    aid = contract.request_assessment(cid)
    assert contract.execute_assessment(aid) == "REVIEW"
    assert "FETCH_STATUS" in floor_names(contract.get_assessment(aid))


def test_empty_live_body_floor(vm, contract, operator):
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    H.mock_web(vm, [(H.URL_LOGISTICS, 200, "")])
    aid = contract.request_assessment(cid)
    assert contract.execute_assessment(aid) == "REVIEW"
    assert "NO_LIVE_BYTES" in floor_names(contract.get_assessment(aid))


def test_injected_packet_cannot_clear(vm, contract, operator):
    """A recall in the packet and instructions in the packet: REVIEW, not worse."""
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, bulletin=H.INJECTED_BULLETIN,
        llm_reply=H.recall_reply(H.INJECTED_BULLETIN))
    aid = contract.request_assessment(cid)
    outcome = contract.execute_assessment(aid)
    assert outcome == "REVIEW"
    floors = floor_names(contract.get_assessment(aid))
    assert any(f.startswith("INJECTION_disregard") for f in floors)
    assert any(f.startswith("INJECTION_verdict") for f in floors)
    # never allowed to clear, even though the reading said RECALLED
    assert contract.get_case(cid)["settled_outcome"] == "REVIEW"


def test_two_regulator_bulletins_worst_case_wins(vm, contract, operator):
    import re
    vm.sender = operator
    H.register_authorities(contract)
    cid = contract.open_case("Aero-Puck AP-1150", "LOT-9751")
    contract.pin_source(cid, H.URL_REGULATOR, H.OTHER_LOT_BULLETIN)
    contract.pin_source(cid, H.URL_REGULATOR_2, H.PERMANENT_BULLETIN)
    contract.pin_source(cid, H.URL_MANUFACTURER, H.NOTICE)
    contract.pin_source(cid, H.URL_LOGISTICS, H.MANIFEST)
    contract.seal_packet(cid)
    H.mock_web(vm, [
        (H.URL_REGULATOR, 200, H.OTHER_LOT_BULLETIN),
        (H.URL_REGULATOR_2, 200, H.PERMANENT_BULLETIN),
        (H.URL_MANUFACTURER, 200, H.NOTICE),
        (H.URL_LOGISTICS, 200, H.MANIFEST),
    ])
    H.mock_llm(vm, re.escape(H.URL_REGULATOR),
               H.recall_reply(H.OTHER_LOT_BULLETIN, "NOT_RECALLED"))
    H.mock_llm(vm, re.escape(H.URL_REGULATOR_2),
               H.recall_reply(H.PERMANENT_BULLETIN, "RECALLED"))
    aid = contract.request_assessment(cid)
    assert contract.execute_assessment(aid) == "QUARANTINE"


def test_anyone_may_execute(vm, contract, operator, stranger):
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    aid = contract.request_assessment(cid)
    vm.sender = stranger
    assert contract.execute_assessment(aid) == "QUARANTINE"


def test_full_clear_flow(vm, contract, operator, reviewer):
    vm.sender = operator
    cid = H.full_clear_flow(contract, vm, operator)
    assert contract.get_case(cid)["settled_outcome"] == "CLEAR"
    assert contract.get_gate(cid)["gate"] == "BLOCKED"


def test_settling_only_hardens_upward(vm, contract, operator, stranger):
    """A later assessment can harden the case, never soften it."""
    import re
    vm.sender = operator
    cid = H.full_clear_flow(contract, vm, operator)

    # the same frozen bytes, re-read as covering the lot: QUARANTINE
    vm.sender = stranger
    H.mock_llm(vm, re.escape(H.URL_REGULATOR),
               H.recall_reply(H.OTHER_LOT_BULLETIN, "RECALLED"))
    vm.sender = operator
    a2 = contract.request_assessment(cid)
    assert contract.execute_assessment(a2) == "QUARANTINE"
    assert contract.get_case(cid)["settled_outcome"] == "QUARANTINE"
    assert contract.get_gate(cid)["gate"] == "BLOCKED"


def test_settling_never_softens(vm, contract, operator, stranger):
    """A first QUARANTINE cannot be walked back by a fuzzy second pass."""
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    a1 = contract.request_assessment(cid)
    assert contract.execute_assessment(a1) == "QUARANTINE"

    # same pins, same live bytes, but an unreadable reading: REVIEW
    H.mock_llm(vm, re.escape(H.URL_REGULATOR), H.garbage_reply())
    a2 = contract.request_assessment(cid)
    assert contract.execute_assessment(a2) == "REVIEW"
    assert contract.get_case(cid)["settled_outcome"] == "QUARANTINE"
    assert contract.get_gate(cid)["gate"] == "BLOCKED"


def test_validator_disagreement_writes_nothing(vm, contract, operator):
    """Another node fetched a different world and refuses to sign.

    In production the round fails and nothing is written. Direct mode runs
    the leader eagerly, so the test takes a snapshot, runs the leader pass,
    re-runs the captured validator against a changed world, asserts the
    refusal, and rewinds.
    """
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    aid = contract.request_assessment(cid)

    snap = vm.snapshot()
    contract.execute_assessment(aid)

    # a validator sees the manifest moved: its decisions differ
    H.mock_web(vm, [(H.URL_LOGISTICS, 200, H.MANIFEST_OTHER_LOT)])
    assert vm.run_validator(index=-1) is False
    vm.revert(snap)
    assert contract.get_assessment(aid)["status"] == "REQUESTED"
    assert contract.get_case(cid)["settled_outcome"] == "NONE"


def test_validator_agreement_through_a_cleaner_world(vm, contract, operator):
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    aid = contract.request_assessment(cid)
    contract.execute_assessment(aid)
    # a validator re-runs into the same world and signs
    assert vm.run_validator(index=-1) is True


def test_validator_never_rubber_stamps_a_failed_leader(vm, contract, operator):
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    aid = contract.request_assessment(cid)
    contract.execute_assessment(aid)
    assert vm.run_validator(index=-1, leader_error=RuntimeError("wire down")) \
        is False
