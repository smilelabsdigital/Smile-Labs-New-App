// Smile Labs AI Smile Studio v0.7.0 — local prototype. Not production or patient-data ready. Image outputs are illustrative and may change original structures.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
// Node.js 24: load server-only settings from .env before reading process.env.
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const PORT=Number(process.env.PORT||3000),PUBLIC=path.join(__dirname,'public'),DATA=path.join(__dirname,'private-data','accounts.json');
const SECRET=process.env.SESSION_SECRET||crypto.randomBytes(32).toString('hex');
const DEV=process.env.NODE_ENV!=='production';
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const sharp=require('sharp');
const styles=Object.freeze({
 whitening:'Whiten existing teeth only.',
 missing:'Correct the smile by adding the missing teeth. Keep existing teeth unchanged.'
});
// Each selection sends its own whitening-only instruction. Never add missing teeth during whitening.
const WHITENING_SHADES=Object.freeze({
 A2:{label:'Natural White (A2-inspired)',instruction:'Whiten existing teeth only to a subtle, warm, natural A2-inspired ivory shade. Do not add or remove teeth. Keep all existing tooth shapes, sizes, positions and spacing the same.'},
 B1:{label:'Bright White (B1-inspired)',instruction:'Whiten existing teeth only to a noticeably brighter, neutral B1-inspired white shade. Do not add or remove teeth. Keep all existing tooth shapes, sizes, positions and spacing the same.'},
 '0M1':{label:'Hollywood White (0M1-inspired)',instruction:'Whiten existing teeth only to a distinctly ultra-bright 0M1-inspired bleached-white shade. Do not add or remove teeth. Keep all existing tooth shapes, sizes, positions and spacing the same.'}
});

// One prompt-selection function for every image edit. No shared extra instructions.
function selectEditPrompt(style,shade){
 if(style==='missing')return styles.missing;
 if(style==='whitening' && Object.hasOwn(WHITENING_SHADES,shade))return WHITENING_SHADES[shade].instruction;
 throw Error('Invalid treatment or whitening shade.');
}

let db={users:[],events:[]},writeQueue=Promise.resolve();
async function init(){try{db=JSON.parse(await fs.readFile(DATA,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;await save();}}
function save(){writeQueue=writeQueue.then(async()=>{await fs.mkdir(path.dirname(DATA),{recursive:true});const tmp=DATA+'.tmp';await fs.writeFile(tmp,JSON.stringify(db,null,2),{mode:0o600});await fs.rename(tmp,DATA);});return writeQueue;}
function reply(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
async function readBody(req,limit=20*1024*1024){let a=[],n=0;for await(const ch of req){n+=ch.length;if(n>limit)throw Error('Request too large.');a.push(ch);}return JSON.parse(Buffer.concat(a).toString('utf8'));}
const clean=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
const emailOK=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<=254;
function token(user){const payload=Buffer.from(JSON.stringify({id:user.id,exp:Date.now()+7*86400000})).toString('base64url');return payload+'.'+crypto.createHmac('sha256',SECRET).update(payload).digest('base64url');}
function current(req){try{const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('sl_session='))?.slice(11)||'';const [p,s]=raw.split('.');if(!p||!s)return null;const valid=crypto.createHmac('sha256',SECRET).update(p).digest('base64url');if(!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(valid)))return null;const d=JSON.parse(Buffer.from(p,'base64url').toString());return d.exp>Date.now()?db.users.find(u=>u.id===d.id)||null:null;}catch{return null;}}
function cookie(res,user){res.setHeader('Set-Cookie',`sl_session=${token(user)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);}
// Quotas are computed separately by role. Professional credits reset each calendar month (UTC).
const currentMonth=()=>new Date().toISOString().slice(0,7);
const dentistLimit=()=>10; // Fixed 10 per month, independent of old .env settings
// Administrator testing is granted ONLY to verified account email addresses explicitly
// listed server-side. The dashboard password alone is not a signed-in studio account.
// No admin privileges can be requested through the registration form or browser.
const adminTestEmails=()=>new Set((process.env.ADMIN_TEST_EMAILS||process.env.ADMIN_TEST_EMAIL||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean));
const isAdminTester=u=>Boolean(u?.verified && adminTestEmails().has(String(u.email||'').toLowerCase()));
function usedThisPeriod(u){return u.role==='dentist'&&u.month!==currentMonth()?0:Math.max(0,Number(u.used)||0);}
function publicUser(u){return u?{id:u.id,name:u.name,email:u.email,role:u.role,verified:u.verified,approved:u.approved,adminTester:isAdminTester(u),used:usedThisPeriod(u),limit:isAdminTester(u)?null:(u.role==='dentist'?dentistLimit():1),clinic:u.clinic||'',gdc:u.gdc||'',created:u.created}:null;}
async function sendEmail(to,subject,html){
 if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL){
  if(DEV){console.log('[EMAIL NOT CONFIGURED]',subject);return false;}
  throw Error('Resend is not configured.');
 }
 const r=await fetch('https://api.resend.com/emails',{
  method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
  body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[to],reply_to:'info@smilelabsdigital.co.uk',subject,html})
 });
 if(!r.ok)throw Error(`Resend ${r.status}: ${(await r.text()).slice(0,350)}`);
 return true;
}
async function mail(subject,html){
 try{return await sendEmail('info@smilelabsdigital.co.uk',subject,html);}
 catch(e){console.error('Admin notification failed:',e.message);return false;}
}
async function sendCode(email,code,purpose){
 return sendEmail(email,`Smile Labs AI Studio — ${purpose==='login'?'Sign-in':'Verification'} code`,
 `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#003265"><h2>Smile Labs AI Studio</h2><p>Use your one-time ${purpose==='login'?'sign-in':'verification'} code:</p><p style="font-size:34px;font-weight:700;letter-spacing:7px;color:#1479cb">${code}</p><p>This code expires in 15 minutes. If you did not request it, you can ignore this email.</p><p>Smile Labs UK</p></div>`);
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function details(u){return `<p><b>Account:</b> ${esc(u.role)}</p><p><b>Name:</b> ${esc(u.name)}</p><p><b>Email:</b> ${esc(u.email)}</p><p><b>Phone:</b> ${esc(u.phone)}</p><p><b>Address:</b> ${esc(u.address)}</p>${u.role==='dentist'?`<p><b>Clinic:</b> ${esc(u.clinic)}</p><p><b>GDC:</b> ${esc(u.gdc)}</p>`:''}`;}
async function notify(u,event,style){const title=event==='registration'?'New registration':'Smile makeover completed';db.events.push({id:crypto.randomUUID(),userId:u.id,type:event,date:new Date().toISOString(),style:style||null});await save();const sent=await mail(`Smile Labs AI Studio — ${title} (${u.role})`,`<h2>${esc(title)}</h2>${details(u)}<p><b>Event:</b> ${esc(event)}</p>${style?`<p><b>Style:</b> ${esc(style)}</p>`:''}<p><b>Date:</b> ${new Date().toISOString()}</p>${event==='registration'&&u.role==='dentist'?'<p><b>Action:</b> GDC and identity verification required in the admin dashboard.</p>':''}`);return sent;}
// Experimental automatic tooth-region estimate. Conservative and intentionally fails closed.
// This is NOT a dental segmentation model: low-confidence images must be rejected.

async function toothRegion(png){
 const {data,info}=await sharp(png).removeAlpha().resize({width:640,withoutEnlargement:true}).raw().toBuffer({resolveWithObject:true});
 const w=info.width,h=info.height,ch=info.channels;
 const buckets=[]; const y0=Math.round(h*.26),y1=Math.round(h*.91),x0=Math.round(w*.14),x1=Math.round(w*.86);
 for(let y=y0;y<y1;y++){
  let count=0;
  for(let x=x0;x<x1;x++){
   const i=(y*w+x)*ch,r=data[i],g=data[i+1],b=data[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
   if(min>92 && (max-min)<78 && ((r+g+b)/3)>119 && r>=b-12)count++;
  }
  buckets.push({y,count});
 }
 const smoothed=buckets.map((b,i)=>({y:b.y,score:buckets.slice(Math.max(0,i-9),Math.min(buckets.length,i+10)).reduce((a,q)=>a+q.count,0)}));
 smoothed.sort((a,b)=>b.score-a.score);const cy=smoothed[0]?.y;
 if(!Number.isFinite(cy)||smoothed[0].score<Math.max(50,w*.55))throw Error('Could not confidently locate teeth. Please use a clear, front-facing smile photograph.');
 let xs=[];for(let y=Math.max(y0,cy-Math.round(h*.075));y<Math.min(y1,cy+Math.round(h*.075));y++){
  for(let x=x0;x<x1;x+=2){const i=(y*w+x)*ch,r=data[i],g=data[i+1],b=data[i+2];if(Math.min(r,g,b)>110 && Math.max(r,g,b)-Math.min(r,g,b)<72)xs.push(x);}
 }
 xs.sort((a,b)=>a-b);const cx=xs.length>20?xs[Math.floor(xs.length/2)]:w/2;
 return {cx:cx/w,cy:cy/h,rx:.31,ry:.145};
}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
// Gap-aware edit plan: automatically find a dark interruption between visible upper teeth.
// This is a heuristic, not a validated dental segmentation model. Fail closed on ambiguity.
async function prepareAiEdit(png, style){
 const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const w=info.width,h=info.height,ch=info.channels;
 const roi=await toothRegion(png);
 const cx=roi.cx*w,cy=roi.cy*h,rx=roi.rx*w,ry=roi.ry*h;
 const left=clamp(Math.floor(cx-rx*1.42),0,w-2), top=clamp(Math.floor(cy-ry*1.18),0,h-2);
 const right=clamp(Math.ceil(cx+rx*1.42),left+2,w), bottom=clamp(Math.ceil(cy+ry*1.22),top+2,h);
 const crop={left,top,width:right-left,height:bottom-top};
 const alpha=Buffer.alloc(crop.width*crop.height);
 let editable=0;
 if(style==='missing'){
  // The gap must interrupt the upper arch, have dark mouth pixels and neighbouring teeth on both sides.
  // Measure tooth-like pixels across an upper-to-mid mouth band, rather than painting every dark mouth pixel.
  const yMin=clamp(Math.round(cy-ry*.83),top,bottom-2), yMax=clamp(Math.round(cy+ry*.12),yMin+1,bottom);
  const columns=[];
  for(let x=left;x<right;x++){
   let tooth=0,dark=0;
   for(let y=yMin;y<yMax;y++){
    const k=(y*w+x)*ch,r=data[k],g=data[k+1],b=data[k+2],brightness=(r+g+b)/3,sat=Math.max(r,g,b)-Math.min(r,g,b);
    if(brightness>125&&sat<80&&r>=b-12)tooth++;
    if(brightness<118)dark++;
   }
   columns.push({tooth:tooth/(yMax-yMin),dark:dark/(yMax-yMin)});
  }
  const smooth=columns.map((_,i)=>{
   const neighbors=columns.slice(Math.max(0,i-3),Math.min(columns.length,i+4));
   return {tooth:neighbors.reduce((s,v)=>s+v.tooth,0)/neighbors.length,dark:neighbors.reduce((s,v)=>s+v.dark,0)/neighbors.length};
  });
  let candidates=[];
  const searchL=Math.floor(columns.length*.10),searchR=Math.ceil(columns.length*.90);
  for(let i=searchL;i<searchR;){
   if(!(smooth[i].dark>.37&&smooth[i].tooth<.23)){i++;continue;}
   const from=i;while(i<searchR&&smooth[i].dark>.30&&smooth[i].tooth<.29)i++;
   const to=i;
   const width=to-from;
   if(width<Math.max(5,w*.012)||width>Math.max(12,w*.18))continue;
   const shoulder=Math.max(7,Math.min(24,Math.round(width*.8)));
   const before=smooth.slice(Math.max(0,from-shoulder),from),after=smooth.slice(to,Math.min(smooth.length,to+shoulder));
   const flankL=Math.max(0,...before.map(v=>v.tooth)),flankR=Math.max(0,...after.map(v=>v.tooth));
   if(flankL<.25||flankR<.25)continue;
   const central=1-Math.abs((from+to)/2-columns.length/2)/(columns.length/2);
   candidates.push({from,to,width,score:(flankL+flankR)+central*.5});
  }
  candidates.sort((a,b)=>b.score-a.score);
  // Multiple candidate gaps may exist; do not guess which tooth the user wants restored.
  if(!candidates.length)throw Error('Could not confidently identify a missing-tooth gap between existing teeth. Please use a clear, front-facing photograph. No credit deducted.');
  if(candidates.length>1&&candidates[0].score-candidates[1].score<.12)throw Error('Several possible tooth gaps detected. Automatic placement is uncertain; no changes made or preview credit deducted.');
  const gap=candidates[0];
  // Region extends slightly into tooth edges for natural blending; existing teeth remain mostly preserved.
  const margin=Math.max(2,Math.min(5,Math.round(gap.width*.09)));
  const xStart=left+gap.from-margin,xEnd=left+gap.to+margin;
  const topY=clamp(Math.round(cy-ry*.76),top,bottom-1),bottomY=clamp(Math.round(cy+ry*.19),topY+1,bottom);
  for(let yy=0;yy<crop.height;yy++)for(let xx=0;xx<crop.width;xx++){
   const x=left+xx,y=top+yy;
   if(x<xStart||x>xEnd||y<topY||y>bottomY)continue;
   const k=(y*w+x)*ch,brightness=(data[k]+data[k+1]+data[k+2])/3;
   const edge=Math.min(x-xStart,xEnd-x,y-topY,bottomY-y);
   const edgeFade=clamp(edge/Math.max(2,Math.min(5,margin)),0,1);
   // Keep existing bright enamel untouched. The editable portion is dark gap pixels.
   const strength=brightness>155?.08:brightness>122?.40:1;
   alpha[yy*crop.width+xx]=Math.round(255*edgeFade*strength);editable++;
  }
 } else {
  for(let yy=0;yy<crop.height;yy++)for(let xx=0;xx<crop.width;xx++){
   const x=left+xx,y=top+yy,k=(y*w+x)*ch,r=data[k],g=data[k+1],b=data[k+2],brightness=(r+g+b)/3,sat=Math.max(r,g,b)-Math.min(r,g,b);
   const dist=Math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2);
   const enamel=dist<.92&&brightness>118&&brightness<249&&sat<70&&r>=b-12;
   if(!enamel)continue;
   alpha[yy*crop.width+xx]=style==='bonding'?110:style==='hollywood'?135:95;editable++;
  }
 }
 if(editable<35)throw Error('No confident editable tooth region was found. No preview credit deducted.');
 const softened=await sharp(alpha,{raw:{width:crop.width,height:crop.height,channels:1}}).blur(.75).raw().toBuffer();
 const cropPng=await sharp(png).extract(crop).png().toBuffer();
 // OpenAI mask convention: transparent=editable; opaque=locked.
 const maskRGBA=Buffer.alloc(crop.width*crop.height*4);
 for(let i=0;i<softened.length;i++){
  maskRGBA[i*4]=255;maskRGBA[i*4+1]=255;maskRGBA[i*4+2]=255;
  maskRGBA[i*4+3]=255-softened[i];
 }
 const maskPng=await sharp(maskRGBA,{raw:{width:crop.width,height:crop.height,channels:4}}).png().toBuffer();
 return {crop,alpha:softened,cropPng,maskPng};
}
async function editConservatively(png, aiBytes, style, plan){
 const {crop,alpha,cropPng}=plan||await prepareAiEdit(png, style);
 const {data:orig,info}=await sharp(cropPng).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const gen=await sharp(aiBytes).resize(crop.width,crop.height,{fit:'fill'}).removeAlpha().raw().toBuffer();
 const out=Buffer.from(orig);
 let candidatePixels=0, filledPixels=0, editedPixels=0, cumulativeDifference=0;
 for(let yy=0;yy<crop.height;yy++)for(let xx=0;xx<crop.width;xx++){
  const m=alpha[yy*crop.width+xx]/255; if(!m)continue;
  const k=(yy*crop.width+xx)*3;
  const localDelta=(Math.abs(gen[k]-orig[k])+Math.abs(gen[k+1]-orig[k+1])+Math.abs(gen[k+2]-orig[k+2]))/3;
  if(m>.25){ editedPixels++; cumulativeDifference+=localDelta*m; }
  if(style==='missing' && m>.65){
   const origL=(orig[k]+orig[k+1]+orig[k+2])/3;
   const newL=(gen[k]+gen[k+1]+gen[k+2])/3;
   if(origL<120){candidatePixels++; if(newL>origL+38 && newL>135)filledPixels++;}
  }
  out[k]=Math.round(orig[k]*(1-m)+gen[k]*m);
  out[k+1]=Math.round(orig[k+1]*(1-m)+gen[k+1]*m);
  out[k+2]=Math.round(orig[k+2]*(1-m)+gen[k+2]*m);
 }
 if(style!=='missing' && (editedPixels<65 || cumulativeDifference/Math.max(editedPixels,1)<7))throw Error('The AI edit was too subtle or nearly identical to the original. No preview credit deducted.');
 if(style==='missing' && (candidatePixels<35 || filledPixels<Math.max(18,candidatePixels*.025))){
  throw Error('AI did not clearly add a tooth inside the detected gap. Result rejected; no preview credit deducted.');
 }
 const editedCrop=await sharp(out,{raw:{width:crop.width,height:crop.height,channels:3}}).png().toBuffer();
 return sharp(png).composite([{input:editedCrop,left:crop.left,top:crop.top}]).jpeg({quality:93}).toBuffer();
}
// Shade-inspired cosmetic previews, NOT measured VITA shade matching.
// Reference instructions for a future AI-assisted colour model (NOT sent to OpenAI in v0.6.5):
// Preserve every existing tooth exactly: shape, size, alignment, edges, texture and spacing.
// Change only enamel colour within confidently detected tooth pixels. Never redraw teeth.
const SHADE_OPTIONS=Object.freeze({
 natural:{label:'Natural whitening',lift:1.0,warmth:0.9,prompt:'Gently whiten existing enamel naturally, keeping realistic warmth and texture.'},
 A3:{label:'A3 · Warm ivory',lift:0.24,warmth:1.22,prompt:'Preview a VITA classical A3-inspired warm natural ivory appearance without changing tooth anatomy.'},
 A2:{label:'A2 · Natural ivory',lift:0.42,warmth:1.12,prompt:'Preview a VITA classical A2-inspired soft warm ivory appearance without changing tooth anatomy.'},
 A1:{label:'A1 · Light ivory',lift:0.66,warmth:0.98,prompt:'Preview a VITA classical A1-inspired light natural ivory appearance without changing tooth anatomy.'},
 B2:{label:'B2 · Soft bright',lift:0.55,warmth:0.92,prompt:'Preview a VITA classical B2-inspired light natural shade without changing tooth anatomy.'},
 B1:{label:'B1 · Bright natural',lift:0.90,warmth:0.72,prompt:'Preview a VITA classical B1-inspired bright natural tooth appearance without changing tooth anatomy.'},
 '0M3':{label:'0M3 · Bleached',lift:1.12,warmth:0.58,prompt:'Preview a VITA 3D-MASTER bleached 0M3-inspired tooth shade, retaining natural detail and anatomy.'},
 '0M2':{label:'0M2 · Bright bleached',lift:1.34,warmth:0.45,prompt:'Preview a VITA 3D-MASTER bleached 0M2-inspired tooth shade, retaining natural detail and anatomy.'},
 '0M1':{label:'0M1 · Ultra bright',lift:1.52,warmth:0.32,prompt:'Preview a VITA 3D-MASTER bleached 0M1-inspired tooth shade, retaining natural detail and anatomy.'}
});
async function whitenExistingTeeth(png,shadeKey="natural"){
 // v0.6.7: smooth, LOW-STRENGTH enamel colour grading, no generative reconstruction.
 // A soft, low-frequency mask removes abrupt, paint-like white highlights.
 // Experimental image heuristic: this is NOT validated tooth segmentation.
 const shade=SHADE_OPTIONS[shadeKey];if(!shade)throw Error('Invalid whitening shade.');
 const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const w=info.width,h=info.height,roi=await toothRegion(png);
 const cx=roi.cx*w,cy=roi.cy*h,rx=Math.max(10,roi.rx*w),ry=Math.max(10,roi.ry*h);
 // Work with continuous confidence values, not hard thresholds per pixel.
 // Dark mouths and strongly pink/red tissue receive almost no adjustment.
 const mask=Buffer.alloc(w*h);let nCandidates=0;
 const smooth=(lo,hi,v)=>{const t=clamp((v-lo)/(hi-lo),0,1);return t*t*(3-2*t);};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,j=i*3,r=data[j],g=data[j+1],b=data[j+2];
  const dist=Math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2);
  if(dist>=1)continue;
  const brightness=.2126*r+.7152*g+.0722*b;
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  const redPink=r-g;
  // Avoid bright specular spots driving the whitening strength; they stay intact.
  const brightnessConfidence=smooth(88,145,brightness)*(1-smooth(238,255,brightness)*.35);
  const tissueConfidence=1-smooth(24,65,redPink)*(1-smooth(10,29,g-b)); // suppress red/pink tissue while allowing warm yellow enamel
  const chromaConfidence=1-smooth(75,115,chroma);
  const blueConfidence=1-smooth(14,32,b-g);
  const ovalConfidence=1-smooth(.75,1,dist);
  const value=brightnessConfidence*tissueConfidence*chromaConfidence*blueConfidence*ovalConfidence;
  mask[i]=Math.round(clamp(value,0,1)*255);
  if(value>.45)nCandidates++;
 }
 if(nCandidates<Math.max(75,w*h*.00035))throw Error('Could not detect a reliable tooth area. Please use a well-lit front-facing smile photo. No preview credit deducted.');
 // Heavily soften the mask so enamel receives the SAME gradual correction,
 // rather than independent high-contrast white splotches per original pixel.
 const radius=Math.max(3,Math.min(12,Math.round(Math.min(w,h)*.012)));
 const blurred=await sharp(mask,{raw:{width:w,height:h,channels:1}}).blur(radius).raw().toBuffer();
 const output=Buffer.from(data);
 let pixels=0,total=0;
 // Shade inspired lightness/chroma adjustments rather than repainting enamel.
 const strength=clamp(shade.lift*.72,.12,.99);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,j=i*3,r=data[j],g=data[j+1],b=data[j+2];
  const dist=Math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2);
  if(dist>1)continue;
  const a=blurred[i*3]/255 * (1-smooth(.83,1,dist));
  if(a<.07)continue;
  // Retain original contrast, microtexture and real reflections by changing
  // colour modestly; lift is capped at ~8 RGB values even for 0M1.
  const brightness=.2126*r+.7152*g+.0722*b;
  const yellow=Math.max(0,(r+g)*.5-b);
  const warm=clamp(shade.warmth,.25,1.4);
  const lift=clamp((brightness-70)/115,0,1)*strength*a;
  const blueGain=Math.min(18,yellow*.23)*(1.45-warm*.25)*lift;
  const greenGain=Math.min(10,yellow*.13)*lift;
  const whiteGain=20*lift;
  const R=clamp(Math.round(r+whiteGain*.55),0,255);
  const G=clamp(Math.round(g+greenGain+whiteGain*.8),0,255);
  const B=clamp(Math.round(b+blueGain+whiteGain),0,255);
  if(R!==r||G!==g||B!==b){pixels++;total+=Math.abs(R-r)+Math.abs(G-g)+Math.abs(B-b);}
  output[j]=R;output[j+1]=G;output[j+2]=B;
 }
 if(pixels<Math.max(60,w*h*.0002)||total/Math.max(1,pixels)<0.75){throw Error('A reliable whitening preview could not be produced from this image. No preview credit deducted.');}
 return sharp(output,{raw:{width:w,height:h,channels:3}}).png().toBuffer();
}

const pending=new Set();

async function api(req,res,route){
 if(route==='/api/status'&&req.method==='GET')return reply(res,200,{user:publicUser(current(req)),aiConfigured:!!process.env.OPENAI_API_KEY,emailConfigured:!!(process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL),prototype:true});
 if(route==='/api/register'&&req.method==='POST'){
  let d;try{d=await readBody(req,16000);}catch{return reply(res,400,{error:'Invalid registration form.'});}
  const role=d.role==='dentist'?'dentist':d.role==='public'?'public':null,name=clean(d.name),email=clean(d.email,254).toLowerCase(),phone=clean(d.phone,40),address=clean(d.address,240),clinic=clean(d.clinic),gdc=clean(d.gdc,30);
  if(!role||name.length<2||!emailOK(email)||phone.length<6||address.length<5||(role==='dentist'&&(!clinic||!/^\d{5,8}$/.test(gdc))))return reply(res,400,{error:'Please complete all required fields. GDC number must contain 5–8 digits.'});
  if(!d.terms||!d.imageAcknowledgement)return reply(res,400,{error:'Please accept the terms and privacy notice for this prototype.'});
  if(db.users.some(u=>u.email===email))return reply(res,409,{error:'This email is already registered. Please sign in instead.'});
  const code=String(crypto.randomInt(100000,1000000)),u={id:crypto.randomUUID(),role,name,email,phone,address,clinic,gdc,created:new Date().toISOString(),verified:false,approved:false,used:0,month:currentMonth(),codeHash:crypto.createHash('sha256').update(code).digest('hex'),codeUntil:Date.now()+15*60000};
  db.users.push(u);await save();
  try{await sendCode(email,code,'register');}
  catch(e){db.users=db.users.filter(x=>x.id!==u.id);await save();console.error('Registration email failed:',e.message);return reply(res,503,{error:'Could not send verification email. Please try again later.'});}
  if(DEV&&!process.env.RESEND_API_KEY)console.log(`[LOCAL TEST ONLY] Verification code for ${email}: ${code}`);
  await notify(u,'registration');
  return reply(res,201,{message:'Registration saved. Verify your email to continue.',developmentCode:DEV&&!process.env.RESEND_API_KEY?code:undefined,email});
 }
 if(route==='/api/verify'&&req.method==='POST'){
  let d;try{d=await readBody(req,4096);}catch{return reply(res,400,{error:'Invalid request.'});}const u=db.users.find(x=>x.email===clean(d.email,254).toLowerCase());const hash=crypto.createHash('sha256').update(clean(d.code,12)).digest('hex');
  if(!u||!u.codeHash||u.codeUntil<Date.now()||hash!==u.codeHash)return reply(res,400,{error:'Invalid or expired code.'});
  u.verified=true;delete u.codeHash;delete u.codeUntil;await save();cookie(res,u);return reply(res,200,{user:publicUser(u)});
 }
 if(route==='/api/login'&&req.method==='POST'){
  // Email code sign-in, no password storage.
  let d;try{d=await readBody(req,4096);}catch{return reply(res,400,{error:'Invalid request.'});}
  const email=clean(d.email,254).toLowerCase(),u=db.users.find(x=>x.email===email&&x.verified);if(!u)return reply(res,404,{error:'Verified account not found.'});
  const code=String(crypto.randomInt(100000,1000000));
  try{await sendCode(email,code,'login');}
  catch(e){console.error('Sign-in email failed:',e.message);return reply(res,503,{error:'Could not send sign-in email. Please try again later.'});}
  u.codeHash=crypto.createHash('sha256').update(code).digest('hex');u.codeUntil=Date.now()+15*60000;await save();
  if(DEV&&!process.env.RESEND_API_KEY)console.log(`[LOCAL TEST ONLY] Login code for ${email}: ${code}`);
  return reply(res,200,{message:'Sign-in code sent.',developmentCode:DEV&&!process.env.RESEND_API_KEY?code:undefined,email});
 }
 if(route==='/api/logout'&&req.method==='POST'){res.setHeader('Set-Cookie','sl_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return reply(res,200,{ok:true});}
 const u=current(req);
 if(route==='/api/generate'&&req.method==='POST'){
  if(!u||!u.verified)return reply(res,401,{error:'Please register and verify your email first.'});if(u.role==='dentist'&&!u.approved&&!isAdminTester(u))return reply(res,403,{error:'Your dental professional account is awaiting Smile Labs approval.'});
  if(!isAdminTester(u)&&u.role==='public'&&usedThisPeriod(u)>=1)return reply(res,403,{error:'Your one complimentary preview has already been used.'});
  if(!isAdminTester(u)&&u.role==='dentist'&&usedThisPeriod(u)>=dentistLimit())return reply(res,403,{error:'Your monthly allowance has been used.'});
  if(pending.has(u.id))return reply(res,429,{error:'A generation is already running for this account.'});
  let d;try{d=await readBody(req);}catch{return reply(res,400,{error:'Invalid photograph upload.'});}
  if(d.consent!==true||d.photoConsentVersion!=='v1-cosmetic-preview'||!Object.hasOwn(styles,d.style)||(d.style==='whitening'&&!Object.hasOwn(WHITENING_SHADES,d.shade)))return reply(res,400,{error:'Please select a style and confirm photo permission.'});
  const match=typeof d.image==='string'&&d.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);if(!match)return reply(res,400,{error:'Upload a JPEG, PNG or WebP photo.'});
  const bytes=Buffer.from(match[2],'base64');if(!bytes.length||bytes.length>7*1024*1024)return reply(res,400,{error:'Maximum image size is 7 MB.'});
   let prepared;
   try {
     const meta=await sharp(bytes,{limitInputPixels:16e6}).metadata();
     if(!meta.width||!meta.height||meta.width>4096||meta.height>4096)throw Error('Unsupported photo dimensions.');
     prepared=await sharp(bytes,{limitInputPixels:16e6}).rotate().png().toBuffer();
   } catch(e){return reply(res,400,{error:'Unable to read photo: '+e.message});}
   // v0.6.8: Restore original direct OpenAI whitening workflow.
   // Do not run experimental local whitening / tooth-colour masks.
   if(!process.env.OPENAI_API_KEY)return reply(res,503,{error:'OpenAI is not configured. Add OPENAI_API_KEY to your private .env file.'});
   pending.add(u.id);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),150000);
   try {
     const form=new FormData();
     form.append('model',process.env.OPENAI_IMAGE_MODEL||'gpt-image-2.5-sunburst');
     // Send the actual original photograph with no automatic gap-detection mask.
     // Masking was suppressing edits, sometimes creating an identical result.
     form.append('image',new Blob([prepared],{type:'image/png'}),'original.png');
     const editPrompt=selectEditPrompt(d.style,d.shade);
     form.append('prompt',editPrompt);
     form.append('n','1');form.append('output_format','png');form.append('quality',process.env.OPENAI_IMAGE_QUALITY||'medium');
     const r=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form,signal:controller.signal});
     const raw=await r.text();let result;try{result=JSON.parse(raw)}catch{result={}};
     if(!r.ok){const why=result.error?.message||`Image provider returned ${r.status}`;console.error('Image provider:',r.status,why);return reply(res,502,{error:why});}
     const b64=result.data?.[0]?.b64_json;
     if(!b64)return reply(res,502,{error:'Image service returned no edited photograph.'});
     // Check the returned photo really changed; don't quietly report success for a copy.
     // We intentionally do not composite back an unreliable mask that hides the new tooth.
     let final;
     try {
       const img=Buffer.from(b64,'base64');
       const meta=await sharp(prepared).metadata();
       final=await sharp(img).resize(meta.width,meta.height,{fit:'fill'}).png().toBuffer();
       const smallOriginal=await sharp(prepared).resize(180,180,{fit:'fill'}).removeAlpha().raw().toBuffer();
       const smallOutput=await sharp(final).resize(180,180,{fit:'fill'}).removeAlpha().raw().toBuffer();
       let delta=0;
       for(let i=0;i<smallOriginal.length;i++)delta+=Math.abs(smallOriginal[i]-smallOutput[i]);
       const avg=delta/smallOriginal.length;
       if(avg<1.35)return reply(res,422,{error:'The AI returned an almost unchanged photograph. Please retry with a clearer photo. No app preview credit deducted (the API may still charge for the request).'});
     } catch(e) { console.warn('AI result validation:',e);return reply(res,422,{error:'The image provider returned an invalid result. No app preview credit deducted.'}); }
     if(u.role==='dentist'&&u.month!==currentMonth()){u.month=currentMonth();u.used=0;}
     if(!isAdminTester(u))u.used++;await save();await notify(u,'generation',d.style);
     return reply(res,200,{image:'data:image/png;base64,'+final.toString('base64'),user:publicUser(u),selectedShade:d.style==='whitening'?d.shade:null,processing:'openai-image-edit'});
   }catch(e){console.error('Smile edit error:',e);return reply(res,502,{error:e.name==='AbortError'?'Image processing timed out. Please retry later.':e.message?.includes('fetch failed')?'Could not connect to the image service. Check your internet connection and restart the app; see VS Code terminal for details.':'Image processing error. Check the VS Code terminal for details.'});}
   finally{clearTimeout(timer);pending.delete(u.id);}

 }
 if(route==='/api/admin'&&req.method==='POST'){
  if(!process.env.ADMIN_PASSWORD)return reply(res,503,{error:'Configure ADMIN_PASSWORD to enable admin dashboard.'});
  let d;try{d=await readBody(req,4096);}catch{return reply(res,400,{error:'Invalid request.'});}
  const a=Buffer.from(clean(d.password,300)),b=Buffer.from(process.env.ADMIN_PASSWORD);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return reply(res,401,{error:'Incorrect admin password.'});
  if(d.action==='approve'||d.action==='reject'){const target=db.users.find(x=>x.id===d.id&&x.role==='dentist');if(!target)return reply(res,404,{error:'Application not found.'});target.approved=d.action==='approve';await save();}
  return reply(res,200,{users:db.users.map(x=>({...publicUser(x),phone:x.phone,address:x.address})),events:db.events.slice(-100).reverse()});
 }
 return reply(res,404,{error:'Not found.'});
}
const server=http.createServer(async(req,res)=>{try{const route=new URL(req.url,'http://localhost').pathname;if(route.startsWith('/api/'))return await api(req,res,route);if(req.method!=='GET')return reply(res,405,{error:'Method not allowed'});const file=path.resolve(PUBLIC,'.'+decodeURIComponent(route==='/'?'/index.html':route));if(!file.startsWith(PUBLIC+path.sep))return reply(res,403,{error:'Forbidden'});try{const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':TYPES[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}}catch(e){console.error(e);reply(res,500,{error:'Server error.'});}});
init().then(()=>server.listen(PORT,()=>console.log(`Smile Labs Digital v0.7.5: http://localhost:${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
