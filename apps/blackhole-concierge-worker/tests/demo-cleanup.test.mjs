import assert from "node:assert/strict";
import test from "node:test";

import { nextAppointmentRequest } from "../src/appointment-request.js";
import { isAceCallbackReply } from "../src/sms-reply.js";

test("ACE is the dedicated callback keyword and CALL stays available to Buddy", () => {
  assert.equal(isAceCallbackReply("ACE"), true);
  assert.equal(isAceCallbackReply("ace call me"), true);
  assert.equal(isAceCallbackReply("CALL"), false);
  assert.equal(isAceCallbackReply("YES"), false);
});

test("a second sales appointment request gets fresh identity and history", () => {
  const first = nextAppointmentRequest({}, {
    requestId:"appt_first",
    requestedAt:"2026-08-16T14:00:00.000Z",
    start:"2026-08-17T19:00:00.000Z",
    label:"Monday at 3:00 PM",
  });
  const second = nextAppointmentRequest({
    appointmentRequestId:first.requestId,
    appointmentRequestCount:first.requestCount,
    appointmentHistory:first.appointmentHistory,
  }, {
    requestId:"appt_second",
    requestedAt:"2026-08-16T15:00:00.000Z",
    start:"2026-08-18T20:00:00.000Z",
    label:"Tuesday at 4:00 PM",
  });

  assert.equal(first.requestCount, 1);
  assert.equal(second.requestCount, 2);
  assert.equal(second.requestId, "appt_second");
  assert.equal(second.appointmentHistory.length, 2);
  assert.equal(second.appointmentHistory[1].start, "2026-08-18T20:00:00.000Z");
});
