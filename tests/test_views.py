"""Views: pagination, history, summary -- the record a reader can audit."""

import pytest

from tests import helpers as H


def test_history_tells_the_whole_story(vm, contract, operator, reviewer):
    vm.sender = operator
    cid = H.full_clear_flow(contract, vm, operator)

    vm.sender = operator
    contract.propose_reviewer(cid, str(reviewer))
    vm.sender = reviewer
    contract.accept_reviewer(cid)
    contract.release_gate(cid, "released after independent review")

    page = contract.get_history(cid, 0, 10)
    actions = [e["action"] for e in page["items"]]
    assert actions == [
        "OPEN", "SEALED", "ASSESSMENT_REQUESTED", "ASSESSMENT_FINALIZED",
        "REVIEWER_PROPOSED", "REVIEWER_ACCEPTED", "GATE_RELEASED",
    ]
    sealed = page["items"][1]     # the freeze carries the packet digest
    assert sealed["detail"] == contract.get_case(cid)["packet_sha256"]
    released = page["items"][-1]
    assert released["by"] == str(reviewer).lower()
    assert "independent review" in released["detail"]


def test_history_pagination(vm, contract, operator, reviewer):
    vm.sender = operator
    cid = H.full_clear_flow(contract, vm, operator)
    vm.sender = operator
    contract.propose_reviewer(cid, str(reviewer))
    contract.request_assessment(cid)      # a second request, no execution

    full = contract.get_history(cid, 0, 10)
    assert full["total"] == 6
    page1 = contract.get_history(cid, 0, 2)
    page2 = contract.get_history(cid, 2, 2)
    page3 = contract.get_history(cid, 4, 2)
    page4 = contract.get_history(cid, 6, 2)
    assert [e["seq"] for e in page1["items"]] == [1, 2]
    assert [e["seq"] for e in page2["items"]] == [3, 4]
    assert [e["seq"] for e in page3["items"]] == [5, 6]
    assert page4["items"] == []
    assert page1["limit"] == 2 and page2["offset"] == 2


def test_assessment_pagination_newest_first(vm, contract, operator):
    vm.sender = operator
    cid, _ = H.standard_case(contract, vm)
    contract.request_assessment(cid)
    a2 = contract.request_assessment(cid)
    a3 = contract.request_assessment(cid)
    page = contract.list_case_assessments(cid, 0, 10)
    assert [a["assessment_id"] for a in page["items"]] == ["A3", "A2", "A1"]


def test_case_summary_view(vm, contract, operator, reviewer):
    vm.sender = operator
    cid, _ = H.standard_case(
        contract, vm, llm_reply=H.recall_reply(H.PERMANENT_BULLETIN))
    aid = contract.request_assessment(cid)
    contract.execute_assessment(aid)

    summary = contract.get_case_summary(cid)
    assert summary["case"]["case_id"] == "C1"
    assert summary["case"]["state"] == "SETTLED"
    assert summary["case"]["settled_outcome"] == "QUARANTINE"
    assert summary["gate"]["gate"] == "BLOCKED"
    assert summary["gate"]["settled_outcome"] == "QUARANTINE"
    assert summary["latest_assessment"]["assessment_id"] == aid
    assert summary["latest_assessment"]["outcome"] == "QUARANTINE"
    assert summary["counts"]["case"] == 1


def test_missing_records_refuse_cleanly(vm, contract, operator):
    with vm.expect_revert("[NOT_FOUND]"):
        contract.get_case("C99")
    with vm.expect_revert("[NOT_FOUND]"):
        contract.get_source("C99#1")
    with vm.expect_revert("[NOT_FOUND]"):
        contract.get_assessment("A99")
    with vm.expect_revert("[NOT_FOUND]"):
        contract.get_assessment("A424242424")
