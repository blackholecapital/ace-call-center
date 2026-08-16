import assert from "node:assert/strict";
import test from "node:test";

import { conversationOpening, meaningfulBargeIn } from "../src/conversation.js";

test("new lead opening welcomes the customer without forcing a product menu", () => {
  const opening = conversationOpening({ firstName:"mike", interest:"Rack Hosting", location:"Tampa" });
  assert.match(opening, /personally welcome you/i);
  assert.match(opening, /Rack Hosting in Tampa/i);
  assert.match(opening, /preliminary estimate/i);
  assert.doesNotMatch(opening, /option one|option two/i);
});

test("customer-initiated opening invites needs in the customer's own words", () => {
  const opening = conversationOpening({ firstName:"mike", triggerType:"inbound" });
  assert.match(opening, /Thanks for calling/i);
  assert.match(opening, /what you're working on/i);
  assert.doesNotMatch(opening, /How's your day/i);
});

test("follow-up opening carries estimate context forward", () => {
  const opening = conversationOpening({
    firstName:"mike",
    isFollowup:true,
    triggerType:"sms-reply",
    priorSelectedProduct:"Quarter Rack Colocation",
    estimateNumber:"ACE-20260816-1234",
  });
  assert.match(opening, /getting back in touch/i);
  assert.match(opening, /ACE-20260816-1234/);
  assert.match(opening, /won't need to repeat yourself/i);
});

test("background fillers do not interrupt Alley", () => {
  assert.equal(meaningfulBargeIn({ transcript:"um", confidence:0.99, isFinal:true }), false);
  assert.equal(meaningfulBargeIn({ transcript:"background noise", confidence:0.99, isFinal:true }), false);
  assert.equal(meaningfulBargeIn({ transcript:"people talking", confidence:0.42, isFinal:false }), false);
});

test("clear caller speech and stop commands can interrupt Alley", () => {
  assert.equal(meaningfulBargeIn({ transcript:"hold on", confidence:0.2, isFinal:false }), true);
  assert.equal(meaningfulBargeIn({ transcript:"I have a question", confidence:0.9, isFinal:false }), true);
  assert.equal(meaningfulBargeIn({ transcript:"rack space", confidence:0.84, isFinal:true }), true);
});
