const assert = require("assert");
const { initialLeadScore, progressiveLeadScore, baselineOpportunityValue } = require("../backend/layers/domain/lead-intelligence");

const completeLead = {
  firstName:"Jamie", lastName:"Rivera", company:"Example Co", phone:"+18135551212", email:"jamie@example.com",
  interest:"Full Rack Colocation", location:"Tampa", preferredContactMethod:"Phone", preferredContactTime:"Morning",
  comments:"We need a full rack for twelve servers, redundant power, and a gigabit uplink within sixty days.",
  leadSource:"ACEHost.com", smsConsent:true,
};

const initial = initialLeadScore(completeLead);
assert(initial.score > 50 && initial.score <= 68, "complete initial lead is useful but leaves room for qualification");

const afterCall = progressiveLeadScore(completeLead, { contacted:true, engaged:true, callCompleted:true, customerWordCount:25 });
assert(afterCall.score > initial.score, "AI conversation increases score");

const afterProposal = progressiveLeadScore({ ...completeLead, estimateNumber:"ACE-100", documentStatus:"Sent" }, {
  contacted:true, engaged:true, callCompleted:true, customerWordCount:25, productSelected:true, estimateSent:true, docsSent:true,
});
assert(afterProposal.score > afterCall.score, "proposal and documents increase score");
assert(afterProposal.score <= 100, "score is capped at 100");

assert.strictEqual(baselineOpportunityValue({ interest:"Full Rack Colocation" }), 1499);
assert.strictEqual(baselineOpportunityValue({ interest:"AI Automations" }), 3500);
assert.strictEqual(baselineOpportunityValue({ interest:"Quarter Rack Colocation" }), 399);
assert.strictEqual(baselineOpportunityValue({ interest:"VPS Hosting" }), 299);
assert.strictEqual(baselineOpportunityValue({ interest:"Full Rack Colocation", estimatedMonthlyTotal:1875 }), 1875, "real estimate wins over baseline");

console.log("Lead intelligence tests passed");
