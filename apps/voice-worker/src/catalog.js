export const BUDDY_DEMO_CATALOG = {
  "Dedicated Servers": [
    { id:"dedicated-managed", name:"Managed Dedicated Server", short:"managed compute, monitoring, and support" },
    { id:"dedicated-custom", name:"Custom Dedicated Server", short:"custom compute, memory, storage, and network configuration" },
  ],
  "Colocation Hosting": [
    { id:"colo-quarter", name:"Quarter Rack Colocation", short:"secure rack space, power, and network connectivity" },
    { id:"colo-half", name:"Half Rack Colocation", short:"expanded rack capacity with redundant connectivity" },
  ],
  "Full Rack Colocation": [
    { id:"rack-standard", name:"Standard Full Rack", short:"full cabinet, metered power, and network uplinks" },
    { id:"rack-high-density", name:"High Density Full Rack", short:"higher power density and custom network design" },
  ],
  "Crypto Mining Facility": [
    { id:"mining-gpu", name:"GPU Mining Hosting", short:"power, cooling, monitoring, and remote hands" },
    { id:"mining-asic", name:"ASIC Mining Hosting", short:"high-density power and purpose-built cooling" },
  ],
  "AI Call Automation": [
    { id:"ai-call-inbound", name:"Inbound AI Call Concierge", short:"always-on call answering, qualification, and routing" },
    { id:"ai-call-outbound", name:"Outbound AI Call Campaigns", short:"automated lead follow-up and appointment booking" },
  ],
  "AI Lead Qualification": [
    { id:"ai-lead-realtime", name:"Real-Time Lead Qualification", short:"instant scoring, enrichment, and sales handoff" },
    { id:"ai-lead-reactivation", name:"Lead Reactivation Automation", short:"multi-channel follow-up for dormant opportunities" },
  ],
  "AI Support Concierge": [
    { id:"ai-support-tier1", name:"Tier One AI Support", short:"automated intake, troubleshooting, and escalation" },
    { id:"ai-support-noc", name:"AI NOC Concierge", short:"incident intake, status updates, and on-call routing" },
  ],
  "AI Workflow Automation": [
    { id:"ai-workflow-sales", name:"Sales Workflow Automation", short:"CRM updates, proposals, reminders, and reporting" },
    { id:"ai-workflow-ops", name:"Operations Workflow Automation", short:"ticketing, provisioning, alerts, and approvals" },
  ],
  Other: [
    { id: "other-consult", name: "Infrastructure Consultation", short: "custom hosting, networking, or data-center planning" },
    { id: "other-support", name: "Existing Account Support", short: "service, billing, provisioning, or technical support" },
  ],
};

const RACK_PLANS = {
  quarter: { id:"quarter-rack", serviceName:"Quarter Rack Colocation", description:"1/4 Rack 208V/30A A/B Power", monthlyTotal:399 },
  half: { id:"half-rack", serviceName:"Half Rack Colocation", description:"1/2 Rack 208V/30A A/B Power", monthlyTotal:799 },
  full: { id:"full-rack", serviceName:"Full Rack Colocation", description:"Full Rack 208V/30A A/B Power", monthlyTotal:1499 },
};

const FACILITIES = {
  rdu: { facilityCode:"RDU", facilityName:"Raleigh, North Carolina" },
  tpa: { facilityCode:"TPA", facilityName:"Tampa, Florida" },
};

function buildRackEstimate(size, facility) {
  const plan=RACK_PLANS[size], site=FACILITIES[facility];
  return {
    id:`${facility}-${plan.id}`,
    subject:`${site.facilityCode} Data Center Colocation Estimate`,
    ...site,
    serviceName:plan.serviceName,
    monthlyTotal:plan.monthlyTotal,
    currency:"USD",
    creditCardFeePercent:3.5,
    termMonths:12,
    validityDays:30,
    demoSample:true,
    setupFeeStandard:199,
    setupFeeDue:0,
    promotion:"$199 one-time setup fee waived for AI Concierge customers",
    lineItems:[
      { quantity:1, description:plan.description, unitPrice:plan.monthlyTotal, total:plan.monthlyTotal },
      { quantity:1, description:"IPv4 Subnet /29 (5 Usable)", unitPrice:0, total:0 },
      { quantity:1, description:"1GB Dedicated Port / 1GB Unmetered Link", unitPrice:0, total:0 },
      { quantity:1, description:"One-Time Setup Fee — Waived for AI Concierge Customers", unitPrice:199, discount:199, total:0 },
    ],
  };
}

export const ACE_PRELIMINARY_ESTIMATES = Object.fromEntries(
  Object.keys(FACILITIES).flatMap(facility => Object.keys(RACK_PLANS).map(size => [
    `${facility}-${size}-rack`, buildRackEstimate(size, facility),
  ])),
);

export function getAcePreliminaryEstimate({ interest = "", location = "", conversation = "" } = {}) {
  const allText = `${interest} ${location} ${conversation}`.toLowerCase();
  const conversationText=String(conversation||"").toLowerCase();
  const facility=/\b(rdu|raleigh|durham|north carolina)\b/.test(allText)?"rdu":/\b(tpa|tampa|florida)\b/.test(allText)?"tpa":"tpa";
  let size="";
  if(/\b(quarter(?: of)? (?:a )?rack|1\/4 rack|three 4u|3 4u|three four u|three four-u)\b/.test(conversationText))size="quarter";
  else if(/\b(half rack|1\/2 rack)\b/.test(conversationText))size="half";
  else if(/\b(full rack|whole rack|full cabinet)\b/.test(conversationText))size="full";
  else if(/\b(quarter(?: of)? (?:a )?rack|1\/4 rack)\b/.test(allText))size="quarter";
  else if(/\b(half rack|1\/2 rack)\b/.test(allText))size="half";
  else if(/\b(full rack|whole rack|full cabinet)\b/.test(allText))size="full";
  if(!size)return null;
  return JSON.parse(JSON.stringify(ACE_PRELIMINARY_ESTIMATES[`${facility}-${size}-rack`]));
}

export function getBuddyDemoOptions(interest = "") {
  const key = String(interest || "").trim();
  return BUDDY_DEMO_CATALOG[key] || [];
}

export function formatBuddyDemoOptions(interest = "") {
  const options = getBuddyDemoOptions(interest);
  if (!options.length) return "";
  return options
    .map((option, index) => `Option ${index === 0 ? "one" : "two"}: ${option.name}. ${option.short}.`)
    .join("\n");
}

function normalizeSpeech(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9+' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSelectionIntent(text) {
  return /\b(i'?ll take|i want|i choose|i pick|give me|go with|take|choose|pick|select|want|number|option)\b/.test(text);
}

export function parseBuddyChoice(transcript = "") {
  const normalized = normalizeSpeech(transcript);
  if (!normalized) return -1;

  // Accept natural phrases from STT, not just a bare "1" or "2".
  // Examples: "I'll take number two", "I want option 2", "number two please".
  if (/\b(?:option|number)\s*(?:1|one)\b/.test(normalized)) return 0;
  if (/\b(?:option|number)\s*(?:2|two)\b/.test(normalized)) return 1;
  if (/^(?:1|one)(?: please)?$/.test(normalized)) return 0;
  if (/^(?:2|two)(?: please)?$/.test(normalized)) return 1;

  // Also accept distinctive words from a service name when the prospect is
  // clearly choosing it.
  if (hasSelectionIntent(normalized)) {
    for (const options of Object.values(BUDDY_DEMO_CATALOG)) {
      for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        const name = normalizeSpeech(option.name);
        const significant = name
          .split(" ")
          .filter((word) => word.length >= 3 && !["host", "hosting", "service", "automation"].includes(word));

        if (significant.some((word) => normalized.includes(word))) return index;
      }
    }
  }

  return -1;
}
