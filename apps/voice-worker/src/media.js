import { createDeepgramTranscriber } from "./stt.js";
import { getAcePreliminaryEstimate, getBuddyDemoOptions, parseBuddyChoice } from "./catalog.js";
import { chooseDeliveryOption, describeDeliveryOptions, naturalDeliveryLabel } from "./delivery.js";
import { eilaRuntimeEnabled, streamEilaSpeech, streamEilaTurn } from "./eila-runtime.js";
import { openAiTwilioAudio } from "./openai-tts.js";
import { conversationOpening, meaningfulBargeIn } from "./conversation.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers:{"content-type":"application/json; charset=utf-8"} });
}
function base64ByteLength(value="") { const s=String(value); if(!s)return 0; const p=s.endsWith("==")?2:s.endsWith("=")?1:0; return Math.max(0,Math.floor(s.length*3/4)-p); }
function bytesToBase64(bytes){const v=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let s="";for(let i=0;i<v.length;i+=0x8000)s+=String.fromCharCode(...v.subarray(i,i+0x8000));return btoa(s);}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function normalizeUtterance(value=""){return String(value).toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();}
function naturalFirstName(value=""){const name=String(value||"").trim();return name?name.charAt(0).toUpperCase()+name.slice(1).toLowerCase():"";}
function greetingOnly(value=""){return /^(?:hello|hello there|hi|hi there|hey|hey there|good morning|good afternoon|good evening)$/.test(normalizeUtterance(value));}
function mentionsSigned(value=""){return /\b(signed|finished|done|submitted|sent it|completed)\b/i.test(String(value));}
function cleanRuntimeToken(value=""){return String(value||"").replace(/[^A-Za-z0-9_-]/g,"");}
function tenantContext(env,event={}){const payload=event.payload||{},contact=payload.contact||event.contact||{};return{tenantId:String(event.tenantId||payload.tenantId||env.TENANT_ID||"blackhole"),corporateId:String(event.corporateId||payload.corporateId||env.CORPORATE_ID||env.TENANT_ID||"blackhole"),locationId:String(event.locationId||payload.locationId||contact.locationId||contact.location_id||env.DEFAULT_LOCATION_ID||"corporate")};}

async function emitEvent(env,event){
  const tenant=tenantContext(env,event),tagged={...event,...tenant,ts:Date.now()};
  try{if(env.EVENTS)await env.EVENTS.send(tagged);}catch(e){console.error("media queue event failed",e);}
  try{if(env.ANALYTICS)env.ANALYTICS.writeDataPoint({blobs:[event.type||"stream.event",event.contactId||"",event.callSid||"",event.streamSid||"",tenant.tenantId,tenant.corporateId,tenant.locationId],doubles:[Date.now(),Number(event.mediaBytes||0),Number(event.mediaChunks||0)],indexes:[tenant.tenantId]});}catch(e){console.error("media analytics event failed",e);}
}
async function runtimeJson(env,path,body){
  const base=String(env.BUDDY_RUNTIME_URL||"").trim().replace(/\/$/,""); const token=cleanRuntimeToken(env.BUDDY_RUNTIME_TOKEN);
  if(!base)throw new Error("BUDDY_RUNTIME_URL is not configured"); if(!token)throw new Error("BUDDY_RUNTIME_TOKEN is not configured");
  const r=await fetch(`${base}${path}`,{method:"POST",headers:{"content-type":"application/json","x-runtime-token":token},body:JSON.stringify(body)});
  const t=await r.text();let d={};try{d=t?JSON.parse(t):{};}catch{d={raw:t};}if(!r.ok)throw new Error(d?.detail||d?.error||`Buddy runtime ${path} failed (${r.status})`);return d;
}
function recentConversation(state){
  return (state.conversationHistory||[]).slice(-16).map(turn=>`${turn.role==="assistant"?"ALLEY":"PROSPECT"}: ${turn.content}`).join("\n");
}
function availableProducts(options=[]){
  return options.length?options.map((option,index)=>`Option ${index+1}: ${option.name}. ${option.short}.`).join("\n"):"No fixed demo products are loaded for this inquiry.";
}
function requestsSalesFollowup(value=""){return /\b(sales|human|person|representative|transfer|callback|call back|appointment|schedule|proposal|quote|estimate)\b/i.test(String(value));}
function requestsHumanHandoff(value=""){return /\b(sales(?:person| team)?|human|representative|transfer|callback|call back|have (?:someone|the team) call|talk to (?:someone|a person))\b/i.test(String(value));}
function requestsSalesAppointment(value=""){return /\b(?:appointment|meeting|consultation)\b|\b(?:schedule|book|set up|arrange)\b.{0,35}\b(?:call|time|sales|meeting|appointment)\b/i.test(String(value));}
function requestsEstimateDelivery(value=""){return /\b(?:email|send|prepare|create|get|receive)\b.{0,40}\b(?:estimate|quote|proposal)\b|\b(?:estimate|quote|proposal)\b.{0,40}\b(?:email|send|prepare|create|get|receive)\b/i.test(String(value));}
function confirmsEstimateDelivery(value=""){return /\b(?:send|email)(?: it| that| the estimate| the quote)?(?: now| please)?\b|\byou can send it\b|^(?:yes|yes please|sure|okay|ok|go ahead|do it|please do)[.! ]*$/i.test(String(value).trim());}
function offersEstimate(value=""){return /\b(?:email|send|prepare|put together|create)\b.{0,50}\b(?:estimate|quote|proposal)\b|\b(?:estimate|quote|proposal)\b.{0,50}\b(?:email|send|prepare|put together|create)\b/i.test(String(value));}
function estimateRequirements(state,current=""){const turns=(state.conversationHistory||[]).filter(turn=>turn.role==="user").map(turn=>String(turn.content||"").trim()).filter(Boolean);if(current)turns.push(String(current).trim());return [...new Set(turns)].join(" ");}
function runtimeSalesPrompt(state,transcript,options=[],preface=""){
  return `SYSTEM: You are Alley, a warm, highly natural sales consultant for ACE Host speaking on a live phone call. Sound like a capable human account executive, never like a phone menu.

ACE Host operates facilities in Tampa, Florida and Raleigh, North Carolina.
Lead first name: ${state.firstName||"unknown"}
Requested service: ${state.interest||"general infrastructure"}
Requested location: ${state.location||"not specified"}
Selected product: ${state.selectedProduct?.name||"none"}

CURRENT DEMO PRODUCTS:
${availableProducts(options)}

CALL STAGE: ${state.isFollowup?"Follow-up conversation with prior context already loaded.":state.openingResponseHandled?`Active consultative sales conversation; ${state.discoveryTurns} customer response(s) completed.`:"The prospect is responding to Alley’s opening for the first time."}
PRIOR REQUIREMENTS SUMMARY: ${state.priorRequirementsSummary||"none"}
PRIOR ESTIMATE: ${state.estimateNumber||"none sent"}
CALL TRIGGER: ${state.triggerType||"new lead"}

RECENT CONVERSATION:
${recentConversation(state)||"Alley has just opened the call."}

PROSPECT JUST SAID:
${String(transcript||"")}

${preface?`Alley has already spoken this brief acknowledgement: "${preface}" Begin directly with the useful response and do not repeat or paraphrase that acknowledgement.`:""}

Never greet the prospect again or reintroduce Alley or ACE Host—the opening has already done that. Speak like a relaxed, curious account executive, not a script. Follow the prospect's lead. Answer ordinary small talk, side questions, and light rapport directly before making a natural transition back to business; general Tampa, Raleigh, baseball, or local conversation is welcome, but never invent live weather, scores, news, or statistics. If asked about something current that is not in the context, say you do not have a live feed and keep the exchange natural.

Invite the prospect to explain what they are trying to accomplish in their own words. Reflect back the important parts so they know they were heard. Ask only one question at a time, and only when its answer will materially improve a recommendation or estimate. Do not run a checklist, repeat a question, or force the conversation back to requirements when the prospect is still engaging naturally. Use the prior conversation and requirements summary on follow-up calls instead of making the prospect start over.

When enough is known, recommend the closest fit and briefly explain why. Then give the prospect a natural choice: continue working through it with Alley now, have Alley prepare and email a preliminary estimate, or have the sales team follow up with the captured notes. They can also call Alley back any time by replying CALL to the text or using the call link in the email. Approved demo pricing is: quarter rack $399 per month, half rack $799 per month, full rack $1,499 per month, with the standard $199 one-time setup fee waived for AI Concierge customers. Explain that an estimate is preliminary and subject to technical review. Do not mention numbered options. Do not claim an estimate, message, handoff, or appointment was sent or created; the application confirms those actions separately. In data-center language, “three 4U servers” means three servers that are each four rack units tall.

Most replies should be one to three short, natural sentences and under 60 words. A brief rapport exchange may be shorter. Return only the exact words Alley should say.`;
}
async function runtimeSalesReply(env,state,transcript,options=[]){
  const prompt=runtimeSalesPrompt(state,transcript,options);
  const runtimeStartedAt=Date.now();
  const chat=await runtimeJson(env,"/chat",{text:prompt,firstName:state.firstName,interest:state.interest,location:state.location});
  console.log("Alley runtime response generated",{callSid:state.callSid,contactId:state.contactId,latencyMs:Date.now()-runtimeStartedAt});
  const reply=String(chat.response||"").trim();
  if(!reply)throw new Error("Buddy runtime returned an empty sales response");
  return reply;
}

async function runtimeTwilioAudio(env,text){
  if(String(env.OPENAI_API_KEY||"").trim()){
    try{
      const ttsStartedAt=Date.now();
      const premium=await openAiTwilioAudio(env,text);
      console.log("Buddy premium TTS generated",{provider:premium.provider,model:premium.model,voice:premium.voice,audioBytes:premium.audio.length,latencyMs:Date.now()-ttsStartedAt});
      return premium.audio;
    }catch(error){
      console.error("Premium OpenAI TTS failed; falling back to GPU Kokoro",error?.message||String(error));
    }
  }
  const base=String(env.BUDDY_RUNTIME_URL||"").trim().replace(/\/$/,""); const token=cleanRuntimeToken(env.BUDDY_RUNTIME_TOKEN);
  if(!base||!token)throw new Error("Buddy runtime is not configured");
  const r=await fetch(`${base}/tts/twilio`,{method:"POST",headers:{"content-type":"application/json","x-runtime-token":token},body:JSON.stringify({text})});
  if(!r.ok)throw new Error(`Buddy runtime TTS failed (${r.status}): ${(await r.text()).slice(0,240)}`);return new Uint8Array(await r.arrayBuffer());
}
async function conciergeRequest(env,path,payload){
  const secret=String(env.INTERNAL_CALL_SECRET||""); if(!secret)throw new Error("INTERNAL_CALL_SECRET is not configured for concierge handoff");
  const req=new Request(`https://concierge.internal${path}`,{method:"POST",headers:{"content-type":"application/json","x-internal-call-secret":secret},body:JSON.stringify(payload)});
  const publicBase=String(env.CONCIERGE_PUBLIC_URL||"https://ace-concierge-worker.cryptocapitalgroupfl.workers.dev").replace(/\/$/,"");
  const r=env.CONCIERGE?await env.CONCIERGE.fetch(req):await fetch(`${publicBase}${path}`,{method:"POST",headers:{"content-type":"application/json","x-internal-call-secret":secret},body:JSON.stringify(payload)});
  const t=await r.text();let d={};try{d=t?JSON.parse(t):{};}catch{d={raw:t};}if(!r.ok||d?.ok===false){console.error("Concierge handoff rejected",{path,status:r.status,body:d,via:env.CONCIERGE?"service-binding":"public-fetch"});throw new Error(d?.error||`Concierge request failed (${r.status})`);}return d;
}
const notifyProductSelection=(env,p)=>conciergeRequest(env,"/internal/product-selected",p);
const sendPreliminaryEstimate=(env,p)=>conciergeRequest(env,"/internal/preliminary-estimate",p);
const createSalesHandoff=(env,p)=>conciergeRequest(env,"/internal/sales-handoff",p);
const createSalesAppointment=(env,p)=>conciergeRequest(env,"/internal/sales-appointment",p);
const getDeliveryOptions=(env,id)=>conciergeRequest(env,"/internal/delivery-options",{contactId:id});
const scheduleDelivery=(env,id,o)=>conciergeRequest(env,"/internal/delivery-schedule",{contactId:id,startIso:o.startIso,endIso:o.endIso,timeZone:o.timeZone});
async function getContactStatus(env,id){if(!id)return null;try{return await conciergeRequest(env,"/internal/contact-status",{contactId:id});}catch(e){console.error("Buddy contact status lookup failed",{contactId:id,error:e?.message||String(e)});return null;}}
async function completeTwilioCall(env,callSid){const a=String(env.TWILIO_ACCOUNT_SID||""),t=String(env.TWILIO_AUTH_TOKEN||"");if(!a||!t||!callSid)return;await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(a)}/Calls/${encodeURIComponent(callSid)}.json`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${a}:${t}`)}`,"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({Status:"completed"}).toString()}).catch(()=>{});}

export function handleTwilioMediaSocket(request,env,ctx){
  if((request.headers.get("Upgrade")||"").toLowerCase()!=="websocket")return json({ok:false,error:"Expected Upgrade: websocket"},426);
  const pair=new WebSocketPair(); const [client,server]=Object.values(pair); server.accept();
  const brand=String(env.BRAND_NAME||"ACE Host");
  const state={
    connectedAt:Date.now(),streamSid:"",callSid:"",accountSid:"",contactId:"",firstName:"",lastName:"",phone:"",email:"",interest:"",location:"",comments:"",leadScore:"",preferredContactTime:"",tenantId:String(env.TENANT_ID||"blackhole"),corporateId:String(env.CORPORATE_ID||env.TENANT_ID||"blackhole"),locationId:String(env.DEFAULT_LOCATION_ID||"corporate"),
    mediaChunks:0,mediaBytes:0,lastTimestamp:"",lastSequenceNumber:"",transcriptCount:0,stt:null,utteranceParts:[],turnGeneration:0,responseCount:0,
    selectedProduct:null,documentStatus:"Not sent",signatureAcknowledged:false,deliveryOptions:[],awaitingDeliveryChoice:false,deliveryScheduled:false,
    optionsOffered:false,awaitingProductChoice:false,lastUtterance:"",lastUtteranceAt:0,lastClarifyAt:0,lastPendingDocPromptAt:0,
    conversationHistory:[],discoveryTurns:0,openingSent:false,openingStartedAt:0,openingAudioStarted:false,openingPlaybackComplete:false,openingMarkName:"",activeMarkName:"",playbackActive:false,openingResponseHandled:false,quoteRequested:false,quoteSent:false,estimateNumber:"",finalFlushTimer:null,lastPreface:"",
    triggerType:"",priorRequirementsSummary:"",priorSelectedProduct:"",isFollowup:false,contextLoaded:false,pendingBargeIn:false,
  };
  const pushEvent=(e)=>{const p=emitEvent(env,{tenantId:state.tenantId,corporateId:state.corporateId,locationId:state.locationId,...e});if(ctx?.waitUntil)ctx.waitUntil(p);else p.catch(()=>{});};
  const sendTwilioClear=()=>{state.playbackActive=false;state.activeMarkName="";if(state.streamSid)try{server.send(JSON.stringify({event:"clear",streamSid:state.streamSid}));}catch{}};
  function sendTwilioAudioBase64(payload){if(!state.streamSid||!payload)return;state.playbackActive=true;server.send(JSON.stringify({event:"media",streamSid:state.streamSid,media:{payload}}));}
  function sendTwilioMark(markName){if(!state.streamSid||!markName)return;state.activeMarkName=markName;server.send(JSON.stringify({event:"mark",streamSid:state.streamSid,mark:{name:markName}}));}
  function sendTwilioAudio(audioBytes,markName){if(!state.streamSid||!audioBytes?.length)return;sendTwilioAudioBase64(bytesToBase64(audioBytes));sendTwilioMark(markName);}
  async function speak(text,generation,eventType="buddy.turn.completed"){
    const openingEvent=eventType==="buddy.sales.opening"||eventType==="buddy.sales.followup-opening";
    if(eilaRuntimeEnabled(env)){
      try{
        const phrases=openingEvent?(String(text).match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[String(text)]).map(part=>part.trim()).filter(Boolean):[String(text)];
        let audioBytes=0,audioChunks=0,firstAudioMs=null,totalLatencyMs=0;
        for(const phrase of phrases){
          const streamed=await streamEilaSpeech(env,phrase,{onAudio:(payload)=>{if(generation!==state.turnGeneration)return false;if(openingEvent)state.openingAudioStarted=true;sendTwilioAudioBase64(payload);return true;}});
          if(streamed.cancelled||generation!==state.turnGeneration)return;
          audioBytes+=streamed.audioBytes;audioChunks+=streamed.audioChunks;totalLatencyMs+=streamed.totalLatencyMs;
          if(firstAudioMs===null)firstAudioMs=streamed.firstAudioMs;
        }
        state.responseCount+=1;const markName=`eila-${state.responseCount}-${Date.now()}`;if(openingEvent)state.openingMarkName=markName;sendTwilioMark(markName);
        console.log("EILA streamed voice response sent",{callSid:state.callSid,contactId:state.contactId,responseText:text,audioBytes,audioChunks,firstAudioMs,totalLatencyMs,eventType});
        pushEvent({type:eventType,callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,response:text,audioBytes,firstAudioMs,totalLatencyMs,runtime:"eila-voice-runtime"});
        return;
      }catch(error){
        console.error("EILA speech stream failed",{callSid:state.callSid,contactId:state.contactId,error:error?.message||String(error),partialAudio:Boolean(error?.partialAudio)});
        if(error?.partialAudio)throw error;
      }
    }
    const audio=await runtimeTwilioAudio(env,text); if(generation!==state.turnGeneration)return;
    state.responseCount+=1; const markName=`buddy-${state.responseCount}-${Date.now()}`; if(openingEvent)state.openingMarkName=markName; sendTwilioAudio(audio,markName);
    console.log("Alley voice response sent",{callSid:state.callSid,contactId:state.contactId,responseText:text,audioBytes:audio.length,eventType});
    pushEvent({type:eventType,callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,response:text,audioBytes:audio.length});
  }
  function fastSalesPreface(transcript=""){
    const clean=normalizeUtterance(transcript);
    let preface="";
    if(/\bhow (?:are|re) you\b/.test(clean))preface="I'm doing great, thank you.";
    else if(!state.openingResponseHandled&&/\b(good|great|well|fine|okay|ok)\b/.test(clean))preface="Glad to hear it.";
    else if(requestsEstimateDelivery(clean)||requestsHumanHandoff(clean))preface="Absolutely.";
    else if(/\b(?:need|looking for|trying to|want|require|server|rack|hosting|power|bandwidth)\b/.test(clean))preface="Got it.";
    if(preface&&preface===state.lastPreface)preface="";
    state.lastPreface=preface;
    return preface;
  }
  async function speakSalesTurn(transcript,options,generation,eventType){
    if(eilaRuntimeEnabled(env)){
      try{
        const preface=fastSalesPreface(transcript);
        const streamed=await streamEilaTurn(env,{prompt:runtimeSalesPrompt(state,transcript,options,preface),preface,sessionId:state.callSid,tenantId:state.tenantId,assistantName:String(env.ASSISTANT_NAME||"Alley"),metadata:{contactId:state.contactId,interest:state.interest,location:state.location,locationId:state.locationId}},{onAudio:(payload)=>{if(generation!==state.turnGeneration)return false;sendTwilioAudioBase64(payload);return true;}});
        if(streamed.cancelled||generation!==state.turnGeneration)return "";
        if(!streamed.text)throw new Error("EILA runtime returned an empty sales response");
        state.responseCount+=1;sendTwilioMark(`eila-${state.responseCount}-${Date.now()}`);
        const responseText=`${preface} ${streamed.text}`.trim();
        console.log("EILA streamed sales turn sent",{callSid:state.callSid,contactId:state.contactId,responseText,audioBytes:streamed.audioBytes,audioChunks:streamed.audioChunks,firstAudioMs:streamed.firstAudioMs,totalLatencyMs:streamed.totalLatencyMs,eventType,preface});
        pushEvent({type:eventType,callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,response:responseText,audioBytes:streamed.audioBytes,firstAudioMs:streamed.firstAudioMs,totalLatencyMs:streamed.totalLatencyMs,runtime:"eila-voice-runtime",preface});
        return responseText;
      }catch(error){
        console.error("EILA sales stream failed",{callSid:state.callSid,contactId:state.contactId,error:error?.message||String(error),partialAudio:Boolean(error?.partialAudio)});
        if(error?.partialAudio)throw error;
      }
    }
    const responseText=await runtimeSalesReply(env,state,transcript,options);
    if(generation!==state.turnGeneration)return "";
    await speak(responseText,generation,eventType);
    return responseText;
  }
  function offerText(options){
    const assistant=String(env.ASSISTANT_NAME||"AI Concierge"),brand=String(env.BRAND_NAME||"Black Hole Capital");
    if(!options.length)return `Hi, this is ${assistant} with ${brand}. I don't have demo choices available for that category right now.`;
    const one=options[0]?.name||"option one",two=options[1]?.name||"option two";
    const hello=state.firstName?`Hi ${state.firstName}, this is ${assistant}, your AI solutions assistant with ${brand}.`:`Hi, this is ${assistant}, your AI solutions assistant with ${brand}.`;
    return `${hello} I have two choices for ${state.interest||"your request"}: option one, ${one}, or option two, ${two}. Which one works for you?`;
  }
  function openingText(){
    return conversationOpening(state,{assistant:String(env.ASSISTANT_NAME||"Alley"),brand});
  }
  function duplicateUtterance(clean){
    const n=normalizeUtterance(clean),now=Date.now(); if(!n)return true;
    const dup=n===state.lastUtterance && now-state.lastUtteranceAt<2500; state.lastUtterance=n; state.lastUtteranceAt=now; return dup;
  }
  function rememberSalesTurn(clean,responseText){
    state.conversationHistory.push({role:"user",content:clean},{role:"assistant",content:responseText});
    state.openingResponseHandled=true;
    if(offersEstimate(responseText))state.quoteRequested=true;
  }
  function handoffPayload(requirements,reason){return{contactId:state.contactId,firstName:state.firstName,lastName:state.lastName,phone:state.phone,email:state.email,interest:state.interest,location:state.location,comments:state.comments,leadScore:state.leadScore,preferredContactTime:state.preferredContactTime,requirements,reason,callSid:state.callSid,source:"ace-voice-worker"};}

  function processUtterance(transcript){
    const clean=String(transcript||"").trim(); if(!clean||!state.streamSid||duplicateUtterance(clean))return;
    if(state.openingSent&&!state.openingAudioStarted&&!state.openingPlaybackComplete){console.log("Deferred transcript while Alley opening loads",{callSid:state.callSid,contactId:state.contactId,transcript:clean});pushEvent({type:"buddy.sales.pre-opening-transcript-deferred",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,transcript:clean});return;}
    if(state.openingSent&&!state.openingPlaybackComplete&&greetingOnly(clean)&&Date.now()-state.openingStartedAt<20000){console.log("Suppressed greeting captured during Alley opening",{callSid:state.callSid,contactId:state.contactId,transcript:clean});pushEvent({type:"buddy.sales.opening-overlap-suppressed",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,transcript:clean});return;}
    if(state.openingSent&&!state.openingPlaybackComplete){state.openingPlaybackComplete=true;sendTwilioClear();}
    const generation=++state.turnGeneration; const startedAt=Date.now();
    const work=(async()=>{
      try{
        pushEvent({type:"buddy.turn.started",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,transcript:clean});
        const options=getBuddyDemoOptions(state.interest);
        const estimateIntent=requestsEstimateDelivery(clean)||(state.quoteRequested&&confirmsEstimateDelivery(clean));
        if(estimateIntent){
          state.quoteRequested=true;
          await speak("Absolutely. I'll put that estimate together now.",generation,"buddy.estimate.preparing");
          if(generation!==state.turnGeneration)return;
          const requirements=estimateRequirements(state,clean);
          const quote=getAcePreliminaryEstimate({interest:state.interest,location:state.location,conversation:requirements});
          if(state.quoteSent){
            await speak(`Your ACE Host estimate ${state.estimateNumber||""} has already been emailed to ${state.email||"the address on your request"}.`,generation,"buddy.estimate.already-sent");
            return;
          }
          if(!quote){
            try{await createSalesHandoff(env,handoffPayload(requirements,"Configuration requires technical pricing review"));await speak("I don’t have an approved price for that exact configuration, so I created a sales-team handoff with your requirements for a tailored estimate.",generation,"buddy.estimate.needs-review");}
            catch(error){console.error("ACE sales handoff failed",{callSid:state.callSid,contactId:state.contactId,error:error?.message||String(error)});await speak("I don’t have an approved price for that configuration, and I couldn’t confirm a sales handoff. Your conversation is still attached to this lead for review.",generation,"buddy.estimate.needs-review");}
            pushEvent({type:"buddy.estimate.needs-review",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,requirements,message:"Configuration requires technical pricing review"});
            return;
          }
          try{
            const result=await sendPreliminaryEstimate(env,{contactId:state.contactId,firstName:state.firstName,lastName:state.lastName,phone:state.phone,email:state.email,interest:state.interest,location:state.location,comments:state.comments,leadScore:state.leadScore,preferredContactTime:state.preferredContactTime,quote,requirements});
            state.quoteSent=result?.email?.ok===true;
            state.estimateNumber=String(result?.quote?.estimateNumber||"");
            if(!state.quoteSent)throw new Error(result?.email?.error||"Resend did not confirm estimate delivery");
            state.conversationHistory.push({role:"user",content:clean},{role:"assistant",content:`Estimate ${state.estimateNumber} emailed successfully.`});
            await speak(`Done—I emailed ACE Host estimate ${state.estimateNumber} for ${quote.serviceName} in ${quote.facilityName} at ${new Intl.NumberFormat("en-US",{style:"currency",currency:quote.currency||"USD",maximumFractionDigits:0}).format(quote.monthlyTotal)} per month. If you'd like to pick this back up later, reply CALL to the text or use the call link in your email and I'll have our conversation here.`,generation,"buddy.estimate.sent");
          }catch(error){
            console.error("ACE estimate delivery failed",{callSid:state.callSid,contactId:state.contactId,error:error?.message||String(error)});
            pushEvent({type:"buddy.estimate.failed",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,error:error?.message||String(error)});
            try{await createSalesHandoff(env,handoffPayload(requirements,`Estimate delivery failed: ${error?.message||"unknown error"}`));await speak("I couldn’t confirm the email, so I created a sales-team handoff with your requirements instead of telling you it was sent.",generation,"buddy.estimate.failed");}
            catch(handoffError){console.error("ACE fallback handoff failed",{callSid:state.callSid,contactId:state.contactId,error:handoffError?.message||String(handoffError)});await speak("I couldn’t confirm the estimate email or the sales handoff. Your conversation is still attached to this lead for review.",generation,"buddy.estimate.failed");}
          }
          return;
        }

        if(requestsSalesAppointment(clean)){
          const requirements=estimateRequirements(state,clean);
          try{
            await createSalesAppointment(env,{...handoffPayload(requirements,"Customer requested a sales appointment"),action:"request",notes:requirements,timeZone:"America/New_York"});
            await speak("Absolutely. I logged a sales appointment request with everything we discussed. The team can approve a time or suggest another one, and you'll receive the confirmation by text or email.",generation,"buddy.sales.appointment-requested");
          }catch(error){
            console.error("ACE sales appointment request failed",{callSid:state.callSid,contactId:state.contactId,error:error?.message||String(error)});
            await speak("I couldn't confirm the appointment request, so I won't pretend it was booked. Your conversation is still attached to this lead for the sales team to review.",generation,"buddy.sales.appointment-failed");
          }
          return;
        }

        if(requestsHumanHandoff(clean)){
          const requirements=estimateRequirements(state,clean);
          try{await createSalesHandoff(env,handoffPayload(requirements,"Customer requested sales follow-up"));await speak("Absolutely. I created a handoff for the ACE Host sales team with what we discussed, so they can follow up without making you repeat everything.",generation,"buddy.sales.handoff-created");}
          catch(error){console.error("ACE requested sales handoff failed",{callSid:state.callSid,contactId:state.contactId,error:error?.message||String(error)});await speak("I couldn’t confirm the sales handoff, so I won’t pretend it was sent. Your conversation is still attached to this lead for review.",generation,"buddy.sales.handoff-failed");}
          return;
        }

        if(!state.selectedProduct && options.length){
          const choiceIndex=parseBuddyChoice(clean);
          if(choiceIndex>=0&&options[choiceIndex]){
            const selected=options[choiceIndex]; state.selectedProduct=selected; state.awaitingProductChoice=false;
            const payload={type:"buddy.product.selected",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,firstName:state.firstName,lastName:state.lastName,phone:state.phone,email:state.email,category:state.interest,interest:state.interest,location:state.location,comments:state.comments,leadScore:state.leadScore,preferredContactTime:state.preferredContactTime,selectionNumber:choiceIndex+1,productId:selected.id,productName:selected.name};
            pushEvent(payload);
            await speak(`Great choice${state.firstName?`, ${state.firstName}`:""}. I've got you down for ${selected.name}. I'm preparing your ACE Host service proposal now.`,generation,"buddy.product.selection-preparing");
            try{
              const result=await notifyProductSelection(env,payload); state.documentStatus="Sent";
              const smsOk=result?.sms?.ok===true,emailOk=result?.email?.ok===true;
              console.log("Buddy product selection handed to concierge",{contactId:state.contactId,productName:selected.name,envelopeId:result?.docusign?.envelopeId||"",smsOk,emailOk});
              if(generation!==state.turnGeneration)return;
              const sent=smsOk&&emailOk?"I sent the service proposal to your phone and email.":emailOk?"I sent the service proposal to your email.":smsOk?"I sent the service proposal to your phone.":"I created your service proposal, but the notification did not go through.";
              await speak(`${sent} Sign it, then wait for the confirmation text that says we received your documents before coming back to the call. It usually takes about 30 seconds.`,generation,"buddy.product.selection-sent");
            }catch(error){console.error("Buddy product selection handoff failed",{contactId:state.contactId,productName:selected.name,error:error?.message||String(error)});if(generation===state.turnGeneration){const requirements=estimateRequirements(state,clean);try{await createSalesHandoff(env,handoffPayload(requirements,`Proposal workflow failed for ${selected.name}`));await speak(`I saved ${selected.name} as the best current fit and created a sales-team handoff with your requirements.`,generation,"buddy.product.selection-followup");}catch{await speak(`I saved ${selected.name} as the best current fit, but I couldn't confirm the proposal or sales handoff. Your call remains attached to the lead for review.`,generation,"buddy.product.selection-followup");}}}
            return;
          }

          state.discoveryTurns+=1;
          const followup=requestsSalesFollowup(clean);
          const responseText=await speakSalesTurn(clean,options,generation,followup?"buddy.sales.followup-acknowledged":"buddy.sales.discovery-response");
          if(generation!==state.turnGeneration)return;
          if(!responseText)return;
          rememberSalesTurn(clean,responseText);
          state.optionsOffered=state.optionsOffered||/\boption (?:one|two|1|2)\b/i.test(responseText);
          state.awaitingProductChoice=state.optionsOffered;
          pushEvent({type:followup?"buddy.sales.followup-requested":"buddy.sales.discovery",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,transcript:clean,response:responseText,interest:state.interest,discoveryTurns:state.discoveryTurns,followupRequested:followup});
          return;
        }

        if(state.selectedProduct&&state.contactId){
          const status=await getContactStatus(env,state.contactId); if(status?.documentStatus)state.documentStatus=status.documentStatus;if(status?.deliveryAt)state.deliveryScheduled=true;
          if(state.deliveryScheduled){await speak(`You're all set${state.firstName?`, ${state.firstName}`:""}. Your implementation appointment is already scheduled. Thanks for calling ${brand}. Have a great day.`,generation,"buddy.delivery.already-scheduled");if(ctx?.waitUntil)ctx.waitUntil((async()=>{await sleep(12000);await completeTwilioCall(env,state.callSid);})());return;}

          if(String(state.documentStatus).toLowerCase()!=="signed"){
            if(mentionsSigned(clean)){
              const now=Date.now();if(now-state.lastPendingDocPromptAt>7000){state.lastPendingDocPromptAt=now;await speak("Thanks. I'm waiting for the agreement system to confirm it. Once that arrives, I can help with the next step.",generation,"buddy.docusign.awaiting-confirmation");}
              return;
            }
            state.discoveryTurns+=1;
            const followup=requestsSalesFollowup(clean);
            const responseText=await speakSalesTurn(clean,options,generation,followup?"buddy.sales.followup-acknowledged":"buddy.sales.discovery-response");
            if(generation!==state.turnGeneration)return;
            if(!responseText)return;
            rememberSalesTurn(clean,responseText);
            pushEvent({type:followup?"buddy.sales.followup-requested":"buddy.sales.discovery",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,transcript:clean,response:responseText,selectedProduct:state.selectedProduct?.name||"",discoveryTurns:state.discoveryTurns,followupRequested:followup});
            return;
          }

          if(!state.signatureAcknowledged){
            state.signatureAcknowledged=true;
            try{const delivery=await getDeliveryOptions(env,state.contactId);state.deliveryOptions=delivery?.options||[];state.awaitingDeliveryChoice=state.deliveryOptions.length>0;await speak(`Perfect${state.firstName?`, ${state.firstName}`:""}. I have your signed service agreement for ${state.selectedProduct.name}. Let's schedule your implementation consultation. ${describeDeliveryOptions(state.deliveryOptions)}`,generation,"buddy.docusign.signed-acknowledged");}
            catch(error){console.error("Buddy delivery options failed",{contactId:state.contactId,error:error?.message||String(error)});await speak(`Perfect${state.firstName?`, ${state.firstName}`:""}. I have your signed service agreement. I'm having trouble loading the implementation calendar right now.`,generation,"buddy.delivery.options-failed");}
            return;
          }

          if(state.awaitingDeliveryChoice&&state.deliveryOptions.length){
            const selectedDelivery=chooseDeliveryOption(clean,state.deliveryOptions);
            if(!selectedDelivery){const now=Date.now();if(now-state.lastClarifyAt>6000){state.lastClarifyAt=now;await speak(describeDeliveryOptions(state.deliveryOptions),generation,"buddy.delivery.choice-clarify");}return;}
            const spokenSelection=naturalDeliveryLabel(selectedDelivery);
            await speak(`Perfect. I'll put you down for ${spokenSelection}. Give me just a second while I add that to the calendar.`,generation,"buddy.delivery.scheduling");
            try{const result=await scheduleDelivery(env,state.contactId,selectedDelivery);state.deliveryScheduled=true;state.awaitingDeliveryChoice=false;const scheduledOption={...selectedDelivery,startIso:result?.delivery?.start||selectedDelivery.startIso,timeZone:result?.delivery?.timeZone||selectedDelivery.timeZone};const label=naturalDeliveryLabel(scheduledOption);console.log("Buddy delivery scheduled",{contactId:state.contactId,calendarEventId:result?.delivery?.id||"",deliveryAt:result?.delivery?.start||selectedDelivery.startIso,smsOk:result?.sms?.ok??null,emailOk:result?.email?.ok??null});await speak(`You're confirmed for ${label}. I sent your implementation confirmation by text and email. Thanks for calling ${brand}. Have a great day.`,generation,"buddy.delivery.confirmed");if(ctx?.waitUntil)ctx.waitUntil((async()=>{await sleep(14000);await completeTwilioCall(env,state.callSid);})());}
            catch(error){console.error("Buddy delivery scheduling failed",{contactId:state.contactId,error:error?.message||String(error)});try{const refreshed=await getDeliveryOptions(env,state.contactId);state.deliveryOptions=refreshed?.options||[];}catch{}await speak(`That time just got taken. ${describeDeliveryOptions(state.deliveryOptions)}`,generation,"buddy.delivery.conflict");}
            return;
          }
        }

        const followup=requestsSalesFollowup(clean);
        const responseText=await speakSalesTurn(clean,options,generation,followup?"buddy.sales.followup-acknowledged":"buddy.voice.response");
        if(generation!==state.turnGeneration)return;
        if(!responseText)return;
        rememberSalesTurn(clean,responseText);
        pushEvent({type:followup?"buddy.sales.followup-requested":"buddy.turn.completed",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,transcript:clean,response:responseText,latencyMs:Date.now()-startedAt,followupRequested:followup});
      }catch(error){console.error("Buddy turn failed",{callSid:state.callSid,contactId:state.contactId,error:error?.message||String(error)});pushEvent({type:"buddy.turn.failed",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,error:error?.message||String(error)});}
    })(); if(ctx?.waitUntil)ctx.waitUntil(work);else work.catch(()=>{});
  }

  function clearFinalFlush(){if(state.finalFlushTimer!==null){clearTimeout(state.finalFlushTimer);state.finalFlushTimer=null;}}
  function flushUtterance(reason="unknown"){clearFinalFlush();if(!state.utteranceParts.length)return;const t=state.utteranceParts.join(" ").replace(/\s+/g," ").trim();state.utteranceParts=[];console.log("Flushing caller utterance",{callSid:state.callSid,contactId:state.contactId,reason,transcript:t});processUtterance(t);}
  function scheduleFinalFlush(transcript=""){
    clearFinalFlush();
    const terminal=/[.!?][\"')\]]?$/.test(String(transcript).trim());
    const configured=Number(terminal?env.DEEPGRAM_TERMINAL_GRACE_MS:env.DEEPGRAM_FINAL_GRACE_MS);
    const graceMs=Number.isFinite(configured)&&configured>=100?configured:(terminal?350:900);
    state.finalFlushTimer=setTimeout(()=>{state.finalFlushTimer=null;flushUtterance(terminal?"terminal-final-grace":"final-grace");},graceMs);
  }
  function startTranscription(){
    if(state.stt||!env.DEEPGRAM_API_KEY)return;
    state.stt=createDeepgramTranscriber(env,{
      onOpen:({model})=>{console.log("Deepgram STT connected",{callSid:state.callSid,contactId:state.contactId,model});pushEvent({type:"stt.connected",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,model});},
      onTranscript:({transcript,isFinal,speechFinal,confidence})=>{clearFinalFlush();if(isFinal)state.transcriptCount+=1;console.log("Deepgram transcript",{callSid:state.callSid,contactId:state.contactId,transcript,isFinal,speechFinal,confidence});if((state.playbackActive||state.pendingBargeIn)&&meaningfulBargeIn({transcript,confidence,isFinal},env)){state.pendingBargeIn=false;state.turnGeneration+=1;sendTwilioClear();pushEvent({type:"buddy.audio.interrupted",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,transcript,confidence,isFinal});}if(isFinal){state.utteranceParts.push(transcript);pushEvent({type:"stt.transcript.final",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,transcript,confidence,speechFinal});if(speechFinal)flushUtterance("speech-final");else scheduleFinalFlush(transcript);}},
      onSpeechStarted:()=>{state.pendingBargeIn=state.playbackActive;pushEvent({type:"stt.speech.started",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,pendingBargeIn:state.pendingBargeIn});},
      onUtteranceEnd:()=>{flushUtterance("utterance-end");pushEvent({type:"stt.utterance.end",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId});},
      onClose:({code,reason})=>{console.log("Deepgram STT closed",{callSid:state.callSid,code,reason});pushEvent({type:"stt.closed",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,closeCode:String(code||"")});},
      onError:()=>{console.error("Deepgram STT websocket error",{callSid:state.callSid});pushEvent({type:"stt.error",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId});},
    });
  }
  function stopTranscription(){clearFinalFlush();try{state.stt?.finalize();}catch{}try{state.stt?.close();}catch{}state.stt=null;}
  pushEvent({type:"stream.websocket.connected"});

  server.addEventListener("message",(event)=>{
    if(typeof event.data!=="string")return;let message;try{message=JSON.parse(event.data);}catch{return;}const type=String(message.event||"unknown");state.lastSequenceNumber=String(message.sequenceNumber||state.lastSequenceNumber||"");
    if(type==="connected"){console.log("Twilio media connected",{protocol:message.protocol||"",version:message.version||""});return;}
    if(type==="start"){
      const start=message.start||{},params=start.customParameters||{};state.streamSid=String(start.streamSid||message.streamSid||"");state.callSid=String(start.callSid||"");state.accountSid=String(start.accountSid||"");state.contactId=String(params.contactId||"");state.firstName=String(params.firstName||"");state.lastName=String(params.lastName||"");state.phone=String(params.phone||"");state.email=String(params.email||"");state.interest=String(params.interest||"");state.location=String(params.location||"");state.comments=String(params.comments||"");state.leadScore=String(params.leadScore||"");state.preferredContactTime=String(params.preferredContactTime||"");state.triggerType=String(params.triggerType||"");state.tenantId=String(params.tenantId||state.tenantId);state.corporateId=String(params.corporateId||state.corporateId);state.locationId=String(params.locationId||state.locationId);const f=start.mediaFormat||{};
      console.log("Twilio media stream started",{streamSid:state.streamSid,callSid:state.callSid,contactId:state.contactId,encoding:f.encoding||"",sampleRate:f.sampleRate||"",channels:f.channels||"",sttConfigured:Boolean(env.DEEPGRAM_API_KEY),buddyRuntimeConfigured:Boolean(env.BUDDY_RUNTIME_URL&&env.BUDDY_RUNTIME_TOKEN),premiumTtsConfigured:Boolean(env.OPENAI_API_KEY),demoChoices:getBuddyDemoOptions(state.interest).length});pushEvent({type:"stream.media.started",streamSid:state.streamSid,callSid:state.callSid,contactId:state.contactId,firstName:state.firstName,interest:state.interest,location:state.location,leadScore:state.leadScore,encoding:String(f.encoding||""),sampleRate:Number(f.sampleRate||0),channels:Number(f.channels||0)});startTranscription();
      if(!state.openingSent){state.openingSent=true;const beginOpening=(async()=>{const status=await getContactStatus(env,state.contactId);if(status){const prior=Array.isArray(status.recentConversation)?status.recentConversation:[];state.conversationHistory=prior.map(turn=>({role:turn.role==="assistant"?"assistant":"user",content:String(turn.content||"")})).filter(turn=>turn.content);state.priorRequirementsSummary=String(status.requirementsSummary||"");state.priorSelectedProduct=String(status.selectedProduct||"");state.estimateNumber=String(status.estimateNumber||"");state.quoteSent=Boolean(state.estimateNumber||String(status.estimateStatus||"").toLowerCase()==="sent");state.documentStatus=String(status.documentStatus||state.documentStatus);state.deliveryScheduled=Boolean(status.deliveryAt||String(status.deliveryStatus||"").toLowerCase()==="scheduled");if(state.priorSelectedProduct)state.selectedProduct=getBuddyDemoOptions(state.interest).find(option=>option.name===state.priorSelectedProduct)||{id:"persisted-selection",name:state.priorSelectedProduct};state.isFollowup=prior.length>0||Boolean(state.priorRequirementsSummary||state.estimateNumber||state.priorSelectedProduct);}state.contextLoaded=true;state.openingStartedAt=Date.now();const generation=++state.turnGeneration;const opening=openingText();state.conversationHistory.push({role:"assistant",content:opening});pushEvent({type:"buddy.conversation.context-loaded",callSid:state.callSid,streamSid:state.streamSid,contactId:state.contactId,isFollowup:state.isFollowup,priorTurns:Math.max(0,state.conversationHistory.length-1),estimateNumber:state.estimateNumber,triggerType:state.triggerType});await speak(opening,generation,state.isFollowup?"buddy.sales.followup-opening":"buddy.sales.opening");})();if(ctx?.waitUntil)ctx.waitUntil(beginOpening);else beginOpening.catch(error=>console.error("Alley opening failed",error));}
      return;
    }
    if(type==="media"){const media=message.media||{},payload=String(media.payload||"");state.mediaChunks+=1;state.mediaBytes+=base64ByteLength(payload);state.lastTimestamp=String(media.timestamp||state.lastTimestamp||"");if(payload&&state.stt)state.stt.sendBase64(payload);if(state.mediaChunks%250===0)console.log("Twilio media heartbeat",{streamSid:state.streamSid,callSid:state.callSid,contactId:state.contactId,mediaChunks:state.mediaChunks,mediaBytes:state.mediaBytes,timestamp:state.lastTimestamp,transcriptCount:state.transcriptCount,responseCount:state.responseCount});return;}
    if(type==="dtmf"){pushEvent({type:"stream.media.dtmf",streamSid:state.streamSid,callSid:state.callSid,contactId:state.contactId,digit:String(message.dtmf?.digit||"")});return;}
    if(type==="mark"){const markName=String(message.mark?.name||"");if(!state.activeMarkName||markName===state.activeMarkName){state.playbackActive=false;state.pendingBargeIn=false;state.activeMarkName="";}if(markName&&markName===state.openingMarkName)state.openingPlaybackComplete=true;pushEvent({type:"buddy.audio.mark",streamSid:state.streamSid,callSid:state.callSid,contactId:state.contactId,name:markName});return;}
    if(type==="stop"){const stop=message.stop||{};state.streamSid=state.streamSid||String(message.streamSid||"");state.callSid=state.callSid||String(stop.callSid||"");const durationMs=Date.now()-state.connectedAt;stopTranscription();console.log("Twilio media stream stopped",{streamSid:state.streamSid,callSid:state.callSid,contactId:state.contactId,mediaChunks:state.mediaChunks,mediaBytes:state.mediaBytes,transcriptCount:state.transcriptCount,responseCount:state.responseCount,selectedProduct:state.selectedProduct?.name||"",documentStatus:state.documentStatus,deliveryScheduled:state.deliveryScheduled,durationMs});pushEvent({type:"stream.media.stopped",streamSid:state.streamSid,callSid:state.callSid,contactId:state.contactId,mediaChunks:state.mediaChunks,mediaBytes:state.mediaBytes,transcriptCount:state.transcriptCount,responseCount:state.responseCount,selectedProduct:state.selectedProduct?.name||"",documentStatus:state.documentStatus,deliveryScheduled:state.deliveryScheduled,durationMs});return;}
  });
  server.addEventListener("close",(event)=>{state.turnGeneration+=1;stopTranscription();const durationMs=Date.now()-state.connectedAt;console.log("Twilio media websocket closed",{code:event.code,reason:event.reason,streamSid:state.streamSid,callSid:state.callSid,contactId:state.contactId,mediaChunks:state.mediaChunks,mediaBytes:state.mediaBytes,transcriptCount:state.transcriptCount,responseCount:state.responseCount,selectedProduct:state.selectedProduct?.name||"",documentStatus:state.documentStatus,deliveryScheduled:state.deliveryScheduled,durationMs});pushEvent({type:"stream.websocket.closed",streamSid:state.streamSid,callSid:state.callSid,contactId:state.contactId,closeCode:String(event.code||""),mediaChunks:state.mediaChunks,mediaBytes:state.mediaBytes,transcriptCount:state.transcriptCount,responseCount:state.responseCount,selectedProduct:state.selectedProduct?.name||"",documentStatus:state.documentStatus,deliveryScheduled:state.deliveryScheduled,durationMs});});
  server.addEventListener("error",()=>{state.turnGeneration+=1;stopTranscription();pushEvent({type:"stream.websocket.error",streamSid:state.streamSid,callSid:state.callSid,contactId:state.contactId});});
  return new Response(null,{status:101,webSocket:client});
}
