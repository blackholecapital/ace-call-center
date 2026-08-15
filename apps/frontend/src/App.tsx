import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Bot, Building2, CalendarDays, CheckCircle2, ChevronRight,
  CircleDollarSign, ExternalLink, FileSignature, FileText, Gauge,
  HardDrive, Headphones, LayoutDashboard, Mail, MessageSquare,
  Network, Phone, Search, Server, ShieldCheck, Sparkles, Users, Zap
} from "lucide-react";
import "./App.css";

type Stage = "New Inquiry" | "Qualified" | "Site Review" | "Proposal Sent" | "Contracting" | "Provisioning" | "Live Account";
type Lead = {
  id:string; firstName:string; lastName:string; company?:string; phone?:string; email?:string;
  interest?:string; selectedProduct?:string; location?:string; stage:Stage; score?:number; source?:string;
  callStatus?:string; outreachStatus?:string; documentStatus?:string; docusignEnvelopeId?:string; agreementId?:string; signingShortUrl?:string;
  deliveryAt?:string; deliveryEnd?:string; deliveryStatus?:string; calendarEventId?:string; calendarEventUrl?:string; value?:number;
};
type AceEvent = { id:number|string; contactId?:string; callSid?:string; type:string; role?:string; text?:string; createdAt:number; payload?:any };
type Conversation = { callSid?:string; contactId?:string; startedAt:number; endedAt:number; transcript:{role:string;text:string;at:number;type?:string}[]; events:AceEvent[] };
type Tab = "Pipeline" | "Leads" | "Contracts" | "Installations";
type View = "Operations" | "Accounts" | "Conversations" | "Analytics";
type LeadAction = "email" | "call" | "sms" | "document" | "calendar";

const stages:Stage[]=["New Inquiry","Qualified","Site Review","Proposal Sent","Contracting","Provisioning","Live Account"];
const products=["All ACE products","Dedicated Servers","Colocation Hosting","Full Rack Colocation","Crypto Mining Facility","Managed Services","VPS Hosting","Wireless Infrastructure","Telehealth Infrastructure","AI Automations"];
const DOC_BASE="https://ace-concierge-worker.cryptocapitalgroupfl.workers.dev/docusign/document";
const ACE_TZ="America/New_York";
const demoLeads:Lead[]=[
  {id:"ace-1",firstName:"Demo",lastName:"Lead 01",company:"Sample Colocation Prospect",selectedProduct:"Full Rack Colocation",location:"Tampa Bay",stage:"Qualified",score:92,source:"ACEHost.com",callStatus:"Connected",documentStatus:"Not sent",value:18000},
  {id:"ace-2",firstName:"Demo",lastName:"Lead 02",company:"Sample Mining Prospect",selectedProduct:"Crypto Mining Facility",location:"Central Florida",stage:"Site Review",score:88,source:"Referral",callStatus:"Completed",documentStatus:"Not sent",value:54000},
  {id:"ace-3",firstName:"Demo",lastName:"Lead 03",company:"Sample Telehealth Prospect",selectedProduct:"Telehealth Infrastructure",location:"Florida",stage:"Proposal Sent",score:84,source:"Inbound call",callStatus:"Completed",documentStatus:"Sent",value:24000},
  {id:"ace-4",firstName:"Demo",lastName:"Lead 04",company:"Sample Server Prospect",selectedProduct:"Dedicated Servers",location:"Southeast US",stage:"Contracting",score:96,source:"Partner",callStatus:"Completed",documentStatus:"Signed",value:11500},
  {id:"ace-5",firstName:"Demo",lastName:"Lead 05",company:"Sample AI Automation Prospect",selectedProduct:"AI Automations",location:"Tampa Bay",stage:"Provisioning",score:91,source:"Alley campaign",callStatus:"Completed",documentStatus:"Signed",deliveryAt:"2026-08-18T14:00:00-04:00",deliveryStatus:"Scheduled",value:12500},
  {id:"ace-6",firstName:"Demo",lastName:"Lead 06",company:"Sample Hosting Account",selectedProduct:"Colocation Hosting",location:"Central Florida",stage:"Live Account",score:98,source:"Existing client",callStatus:"Completed",documentStatus:"Completed",value:21600},
];

function zonedParts(value:any){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:ACE_TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
  const p:Record<string,string>={}; for(const part of parts) if(part.type!=="literal")p[part.type]=part.value;
  return {year:Number(p.year),month:Number(p.month),day:Number(p.day),hour:Number(p.hour),minute:Number(p.minute)};
}
function formatEtTime(iso?:string){return iso?new Intl.DateTimeFormat("en-US",{timeZone:ACE_TZ,hour:"numeric",minute:"2-digit"}).format(new Date(iso)):"";}
function formatEtDateTime(iso?:string){return iso?new Intl.DateTimeFormat("en-US",{timeZone:ACE_TZ,weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(iso)):"";}
function formatEtMonthDay(iso?:string){return iso?new Intl.DateTimeFormat("en-US",{timeZone:ACE_TZ,month:"short",day:"numeric"}).format(new Date(iso)):"";}
async function postJson(path:string,body:any){const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok||data?.ok===false)throw new Error(data?.error||`Request failed (${r.status})`);return data;}

function inferStage(d:any):Stage {
  const raw=String(d?.stage||d?.status||"");
  if(stages.includes(raw as Stage))return raw as Stage;
  if(raw==="Closed"||String(d?.deliveryStatus||"").toLowerCase()==="completed")return "Live Account";
  if(d?.deliveryAt||["scheduled","provisioning"].includes(String(d?.deliveryStatus||"").toLowerCase()))return "Provisioning";
  if(["signed","completed"].includes(String(d?.documentStatus||"").toLowerCase()))return "Contracting";
  if(d?.docusignEnvelopeId||String(d?.documentStatus||"").toLowerCase()==="sent"||raw==="Docs Sent")return "Proposal Sent";
  if(raw==="Engaged"||d?.selectedProduct)return "Site Review";
  const call=String(d?.callStatus||"").toLowerCase();
  if(call.includes("completed")||call.includes("answered")||call.includes("connected"))return "Qualified";
  if(raw==="Contacted"||d?.outreachStatus==="Sent"||call.includes("requested")||call.includes("ringing"))return "Qualified";
  return "New Inquiry";
}
function normalizeContact(raw:any,i:number):Lead {
  let d=raw?.data??raw;if(typeof d==="string"){try{d=JSON.parse(d);}catch{d=raw;}}
  return {
    id:String(d?.id||raw?.id||`lead-${i}`),firstName:d?.firstName||d?.first_name||d?.name?.split?.(" ")?.[0]||"Guest",
    lastName:d?.lastName||d?.last_name||d?.name?.split?.(" ")?.slice?.(1)?.join?.(" ")||"",company:d?.company||d?.organization||d?.businessName||"",
    phone:d?.phone||"",email:d?.email||"",interest:d?.interest||d?.product||d?.lookingFor||"Managed Services",selectedProduct:d?.selectedProduct||d?.selected_product||"",
    location:d?.location||d?.state||d?.area||"Unassigned",stage:inferStage(d),score:Number(d?.leadScore||d?.score||70),source:d?.source||"ACEHost.com",
    callStatus:d?.callStatus||d?.call_status||"Not called",outreachStatus:d?.outreachStatus||"",documentStatus:d?.documentStatus||d?.document_status||"Not sent",
    docusignEnvelopeId:d?.docusignEnvelopeId||d?.docusign_envelope_id||"",agreementId:d?.agreementId||d?.agreement_id||"",signingShortUrl:d?.signingShortUrl||"",
    deliveryAt:d?.deliveryAt||d?.delivery_at,deliveryEnd:d?.deliveryEnd||d?.delivery_end,
    deliveryStatus:d?.deliveryStatus||d?.delivery_status||(d?.deliveryAt?"Scheduled":"Not scheduled"),calendarEventId:d?.calendarEventId||d?.calendar_event_id||"",
    calendarEventUrl:d?.calendarEventUrl||d?.calendar_event_url||"",value:Number(d?.value||d?.amount||0),
  };
}

export default function App(){
  const [view,setView]=useState<View>("Operations"),[tab,setTab]=useState<Tab>("Pipeline"),[leads,setLeads]=useState<Lead[]>(demoLeads),[selected,setSelected]=useState<Lead>(demoLeads[0]),[live,setLive]=useState(false);
  const [conversations,setConversations]=useState<Conversation[]>([]),[events,setEvents]=useState<AceEvent[]>([]),[selectedCall,setSelectedCall]=useState<Conversation|null>(null);

  useEffect(()=>{const load=()=>fetch("/api/contacts").then(r=>r.ok?r.json():Promise.reject()).then(payload=>{const rows=Array.isArray(payload)?payload:payload?.contacts||payload?.rows||payload?.data||[];if(Array.isArray(rows)&&rows.length){const mapped=rows.map(normalizeContact);setLeads(mapped);setSelected(current=>mapped.find((l:Lead)=>l.id===current?.id)||mapped[0]);setLive(true);}}).catch(()=>setLive(false));load();const timer=window.setInterval(load,5000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{const load=()=>fetch("/api/buddy-events?limit=2000").then(r=>r.ok?r.json():Promise.reject()).then(p=>{const data=p?.data||{};setConversations(data.conversations||[]);setEvents(data.events||[]);setSelectedCall(current=>current?((data.conversations||[]).find((c:Conversation)=>c.callSid===current.callSid)||current):((data.conversations||[])[0]||null));}).catch(()=>{});load();const timer=window.setInterval(load,8000);return()=>clearInterval(timer);},[]);

  const metrics=useMemo(()=>{const liveAccounts=leads.filter(l=>l.stage==="Live Account").length,qualified=leads.filter(l=>l.stage!=="New Inquiry").length,contracting=leads.filter(l=>["Contracting","Provisioning","Live Account"].includes(l.stage)).length,pipeline=leads.reduce((sum,l)=>sum+(l.value||0),0);return{total:leads.length,qualified,contracting,liveAccounts,pipeline};},[leads]);
  const customerFor=(id?:string)=>leads.find(l=>l.id===id);

  async function act(lead:Lead,action:LeadAction){
    setSelected(lead);
    try{
      if(action==="email"){if(!lead.email)throw new Error("This prospect has no email address.");window.location.href=`mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent("ACE Host infrastructure consultation")}`;return;}
      if(action==="call"){if(!lead.phone)throw new Error("This prospect has no phone number.");await postJson("/api/calls",{contactId:lead.id});window.alert(`Alley is calling ${lead.firstName} now.`);return;}
      if(action==="sms"){if(!lead.phone)throw new Error("This prospect has no phone number.");const body=window.prompt(`Text ${lead.firstName}:`,"Hi, this is ACE Host. How can our infrastructure team help?");if(!body?.trim())return;await postJson("/api/inbox",{contactId:lead.id,channel:"sms",body:body.trim()});window.alert("SMS sent.");return;}
      if(action==="document"){if(lead.docusignEnvelopeId){window.open(`${DOC_BASE}/${encodeURIComponent(lead.id)}`,"_blank","noopener,noreferrer");return;}const service=window.prompt("Service for the ACE Host proposal:",lead.selectedProduct||lead.interest||"");if(!service?.trim())return;await postJson("/api/manual-agreement",{contactId:lead.id,productName:service.trim()});window.alert("ACE Host proposal sent by text and email.");return;}
      if(action==="calendar"){setView("Operations");setTab("Installations");}
    }catch(error:any){window.alert(error?.message||"That action failed.");}
  }

  return <div className="ace-app">
    <aside className="side-nav">
      <AceLogo/>
      <nav>
        <button onClick={()=>setView("Operations")} className={view==="Operations"?"nav-item active":"nav-item"}><LayoutDashboard size={19}/> Operations</button>
        <button onClick={()=>setView("Accounts")} className={view==="Accounts"?"nav-item active":"nav-item"}><Building2 size={19}/> Accounts</button>
        <button onClick={()=>setView("Conversations")} className={view==="Conversations"?"nav-item active":"nav-item"}><Headphones size={19}/> Conversations</button>
        <button onClick={()=>setView("Analytics")} className={view==="Analytics"?"nav-item active":"nav-item"}><BarChart3 size={19}/> Analytics</button>
        <a href="/lead/" className="nav-item" style={{textDecoration:"none"}}><ExternalLink size={19}/> Lead Demo</a>
      </nav>
      <div className="ai-side-card"><span><Sparkles size={14}/> NEW</span><strong>AI Automations</strong><p>24/7 voice, follow-up and lead conversion—built into ACE Host.</p><button onClick={()=>{setView("Operations");setTab("Leads");}}>View product <ChevronRight size={14}/></button></div>
      <div className="side-status"><span className={live?"dot live":"dot"}/>{live?"Live infrastructure data":"ACE demo data"}<small>AI call center online</small></div>
    </aside>

    <main className="workspace">
      <header className="topbar"><div><span className="eyebrow">ACE HOST · INFRASTRUCTURE SALES</span><h1>AI Call Center</h1><p>From first inquiry to a fully provisioned account.</p></div><div className="top-actions"><div className="search"><Search size={17}/><span>Search accounts, services, calls...</span></div><div className="scope-pill"><Building2 size={13}/> Corporate · All locations</div><div className="system-pill"><span/> Systems online</div><div className="avatar">AH</div></div></header>
      <section className="kpis"><Kpi label="Open Opportunities" value={metrics.total} icon={<Users/>}/><Kpi label="Qualified" value={metrics.qualified} icon={<Gauge/>}/><Kpi label="Contracting" value={metrics.contracting} icon={<FileSignature/>}/><Kpi label="Live Accounts" value={metrics.liveAccounts} icon={<Server/>}/><Kpi label="Pipeline Value" value={metrics.pipeline.toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0})} icon={<CircleDollarSign/>}/></section>

      {view==="Operations"&&<><div className="tabbar">{(["Pipeline","Leads","Contracts","Installations"] as Tab[]).map(t=><button key={t} onClick={()=>setTab(t)} className={tab===t?"tab active":"tab"}>{t}</button>)}</div><div className="content-shell"><section className="content-main">{tab==="Pipeline"&&<Pipeline leads={leads} onSelect={setSelected} onAction={act}/>} {tab==="Leads"&&<Leads leads={leads} onSelect={setSelected} onAction={act}/>} {tab==="Contracts"&&<Contracts leads={leads} onSelect={setSelected}/>} {tab==="Installations"&&<Installations leads={leads} onSelect={setSelected}/>}</section><LeadDetail lead={selected} onAction={act}/></div></>}
      {view==="Accounts"&&<div className="content-shell accounts-shell"><section className="content-main"><div className="table-title"><div><h2>ACE Host Accounts</h2><p>Live prospects, customers and infrastructure opportunities.</p></div></div><Leads leads={leads} onSelect={setSelected} onAction={act} compact/></section><LeadDetail lead={selected} onAction={act}/></div>}
      {view==="Conversations"&&<ConversationsView conversations={conversations} selected={selectedCall} onSelect={setSelectedCall} customerFor={customerFor}/>}
      {view==="Analytics"&&<AnalyticsView events={events}/>}
    </main>
  </div>;
}

function AceLogo(){return <div className="brand"><div className="rack-mark"><i/><i/><i/></div><div><strong><b>ACE</b> HOST</strong><span>DATA CENTER · AI</span></div></div>}
function Kpi({label,value,icon}:{label:string,value:any,icon:any}){return <div className="kpi"><div><span>{label}</span><strong>{value}</strong></div><div className="kpi-icon">{icon}</div></div>}
function Pipeline({leads,onSelect,onAction}:{leads:Lead[],onSelect:(l:Lead)=>void,onAction:(l:Lead,a:LeadAction)=>void}){return <div className="pipeline">{stages.map(stage=>{const items=leads.filter(l=>l.stage===stage);return <div className={`stage stage-${stage.toLowerCase().replaceAll(" ","-")}`} key={stage}><div className="stage-head"><div><strong>{stage}</strong><span>{items.length}</span></div><b>{items.reduce((s,l)=>s+(l.value||0),0).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0})}</b></div><div className="stage-body">{items.length?items.map(l=><LeadCard key={l.id} lead={l} onClick={()=>onSelect(l)} onAction={onAction}/>):<div className="empty-stage"><Network size={26}/><span>No opportunities</span></div>}</div></div>})}</div>}
function Leads({leads,onSelect,onAction,compact=false}:{leads:Lead[],onSelect:(l:Lead)=>void,onAction:(l:Lead,a:LeadAction)=>void,compact?:boolean}){const [product,setProduct]=useState(products[0]);const visible=product===products[0]?leads:leads.filter(l=>(l.selectedProduct||l.interest)===product);return <div className="leads-view"><AiAutomationBanner/><div className="lead-toolbar"><div><span className="eyebrow">OPPORTUNITY DIRECTORY</span><h2>Infrastructure Leads</h2></div><label>Product <select value={product} onChange={e=>setProduct(e.target.value)}>{products.map(item=><option key={item}>{item}</option>)}</select></label></div><div className={compact?"lead-grid compact":"lead-grid"}>{visible.map(l=><LeadCard key={l.id} lead={l} onClick={()=>onSelect(l)} onAction={onAction} large/>)}</div>{!visible.length&&<div className="empty-results">No leads for this product yet.</div>}</div>}
function AiAutomationBanner(){return <div className="ai-banner"><div className="ai-orb"><Bot size={31}/></div><div><span className="banner-kicker"><Sparkles size={13}/> NEW ACE HOST PRODUCT</span><h2>AI Automations are now available.</h2><p>Turn ACE infrastructure into an intelligent growth engine with always-on voice, lead qualification, follow-up, scheduling and CRM synchronization.</p><div className="feature-chips"><span><Phone size={13}/> 24/7 AI Voice</span><span><Zap size={13}/> Instant Follow-up</span><span><CalendarDays size={13}/> Auto Scheduling</span><span><Network size={13}/> CRM Sync</span></div></div><div className="banner-cta"><small>NEW REVENUE LINE</small><strong>Hosted by ACE</strong><span>Powered by AI automation</span><ChevronRight/></div></div>}
function LeadCard({lead,onClick,onAction,large=false}:{lead:Lead,onClick:()=>void,onAction:(l:Lead,a:LeadAction)=>void,large?:boolean}){const run=(e:any,a:LeadAction)=>{e.stopPropagation();onAction(lead,a);};return <div className={`${large?"lead-card large":"lead-card"} card-stage-${lead.stage.toLowerCase().replaceAll(" ","-")}`} onClick={onClick} role="button" tabIndex={0}><div className="lead-card-top"><span className="initials">{lead.firstName[0]}{lead.lastName?.[0]||""}</span><span className="score">{lead.score} SCORE</span></div><strong>{lead.company||`${lead.firstName} ${lead.lastName}`}</strong>{lead.company&&<small className="contact-name">{lead.firstName} {lead.lastName}</small>}<span className="interest">{lead.selectedProduct||lead.interest}</span><div className="lead-tags"><span>{lead.location}</span><span>{lead.stage}</span></div><div className="contact-lines"><span><Phone size={12}/>{lead.phone||"No phone"}</span><span><Mail size={12}/>{lead.email||"No email"}</span></div><div className="lead-value">{(lead.value||0).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0})}<small> opportunity</small></div><div className="lead-actions"><button title="Email prospect" onClick={e=>run(e,"email")}><Mail size={15}/></button><button title="Start Alley call" onClick={e=>run(e,"call")}><Phone size={15}/></button><button title="Send SMS" onClick={e=>run(e,"sms")}><MessageSquare size={15}/></button><button title="Open or send proposal" onClick={e=>run(e,"document")}><FileText size={15}/></button><button title="Provisioning calendar" onClick={e=>run(e,"calendar")}><CalendarDays size={15}/></button></div></div>}

function Contracts({leads,onSelect}:{leads:Lead[],onSelect:(l:Lead)=>void}){return <div className="table-card"><div className="table-title"><div><h2>Quotes & Contracts</h2><p>Live proposal status, service selection and signed infrastructure agreements.</p></div></div><div className="doc-table head"><span>Account</span><span>Document</span><span>ACE Product</span><span>Status</span><span>Action</span></div>{leads.map(l=>{const hasDoc=Boolean(l.docusignEnvelopeId);return <div className="doc-table" key={l.id}><span><b>{l.company||`${l.firstName} ${l.lastName}`}</b><small>{l.agreementId||l.email||l.phone}</small></span><span>Infrastructure Services Agreement</span><span>{l.selectedProduct||l.interest}</span><span><Status value={l.documentStatus||"Not sent"}/></span><span>{hasDoc?<a className="link" href={`${DOC_BASE}/${encodeURIComponent(l.id)}`} target="_blank" rel="noreferrer" onClick={()=>onSelect(l)}>View PDF <ExternalLink size={14}/></a>:<span className="muted-text">Not available</span>}</span></div>})}</div>}

function Installations({leads,onSelect}:{leads:Lead[],onSelect:(l:Lead)=>void}){
  const installs=leads.filter(l=>l.deliveryAt).sort((a,b)=>new Date(a.deliveryAt!).getTime()-new Date(b.deliveryAt!).getTime());
  const anchorParts=zonedParts(installs[0]?.deliveryAt||new Date());const year=anchorParts.year,month=anchorParts.month;const firstDow=new Date(Date.UTC(year,month-1,1)).getUTCDay();const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();const cells=Array.from({length:42},(_,i)=>{const day=i-firstDow+1;return day>=1&&day<=daysInMonth?day:null;});const monthLabel=new Intl.DateTimeFormat("en-US",{timeZone:ACE_TZ,month:"long",year:"numeric"}).format(new Date(Date.UTC(year,month-1,15,12)));
  return <div className="delivery-layout"><div className="calendar-card"><div className="table-title"><div><h2>Provisioning Calendar</h2><p>Site reviews, rack installs, migrations and AI launches · Eastern Time</p></div><button>{monthLabel}</button></div><div className="calendar-grid">{["SUN","MON","TUE","WED","THU","FRI","SAT"].map(d=><div className="dow" key={d}>{d}</div>)}{cells.map((day,i)=>{const ds=day?installs.filter(l=>{const p=zonedParts(l.deliveryAt!);return p.year===year&&p.month===month&&p.day===day;}):[];return <div className={day?"day":"day muted"} key={i}><b>{day||""}</b>{ds.map(l=><button className="delivery-pill" onClick={()=>onSelect(l)} key={l.id}>{formatEtTime(l.deliveryAt)} · {l.company||l.firstName}</button>)}</div>})}</div></div><div className="delivery-side"><h3>Upcoming deployments</h3>{installs.length?installs.map(l=><button className="delivery-row" onClick={()=>onSelect(l)} key={l.id}><div className="date-box"><b>{zonedParts(l.deliveryAt!).day}</b><span>{new Intl.DateTimeFormat("en-US",{timeZone:ACE_TZ,month:"short"}).format(new Date(l.deliveryAt!)).toUpperCase()}</span></div><div><strong>{l.company||`${l.firstName} ${l.lastName}`}</strong><span>{l.selectedProduct||l.interest}</span><small>{formatEtTime(l.deliveryAt)} ET · {l.location}</small></div></button>):<p>No deployments scheduled.</p>}</div></div>
}

function ConversationsView({conversations,selected,onSelect,customerFor}:{conversations:Conversation[],selected:Conversation|null,onSelect:(c:Conversation)=>void,customerFor:(id?:string)=>Lead|undefined}){return <div className="conversation-layout"><div className="table-card conversation-list"><div className="table-title"><div><h2>AI Voice Conversations</h2><p>{conversations.length} captured ACE Host calls</p></div></div>{conversations.length?conversations.map(c=>{const lead=customerFor(c.contactId);return <button key={c.callSid||`${c.contactId}-${c.startedAt}`} onClick={()=>onSelect(c)} className={selected?.callSid===c.callSid?"conversation-row active":"conversation-row"}><strong>{lead?.company||`${lead?.firstName||"Unknown"} ${lead?.lastName||"prospect"}`}</strong><span>{new Date(c.startedAt).toLocaleString()} · {c.transcript.length} turns</span>{lead?.selectedProduct&&<small>{lead.selectedProduct}</small>}</button>}):<p className="empty-copy">No captured Alley calls yet.</p>}</div><div className="table-card transcript"><div className="table-title"><div><h2>Call Transcript</h2><p>{selected?.callSid||"Select a conversation"}</p></div></div>{selected?.transcript?.length?selected.transcript.map((turn,i)=><div key={`${turn.at}-${i}`} className={turn.role==="buddy"?"turn ai":"turn prospect"}><div><b>{turn.role==="buddy"?"Alley":"Prospect"}</b><p>{turn.text}</p><small>{new Date(turn.at).toLocaleTimeString()}</small></div></div>):<p className="empty-copy">No transcript selected.</p>}</div></div>}
function AnalyticsView({events}:{events:AceEvent[]}){const counts=events.reduce((m:any,e)=>{m[e.type]=(m[e.type]||0)+1;return m;},{});const recent=events.slice(0,50);return <div className="analytics-layout"><div className="table-card analytics-card"><div className="table-title"><div><h2>Automation Analytics</h2><p>Live operational telemetry from the ACE AI call center.</p></div></div><div className="analytics-kpis"><Kpi label="AI Calls" value={events.filter(e=>e.type==="call.created").length} icon={<Phone/>}/><Kpi label="Prospect Turns" value={counts["stt.transcript.final"]||0} icon={<MessageSquare/>}/><Kpi label="Contract Events" value={events.filter(e=>e.type.includes("docusign")).length} icon={<FileSignature/>}/><Kpi label="Deployment Events" value={events.filter(e=>e.type.includes("delivery")).length} icon={<HardDrive/>}/></div></div><div className="table-card recent-card"><div className="table-title"><div><h2>Recent Activity</h2><p>Newest calls, contracts and provisioning events.</p></div></div>{recent.map(e=><div key={e.id} className="activity-row"><span>{new Date(e.createdAt).toLocaleString()}</span><b>{e.type}</b><span>{e.contactId||"—"}</span><span>{e.text||e.payload?.productName||e.payload?.deliveryAt||e.payload?.status||"Workflow event"}</span></div>)}</div></div>}

function Status({value}:{value:string}){const good=["signed","completed","scheduled"].includes(value.toLowerCase());return <span className={good?"status good":"status"}>{good&&<CheckCircle2 size={14}/>} {value}</span>}
function LeadDetail({lead,onAction}:{lead:Lead,onAction:(l:Lead,a:LeadAction)=>void}){return <aside className="detail-panel"><div className="detail-person"><span className="detail-avatar">{lead.firstName[0]}{lead.lastName?.[0]}</span><div><span className="eyebrow">SELECTED OPPORTUNITY</span><h2>{lead.company||`${lead.firstName} ${lead.lastName}`}</h2><p>{lead.company&&`${lead.firstName} ${lead.lastName} · `}{lead.selectedProduct||lead.interest}</p></div></div><div className="detail-score"><span>Qualification score</span><strong>{lead.score}</strong></div><section><h3>Contact</h3><p><Phone size={15}/>{lead.phone||"No phone"}</p><p><Mail size={15}/>{lead.email||"No email"}</p></section><section><h3>Alley workflow</h3><Timeline icon={<MessageSquare/>} title="Automated outreach" value={lead.outreachStatus||((lead.stage!=="New Inquiry")?"Active":"Queued")}/><Timeline icon={<Phone/>} title="Voice qualification" value={lead.callStatus||"Not called"}/><Timeline icon={<FileSignature/>} title="Contract" value={lead.documentStatus||"Not sent"}/><Timeline icon={<ShieldCheck/>} title="Provisioning" value={lead.deliveryAt?`${lead.deliveryStatus||"Scheduled"} · ${formatEtDateTime(lead.deliveryAt)}`:"Not scheduled"}/></section>{lead.docusignEnvelopeId&&<a className="primary-action secondary" href={`${DOC_BASE}/${encodeURIComponent(lead.id)}`} target="_blank" rel="noreferrer"><FileText size={16}/> View Contract PDF</a>}{lead.calendarEventUrl&&<a className="primary-action secondary" href={lead.calendarEventUrl} target="_blank" rel="noreferrer"><CalendarDays size={16}/> Open Deployment Event</a>}<div className="detail-date">{lead.deliveryAt&&`Deployment: ${formatEtMonthDay(lead.deliveryAt)} at ${formatEtTime(lead.deliveryAt)} ET`}</div><button className="primary-action" onClick={()=>onAction(lead,"call")}><Phone size={16}/> Start / Resume AI Call</button></aside>}
function Timeline({icon,title,value}:{icon:any,title:string,value:string}){return <div className="timeline"><span>{icon}</span><div><b>{title}</b><small>{value}</small></div></div>}
