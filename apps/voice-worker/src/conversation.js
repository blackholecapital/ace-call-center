function normalized(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstName(value = "") {
  const clean = String(value || "").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() : "";
}

function numberSetting(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function meaningfulBargeIn({ transcript = "", confidence = 0, isFinal = false } = {}, env = {}) {
  const clean = normalized(transcript);
  if (!clean) return false;

  const immediate = /^(?:stop|wait|hold on|hang on|no|nope|yes|yeah|actually|excuse me|one second|just a second)$/i.test(clean);
  const filler = /^(?:uh+|um+|mm+|hmm+|ah+|oh+|huh|er+|background noise|music|laughter|laughing)$/i.test(clean);
  if (filler) return false;
  if (immediate) return true;

  const words = clean.split(" ").filter(Boolean);
  const minimumWords = Math.max(1, numberSetting(env.BARGE_IN_MIN_WORDS, 2));
  const minimumConfidence = numberSetting(
    isFinal ? env.BARGE_IN_FINAL_MIN_CONFIDENCE : env.BARGE_IN_INTERIM_MIN_CONFIDENCE,
    isFinal ? 0.78 : 0.88,
  );
  return words.length >= minimumWords && Number(confidence || 0) >= minimumConfidence;
}

export function conversationOpening(state = {}, { assistant = "Alley", brand = "ACE Host" } = {}) {
  const name = firstName(state.firstName);
  const hello = name ? `Hi ${name}, it's ${assistant} from ${brand}.` : `Hi, it's ${assistant} from ${brand}.`;
  const subject = String(state.priorSelectedProduct || state.interest || "your infrastructure plans").trim();
  const estimate = String(state.estimateNumber || "").trim();
  const customerInitiated = /^(?:inbound|sms-reply|email-call-link|customer-callback)$/i.test(String(state.triggerType || ""));

  if (state.isFollowup) {
    const returnLine = customerInitiated ? "Thanks for getting back in touch." : "I'm following up on our earlier conversation.";
    const estimateLine = estimate
      ? `I have our notes and estimate ${estimate} for ${subject} right here, so you won't need to repeat yourself.`
      : `I have our notes about ${subject} right here, so you won't need to repeat yourself.`;
    return `${hello} ${returnLine} ${estimateLine} What would you like to pick up with today?`;
  }

  if (customerInitiated) {
    return `${hello} Thanks for calling. I can help you think through the right setup, prepare a preliminary estimate, or arrange time with our sales team. Tell me a little about what you're working on and how we can help today.`;
  }

  const leadContext = [subject && subject !== "your infrastructure plans" ? subject : "", state.location]
    .filter(Boolean)
    .join(" in ");
  const contextLine = leadContext ? `I saw your request about ${leadContext}, and I wanted to personally welcome you.` : "I wanted to personally welcome you.";
  return `${hello} ${contextLine} I can answer questions, help you narrow down the right setup, or prepare a preliminary estimate when you're ready. How's your day going?`;
}
