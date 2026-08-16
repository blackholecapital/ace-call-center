import assert from "node:assert/strict";
import test from "node:test";

import { getAcePreliminaryEstimate, getBuddyDemoOptions } from "../src/catalog.js";

test("catalog products expose approved starting prices", () => {
  for (const interest of ["Dedicated Servers", "AI Call Automation", "Crypto Mining Facility"]) {
    const options = getBuddyDemoOptions(interest);
    assert.ok(options.length > 0);
    assert.ok(options.every(option => Number(option.basePrice) > 0));
  }
});

test("builds a generic preliminary estimate from the lead product", () => {
  const quote = getAcePreliminaryEstimate({ interest:"AI Call Automation", selectedProduct:"Inbound AI Call Concierge", location:"Tampa" });
  assert.equal(quote.serviceName, "Inbound AI Call Concierge");
  assert.equal(quote.monthlyTotal, 3500);
  assert.equal(quote.setupFeeDue, 0);
});

test("keeps rack-specific pricing and standard line items", () => {
  const quote = getAcePreliminaryEstimate({ interest:"Colocation Hosting", conversation:"We need a quarter rack in Raleigh" });
  assert.equal(quote.facilityCode, "RDU");
  assert.equal(quote.monthlyTotal, 399);
  assert.match(quote.lineItems[0].description, /1\/4 Rack/);
});

test("uses the selected high-density rack base price", () => {
  const quote = getAcePreliminaryEstimate({ interest:"Full Rack Colocation", selectedProduct:"High Density Full Rack", location:"Tampa" });
  assert.equal(quote.serviceName, "High Density Full Rack");
  assert.equal(quote.monthlyTotal, 1999);
});
