export function isAceCallbackReply(value = "") {
  return /^ace(?:\s+(?:call|call me|please))?\s*[.!]?$/i.test(String(value).trim());
}
