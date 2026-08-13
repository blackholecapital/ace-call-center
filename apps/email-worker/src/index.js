const RESEND_URL = "https://api.resend.com/emails";

function esc(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function brandName(env) { return String(env.BRAND_NAME || "Black Hole Capital"); }
function assistantName(env) { return String(env.ASSISTANT_NAME || "AI Concierge"); }
function brandColor(env) { return String(env.BRAND_PRIMARY_COLOR || "#111111"); }
function brandUrl(env) { return String(env.BRAND_URL || "https://blackholecapital.ai"); }
function tenantContext(env, event = {}) { const payload=event.payload||{},contact=payload.contact||event.contact||{};return{tenantId:String(event.tenantId||payload.tenantId||env.TENANT_ID||"blackhole"),corporateId:String(event.corporateId||payload.corporateId||env.CORPORATE_ID||env.TENANT_ID||"blackhole"),locationId:String(event.locationId||payload.locationId||contact.locationId||contact.location_id||env.DEFAULT_LOCATION_ID||"corporate")}; }

function shell(env, title, inner) {
  const brand = brandName(env);
  const accent = brandColor(env);
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:40px 0;"><tr><td align="center">
  <table width="650" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #d9e3f5;overflow:hidden;">
  <tr><td style="background:${esc(accent)};color:#fff;padding:28px;text-align:center;"><h1 style="margin:0;font-size:30px;">${esc(brand)}</h1><div style="margin-top:6px;font-size:15px;opacity:.9;">${esc(title)}</div></td></tr>
  <tr><td style="padding:32px;">${inner}</td></tr>
  <tr><td style="background:${esc(accent)};color:#fff;text-align:center;padding:18px;font-size:13px;">${esc(brand)}<br>${esc(brandUrl(env))}</td></tr>
  </table></td></tr></table></body></html>`;
}

async function emit(env, event) {
  const tenant=tenantContext(env,event),tagged={...event,...tenant,ts:Date.now()};
  if (env.EVENTS) { try { await env.EVENTS.send(tagged); } catch (error) { console.error("Email event emit failed", error); } }
  if (env.ANALYTICS) { try { env.ANALYTICS.writeDataPoint({blobs:[event.type||"email.event",event.contactId||"",event.messageType||"",tenant.tenantId,tenant.corporateId,tenant.locationId],doubles:[Date.now()],indexes:[tenant.tenantId]}); } catch {} }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status:204 });
    if (url.pathname === "/api/health") return Response.json({ ok:true, service:env.TENANT_ID === "ace-host" ? "ace-email-worker" : "blackhole-email-worker", provider:"resend", health:"online", tenant:tenantContext(env) });
    if (url.pathname !== "/internal/send" || request.method !== "POST") return Response.json({ ok:false, error:"Route not found" }, { status:404 });

    const payload = await request.json();
    const contact = payload.contact || {};
    const lead = payload.lead || {};
    const contactId = String(payload.contactId || contact.id || "");
    const messageType = String(payload.messageType || "buddy-welcome");
    const callNowUrl = String(payload.callback?.callNowUrl || "").trim();
    const signingUrl = String(payload.docusign?.signingUrl || payload.signingUrl || "").trim();
    const productName = payload.product?.name || payload.productName || contact.selectedProduct || "your selected item";
    const delivery = payload.delivery || {};
    const brand = brandName(env);
    const assistant = assistantName(env);
    const accent = brandColor(env);

    let subject;
    let html;

    if (messageType === "buddy-docusign") {
      subject = `Your ${brand} agreement is ready to sign`;
      html = shell(env, "Your agreement is ready", `
        <h2 style="margin-top:0;color:${esc(accent)};">Hi ${esc(contact.firstName || "there")},</h2>
        <p>Great choice on the <strong>${esc(productName)}</strong>. Your demo rental agreement is ready for review and signature.</p>
        <div style="margin:28px 0;text-align:center;"><a href="${esc(signingUrl)}" style="display:inline-block;background:${esc(accent)};color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:6px;">Review &amp; Sign Agreement</a></div>
        <p>Once the agreement is signed, ${esc(assistant)} will confirm it and we can move directly to delivery scheduling.</p>`);
    } else if (messageType === "buddy-docusign-signed") {
      subject = `${brand} agreement signed - next up: delivery`;
      html = shell(env, "Agreement signed", `
        <h2 style="margin-top:0;color:${esc(accent)};">You're all set, ${esc(contact.firstName || "there")}.</h2>
        <p>We received your signed agreement${productName ? ` for the <strong>${esc(productName)}</strong>` : ""}.</p>
        <p>${esc(assistant)} can now help you choose a delivery date and time.</p>`);
    } else if (messageType === "buddy-delivery-confirmed") {
      subject = `Your ${brand} delivery is scheduled`;
      html = shell(env, "Delivery scheduled", `
        <h2 style="margin-top:0;color:${esc(accent)};">Delivery confirmed, ${esc(contact.firstName || "there")}.</h2>
        <p>Your <strong>${esc(productName)}</strong> delivery is scheduled for:</p>
        <div style="margin:24px 0;padding:20px;background:#f5f8ff;border:1px solid #cfdcf5;border-radius:8px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:${esc(accent)};">${esc(delivery.label || delivery.start || contact.deliveryAt || "Scheduled")}</div>
          ${contact.location ? `<div style="margin-top:8px;color:#555;">${esc(contact.location)}</div>` : ""}
        </div>
        <p>${esc(assistant)} has added this delivery to the scheduling calendar. If anything changes, a team member can update the appointment from the operations dashboard.</p>`);
    } else {
      const callNowBlock = callNowUrl ? `
        <div style="margin:30px 0;padding:24px;background:#f5f8ff;border:1px solid #cfdcf5;border-radius:8px;text-align:center;">
          <h3 style="margin:0 0 10px;color:${esc(accent)};">Want to talk now?</h3>
          <p style="margin:0 0 18px;line-height:1.5;">${esc(assistant)} is available 24/7. Click below and the AI assistant will call the phone number on your request right away.</p>
          <a href="${esc(callNowUrl)}" style="display:inline-block;background:${esc(accent)};color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:6px;">Have ${esc(assistant)} Call Me Now</a>
          <p style="margin:14px 0 0;font-size:12px;color:#666;">This link stays available in this email whenever you want to reconnect.</p>
        </div>` : "";
      subject = `${brand} - We've Received Your Request`;
      html = shell(env, "Thank you for contacting us", `
        <h2 style="margin-top:0;color:${esc(accent)};">Hi ${esc(contact.firstName || "")},</h2>
        <p>Thank you for contacting <strong>${esc(brand)}</strong>. We've received your request and ${esc(assistant)} is ready to help.</p>
        ${callNowBlock}
        <hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0;">
        <h3 style="color:${esc(accent)};">Your Request</h3>
        <table width="100%" cellpadding="8" cellspacing="0">
        <tr><td width="35%"><strong>Name</strong></td><td>${esc(contact.firstName || "")} ${esc(contact.lastName || "")}</td></tr>
        <tr><td><strong>Email</strong></td><td>${esc(contact.email || "")}</td></tr>
        <tr><td><strong>Phone</strong></td><td>${esc(contact.phone || "")}</td></tr>
        <tr><td><strong>Interested In</strong></td><td>${esc(lead.product_interest || lead.product_interestedIn || contact.interest || "")}</td></tr>
        <tr><td><strong>State / Area</strong></td><td>${esc(lead.preferred_store || contact.location || "")}</td></tr>
        <tr><td><strong>Preferred Contact</strong></td><td>${esc(lead.contact_method || contact.preferredContactMethod || "")}</td></tr>
        </table>`);
    }

    const response = await fetch(RESEND_URL, {
      method:"POST",
      headers:{ Authorization:`Bearer ${env.RESEND_API_KEY}`, "Content-Type":"application/json" },
      body:JSON.stringify({ from:env.FROM_EMAIL, to:[contact.email], subject, html }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      await emit(env, { type:"email.failed", contactId, messageType, provider:"resend", to:contact.email || "", subject, error:data?.message || data?.error || `Resend failed (${response.status})` });
      return Response.json({ ok:false, provider:"resend", status:response.status, error:data }, { status:500 });
    }

    await emit(env, { type:"email.sent", contactId, messageType, provider:"resend", messageId:data.id || "", to:contact.email || "", subject, productName, deliveryAt:delivery.start || contact.deliveryAt || "" });
    return Response.json({ ok:true, provider:"resend", messageId:data.id, messageType, callNowIncluded:Boolean(callNowUrl), signingLinkIncluded:Boolean(signingUrl), deliveryIncluded:messageType === "buddy-delivery-confirmed" });
  }
};
