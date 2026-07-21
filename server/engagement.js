function choiceState(entry = {}, choices = [], voterKey = "") {
  const counts = Object.fromEntries(choices.map((choice) => [choice, Math.max(0, Number(entry.counts?.[choice]) || 0)]));
  const selected = voterKey ? entry.voters?.[voterKey] || "" : "";
  return {
    counts,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    selected: choices.includes(selected) ? selected : ""
  };
}

function applyChoice(entry, choices, voterKey, selected) {
  if (!choices.includes(selected)) throw new Error("Invalid engagement choice");
  entry.counts ||= {};
  entry.voters ||= {};
  const previous = choices.includes(entry.voters[voterKey]) ? entry.voters[voterKey] : "";
  if (previous === selected) return false;
  if (previous) entry.counts[previous] = Math.max(0, (Number(entry.counts[previous]) || 0) - 1);
  entry.counts[selected] = (Number(entry.counts[selected]) || 0) + 1;
  entry.voters[voterKey] = selected;
  return true;
}

function pruneEngagementStore(store = {}, { pollIds = [], newsIds = [], predictionIds = [] } = {}) {
  const keep = (entries, validIds) => {
    const valid = new Set(validIds.map(String));
    return Object.fromEntries(Object.entries(entries || {}).filter(([id]) => valid.has(String(id))));
  };
  return {
    ...store,
    polls: keep(store.polls, pollIds),
    newsReactions: keep(store.newsReactions, newsIds),
    predictionVotes: keep(store.predictionVotes, predictionIds)
  };
}

module.exports = { applyChoice, choiceState, pruneEngagementStore };
