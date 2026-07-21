const assert = require("node:assert/strict");
const test = require("node:test");
const { applyChoice, choiceState, pruneEngagementStore } = require("../server/engagement");

test("engagement records one choice per anonymous visitor", () => {
  const entry = { counts: {}, voters: {} };
  assert.equal(applyChoice(entry, ["agree", "disagree"], "visitor-a", "agree"), true);
  assert.equal(applyChoice(entry, ["agree", "disagree"], "visitor-a", "agree"), false);
  assert.deepEqual(choiceState(entry, ["agree", "disagree"], "visitor-a"), {
    counts: { agree: 1, disagree: 0 },
    total: 1,
    selected: "agree"
  });
});

test("changing a choice moves the vote without increasing the total", () => {
  const entry = { counts: { agree: 2, disagree: 1 }, voters: { "visitor-a": "agree" } };
  applyChoice(entry, ["agree", "disagree"], "visitor-a", "disagree");
  assert.deepEqual(choiceState(entry, ["agree", "disagree"], "visitor-a"), {
    counts: { agree: 1, disagree: 2 },
    total: 3,
    selected: "disagree"
  });
});

test("public state excludes voter keys and ignores invalid stored values", () => {
  const state = choiceState({ counts: { top: 4, unknown: 99 }, voters: { secret: "unknown" } }, ["top", "more"], "secret");
  assert.deepEqual(state, { counts: { top: 4, more: 0 }, total: 4, selected: "" });
  assert.equal("voters" in state, false);
});

test("invalid choices are rejected", () => {
  assert.throws(() => applyChoice({ counts: {}, voters: {} }, ["top"], "visitor-a", "unknown"), /Invalid engagement choice/);
});

test("deleting content also deletes its stored votes and reactions", () => {
  const store = {
    polls: { keepPoll: { counts: {} }, deletedPoll: { counts: {} } },
    newsReactions: { keepNews: { counts: {} }, deletedNews: { counts: {} } },
    predictionVotes: { keepPrediction: { counts: {} }, deletedPrediction: { counts: {} } },
    unrelatedState: { preserved: true }
  };

  assert.deepEqual(pruneEngagementStore(store, {
    pollIds: ["keepPoll"],
    newsIds: ["keepNews"],
    predictionIds: ["keepPrediction"]
  }), {
    polls: { keepPoll: { counts: {} } },
    newsReactions: { keepNews: { counts: {} } },
    predictionVotes: { keepPrediction: { counts: {} } },
    unrelatedState: { preserved: true }
  });
});
