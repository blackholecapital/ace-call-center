const BASE_SCORE = 15;

const VALUE_RULES = [
  [/\b(ai automations?|ai concierge|automations?)\b/i, 3500],
  [/\b(crypto|mining)\b/i, 5000],
  [/\b(telehealth|healthcare)\b/i, 3000],
  [/\b(wireless|tower|network infrastructure)\b/i, 2500],
  [/\bfull(?:\s|-)?rack\b/i, 1499],
  [/\bhalf(?:\s|-)?rack\b/i, 799],
  [/\b(quarter|1\/4)(?:\s|-)?rack\b/i, 399],
  [/\b(colocation|colo|rack hosting)\b/i, 999],
  [/\b(dedicated server|bare metal)\b/i, 1199],
  [/\b(managed service|managed hosting)\b/i, 1500],
  [/\b(vps|virtual private server)\b/i, 299],
  [/\b(disaster recovery|business continuity)\b/i, 1500],
  [/\b(cloud hosting|private cloud|cloud)\b/i, 750],
  [/\b(connectivity|bandwidth|transit)\b/i, 750],
];

function text(value) {
  return String(value || "").trim();
}

function add(items, key, label, points, condition) {
  if (!condition) return;
  items.push({ key, label, points });
}

function initialLeadScore(contact = {}) {
  const items = [{ key:"base", label:"New inquiry", points:BASE_SCORE }];
  const comments = text(contact.comments || contact.notes);
  const phoneDigits = text(contact.phone).replace(/\D/g, "");
  const email = text(contact.email);

  add(items, "firstName", "First name supplied", 4, text(contact.firstName || contact.first_name));
  add(items, "lastName", "Last name supplied", 3, text(contact.lastName || contact.last_name));
  add(items, "company", "Company supplied", 5, text(contact.company || contact.organization));
  add(items, "phone", "Callable phone supplied", 7, phoneDigits.length >= 10);
  add(items, "email", "Deliverable email supplied", 7, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  add(items, "interest", "Service interest selected", 8, text(contact.interest || contact.productInterest || contact.product_interest));
  add(items, "location", "Preferred facility or location supplied", 4, text(contact.location || contact.preferredStore || contact.preferred_store));
  add(items, "method", "Contact method selected", 2, text(contact.preferredContactMethod || contact.contactMethod || contact.contact_method));
  add(items, "time", "Contact time supplied", 2, text(contact.preferredContactTime || contact.contactTime || contact.contact_time));
  add(items, "comments", "Initial requirements supplied", 5, comments.length >= 20);
  add(items, "detail", "Detailed initial requirements supplied", 3, comments.length >= 80);
  add(items, "source", "Lead source captured", 2, text(contact.leadSource || contact.lead_source));
  add(items, "consent", "Contact consent recorded", 1, contact.smsConsent === true || contact.consent === true || contact.consent === "true" || contact.consent === "on");

  return {
    score:Math.min(68, items.reduce((sum, item) => sum + item.points, 0)),
    items,
  };
}

function progressiveLeadScore(contact = {}, facts = {}) {
  const initial = initialLeadScore(contact);
  const items = [...initial.items];
  const requirements = text(contact.requirementsSummary || facts.requirements);
  const transcriptWords = Number(facts.customerWordCount || 0);

  add(items, "contacted", "Outbound contact delivered", 4, facts.contacted || contact.outreachStatus === "Sent");
  add(items, "engaged", "Two-way AI conversation connected", 6, facts.engaged);
  add(items, "completedCall", "AI qualification call completed", 3, facts.callCompleted);
  add(items, "discovery", "Meaningful needs captured", 7, requirements.length >= 20 || transcriptWords >= 8);
  add(items, "product", "Product fit identified", 4, facts.productSelected || text(contact.selectedProduct));
  add(items, "handoff", "Sales follow-up requested", 3, facts.salesHandoff || /^(open|requested|assigned)$/i.test(text(contact.salesHandoffStatus)));
  add(items, "estimate", "Preliminary estimate sent", 8, facts.estimateSent || text(contact.estimateNumber));
  add(items, "documents", "Service agreement sent", 5, facts.docsSent || ["sent","signed","completed"].includes(text(contact.documentStatus).toLowerCase()));
  add(items, "appointmentRequested", "Sales appointment requested", 2, facts.appointmentRequested || /requested/i.test(text(contact.appointmentStatus)));
  add(items, "appointmentConfirmed", "Sales appointment confirmed", 4, facts.appointmentConfirmed || /approved|confirmed|rescheduled/i.test(text(contact.appointmentStatus)));
  add(items, "scheduled", "Provisioning scheduled", 3, facts.scheduled || text(contact.deliveryAt));
  add(items, "closed", "Opportunity converted", 10, facts.closed || String(contact.stage || "") === "Closed");

  const override = Number(contact.leadScoreOverride);
  const computed = Math.min(100, items.reduce((sum, item) => sum + item.points, 0));
  return {
    score:Number.isFinite(override) ? Math.min(100, Math.max(0, override)) : computed,
    initialScore:initial.score,
    items,
  };
}

function baselineOpportunityValue(contact = {}) {
  const quoted = Number(contact.estimatedMonthlyTotal || contact.estimateQuote?.monthlyTotal || 0);
  if (Number.isFinite(quoted) && quoted > 0) return Math.round(quoted);
  const description = [contact.selectedProduct, contact.interest, contact.product, contact.lookingFor].map(text).filter(Boolean).join(" ");
  for (const [pattern, value] of VALUE_RULES) if (pattern.test(description)) return value;
  return description ? 1000 : 500;
}

module.exports = { BASE_SCORE, VALUE_RULES, initialLeadScore, progressiveLeadScore, baselineOpportunityValue };
