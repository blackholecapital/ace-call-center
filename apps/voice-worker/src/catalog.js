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
  "Living Room Furniture": [
    { id: "living-1", name: "Ashton 3-Piece Living Room Set", short: "sofa, loveseat, and chair" },
    { id: "living-2", name: "Camden Reclining Sofa & Loveseat", short: "reclining two-piece living room set" },
  ],
  "Bedroom Furniture": [
    { id: "bedroom-1", name: "Crown Mark Elmer Queen Bedroom Set", short: "queen bed with coordinated bedroom pieces" },
    { id: "bedroom-2", name: "Crown Mark Nemy Queen Bedroom Set", short: "queen bedroom set with a modern profile" },
  ],
  "Dining Room Furniture": [
    { id: "dining-1", name: "Finling 5-Piece Dining Set", short: "table and four-chair dining set" },
    { id: "dining-2", name: "Carter 5-Piece Dining Set", short: "five-piece everyday dining set" },
  ],
  Mattresses: [
    { id: "mattress-1", name: "Queen Hybrid Mattress", short: "hybrid foam and coil support" },
    { id: "mattress-2", name: "Queen Pillow-Top Mattress", short: "plush pillow-top comfort" },
  ],
  Appliances: [
    { id: "appliance-1", name: "18 Cu. Ft. Top-Freezer Refrigerator", short: "full-size refrigerator with top freezer" },
    { id: "appliance-2", name: "Top-Load Washer & Electric Dryer Pair", short: "matching laundry pair" },
  ],
  Computers: [
    { id: "computer-1", name: "15.6-Inch Windows Laptop", short: "Core i5 class, 16 GB memory, 512 GB storage" },
    { id: "computer-2", name: "24-Inch All-in-One Desktop", short: "all-in-one desktop, 16 GB memory, 512 GB storage" },
  ],
  Electronics: [
    { id: "electronics-1", name: "Samsung 75-Inch 4K Smart TV", short: "75-inch 4K smart television" },
    { id: "electronics-2", name: "LG 75-Inch 4K Smart TV", short: "75-inch 4K smart television" },
  ],
  Smartphones: [
    { id: "phone-1", name: "Samsung Galaxy Smartphone", short: "current-generation Android smartphone" },
    { id: "phone-2", name: "Apple iPhone", short: "current-generation iPhone" },
  ],
  Gaming: [
    { id: "gaming-1", name: "PlayStation 5 Console", short: "current PlayStation console" },
    { id: "gaming-2", name: "Xbox Series X Console", short: "current Xbox console" },
  ],
  "Financing Questions": [
    { id: "finance-1", name: "Rental-Purchase & Payment Questions", short: "agreement, payment, or renewal questions" },
    { id: "finance-2", name: "Early Purchase & Payoff Questions", short: "early purchase or payoff options" },
  ],
  Other: [
    { id: "other-1", name: "Delivery or Existing Agreement Help", short: "delivery, service, or current agreement support" },
    { id: "other-2", name: "Product or Store Help", short: "product not listed or local store assistance" },
  ],
};

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

  // Also accept the product/brand itself when the customer is clearly choosing it.
  // This lets "I'll take the LG" or "give me the Camden" complete the demo flow.
  if (hasSelectionIntent(normalized)) {
    for (const options of Object.values(BUDDY_DEMO_CATALOG)) {
      for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        const name = normalizeSpeech(option.name);
        const significant = name
          .split(" ")
          .filter((word) => word.length >= 3 && !["inch", "queen", "piece", "smart", "set", "console"].includes(word));

        if (significant.some((word) => normalized.includes(word))) return index;
      }
    }
  }

  // Electronics demo aliases are intentionally explicit because callers naturally say
  // "the LG" or "the Samsung" after Buddy presents the two TVs.
  if (/\blg\b/.test(normalized)) return 1;
  if (/\bsamsung\b/.test(normalized)) return 0;

  return -1;
}
