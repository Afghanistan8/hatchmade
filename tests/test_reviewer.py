"""Reviewer appointment and release: role isolation and the one open door."""

import re

import pytest

from tests import helpers as H


def full_clear_flow(contract, vm, operator, bulletin=H.OTHER_LOT_BULLETIN):
    """Authorities bound by the provider, a case run to a CLEAR outcome."""
    vm.sender = H.accounts()["provider"]
    H.register_authorities(contract)
    vm.sender = operator
    H.mock_web(vm, [
        (H.URL_REGULATOR, 200, bulletin),
        (H.URL_MANUFACTURER, 200, H.NOTICE),
        (H.URL_LOGISTICS, 200, H.MANIFEST),
    ])
    cid = contract.open_case("Aero-Puck AP-1150", "LOT-9751")
    contract.pin_source(cid, H.URL_REGULATOR, bulletin)
    contract.pin_source(cid, H.URL_MANUFACTURER, H.NOTICE)
    contract.pin_source(cid, H.URL_LOGISTICS, H.MANIFEST)
    contract.seal_packet(cid)
    aid = contract.request_assessment(cid)
    vm.sender = H.accounts()["stranger"]
    vm.mock_llm(re.escape(H.URL_REGULATOR),
                H.recall_reply(bulletin, "NOT_RECALLED"))
    assert contract.execute_assessment(aid) == "CLEAR"
    return cid


def test_release_needs_every_step_in_order(
        vm, contract, operator, reviewer, stranger):
    vm.sender = operator
    cid = full_clear_flow(contract, vm, operator)

    # no proposal yet: release refuses
    vm.sender = reviewer
    with vm.expect_revert("[WRONG_STATE]"):
        contract.release_gate(cid, "")

    vm.sender = stranger
    with vm.expect_revert("[UNAUTHORIZED]"):
        contract.propose_reviewer(cid, str(reviewer))


def test_propose_requires_clear_and_refuses_self_review(
        vm, contract, operator, reviewer, stranger):
    vm.sender = operator
    cid = full_clear_flow(contract, vm, operator)

    # the opener proposes itself: refused. Independence is not optional.
    with vm.expect_revert("[UNAUTHORIZED]"):
        contract.propose_reviewer(cid, str(operator))

    # a provider of the packet's authorities: refused
    provider = H.accounts()["provider"]
    with vm.expect_revert("[UNAUTHORIZED]"):
        contract.propose_reviewer(cid, str(provider))

    vm.sender = operator
    who = str(reviewer).lower()
    assert contract.propose_reviewer(cid, str(reviewer)) == who
    case = contract.get_case(cid)
    assert case["reviewer_state"] == "PROPOSED"
    assert case["reviewer"] == who


def test_propose_refused_when_outcome_is_not_clear(
        vm, contract, operator, reviewer):
    vm.sender = operator
    H.standard_case(contract, vm,
                    llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    cid = contract.open_case("Aero-Puck", "LOT-8001")
    contract.pin_source(cid, H.URL_REGULATOR, H.PERMANENT_BULLETIN)
    contract.pin_source(cid, H.URL_MANUFACTURER, H.NOTICE)
    contract.pin_source(cid, H.URL_LOGISTICS, H.MANIFEST)
    contract.seal_packet(cid)
    aid = contract.request_assessment(cid)
    contract.execute_assessment(aid)   # QUARANTINE
    with vm.expect_revert("[NOT_CLEAR]"):
        contract.propose_reviewer(cid, str(reviewer))


def test_acceptance_belongs_to_the_named_account(
        vm, contract, operator, reviewer, stranger):
    vm.sender = operator
    cid = full_clear_flow(contract, vm, operator)
    vm.sender = operator
    contract.propose_reviewer(cid, str(reviewer))

    vm.sender = stranger
    with vm.expect_revert("[UNAUTHORIZED]"):
        contract.accept_reviewer(cid)

    vm.sender = reviewer
    assert contract.accept_reviewer(cid) == str(reviewer).lower()
    assert contract.get_case(cid)["reviewer_state"] == "ACCEPTED"

    with vm.expect_revert("[WRONG_STATE]"):
        contract.accept_reviewer(cid)


def test_lock_in_after_acceptance(vm, contract, operator, reviewer, stranger):
    vm.sender = operator
    cid = full_clear_flow(contract, vm, operator)
    vm.sender = operator
    contract.propose_reviewer(cid, str(reviewer))
    vm.sender = reviewer
    contract.accept_reviewer(cid)
    vm.sender = operator
    with vm.expect_revert("[REVIEWER_LOCKED]"):
        contract.propose_reviewer(cid, str(stranger))


def test_release_and_never_again(vm, contract, operator, reviewer, stranger):
    vm.sender = operator
    cid = full_clear_flow(contract, vm, operator)
    vm.sender = operator
    contract.propose_reviewer(cid, str(reviewer))
    vm.sender = reviewer
    contract.accept_reviewer(cid)

    vm.sender = stranger
    with vm.expect_revert("[UNAUTHORIZED]"):
        contract.release_gate(cid, "stranger does not hold this key")

    vm.sender = reviewer
    note = "Independent review: bulletin scope excludes LOT-9751."
    assert contract.release_gate(cid, note) == "RELEASED"
    gate = contract.get_gate(cid)
    assert gate["gate"] == "RELEASED"
    assert gate["released"] is True or gate["released"] == True
    assert gate["release_note"] == note
    assert gate["blocked_reasons"] == []

    with vm.expect_revert("[ALREADY_RELEASED]"):
        contract.release_gate(cid, "second release")


def test_release_refused_after_worse_news(
        vm, contract, operator, reviewer, stranger):
    """A later assessment quarantining the lot shuts the door before it opens."""
    import re
    vm.sender = operator
    cid = full_clear_flow(contract, vm, operator)
    vm.sender = operator

    # same pinned bytes; the reader decides the range covers this lot
    H.mock_llm(vm, re.escape(H.URL_REGULATOR),
               H.recall_reply(H.OTHER_LOT_BULLETIN, "RECALLED"))
    aid2 = contract.request_assessment(cid)
    stranger = H.accounts()["stranger"]
    vm.sender = stranger
    assert contract.execute_assessment(aid2) == "QUARANTINE"
    assert contract.get_case(cid)["settled_outcome"] == "QUARANTINE"

    vm.sender = operator
    with vm.expect_revert("[NOT_CLEAR]"):
        contract.propose_reviewer(cid, str(reviewer))


def test_first_clear_then_review_before_acceptance_still_blocks(
        vm, contract, operator, reviewer):
    """Proposed but not accepted: the gate still refuses to open."""
    vm.sender = operator
    cid = full_clear_flow(contract, vm, operator)
    vm.sender = operator
    contract.propose_reviewer(cid, str(reviewer))
    vm.sender = reviewer
    with vm.expect_revert("[WRONG_STATE]"):
        contract.release_gate(cid, "")
