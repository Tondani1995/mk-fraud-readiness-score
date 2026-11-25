const { chromium } = require(process.env.MK_QA_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const BASE='https://www.mkfraud.co.za';
const people={
 essential:{org:'Marlowe Distribution Group',name:'Daniel Marlowe',email:'admin@mkfraud.co.za',role:'Operations Director',sector:'retail'},
 comprehensive:{org:'Alderstone Industrial Holdings',name:'Lena Alderstone',email:'info@mkfraud.co.za',role:'Finance Director',sector:'manufacturing'}
};
const log=(journey,stage,data={})=>console.log(JSON.stringify({journey,stage,...data}));
const profile={'PR-01':'50to250','PR-12':'50to250m','PR-02':'private','PR-04':'board','PR-03':'no','PR-05':'no','PR-06':'no','PR-07':'no','PR-08':'yes','PR-09':'no','PR-10':'no','PR-11':'yes'};
async function cookies(p){for(const r of [/^(Decline|Reject all|Necessary only|Reject)$/i]){const b=p.getByRole('button',{name:r}).first();if(await b.isVisible().catch(()=>false))await b.click().catch(()=>{});}}
async function visibleClick(p,selector){await p.locator(selector+':visible').first().click();}
async function assessment(browser,tier){
 const f=people[tier], ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const p=await ctx.newPage();p.setDefaultTimeout(30000);
 try{
 await p.goto(BASE+'/review',{waitUntil:'networkidle'});await p.locator('[data-review-start-form]').waitFor();await cookies(p);
 await p.locator('[name=fullName]').fill(f.name);await p.locator('[name=email]').fill(f.email);await p.locator('#review-org').fill(f.org);await p.locator('[name=roleTitle]').fill(f.role);
 const terms=p.locator('[data-review-start-form] input[type=checkbox]');if(!await terms.isChecked())await terms.click();await p.waitForTimeout(500);assert(await terms.isChecked(),'terms not selected');
 await p.getByRole('button',{name:'Start the assessment',exact:true}).click();
 await p.waitForURL('**/review/s/**',{timeout:60000});log(tier,'started',{organisation:f.org});
 const q=p.locator('[data-question-stage]');let n=0;
 while(n<250){
  await p.waitForFunction(()=>document.querySelector('[data-review-complete]')||document.querySelector('[data-question-stage]')||document.querySelector('[data-review-message][role=alert]'),null,{timeout:45000});
  if(await p.locator('[data-review-complete]').isVisible())break;
  if(await p.locator('[data-review-message][role=alert]').isVisible())throw Error('visible assessment save failure');
  const id=await q.getAttribute('data-question-id');
  const opts=q.locator('label:has(input[type=radio])');const multi=q.locator('[data-review-multi]');
  if(await multi.count()){
   const labels=multi.locator('label:has(input[type=checkbox])');const texts=await labels.allTextContents();const idx=texts.findIndex(t=>!/(none of|not applicable|don't know|do not know)/i.test(t));await labels.nth(Math.max(0,idx)).click();await multi.getByRole('button',{name:/Continue/}).click();
  }else{
   const values=await opts.evaluateAll(els=>els.map(el=>({v:el.querySelector('input').value,t:el.textContent})));
   if(!values.length)throw Error('no visible answer options');
   const pref=id==='PR-13'?f.sector:profile[id];
   let pick=values.findIndex(a=>a.v===pref);
   if(pick<0){const known=values.map((a,i)=>({...a,i})).filter(a=>!(/unknown|not_applicable|^na$|^none$/i.test(a.v)||/I don.t know/i.test(a.t)));
    pick=known.length?known[(tier==='comprehensive'?Math.floor(known.length/2):Math.max(0,Math.floor(known.length/3)))].i:0;}
   await opts.nth(pick).click();
  }
  await p.waitForFunction(prev=>document.querySelector('[data-review-complete]')||document.querySelector('[data-review-message][role=alert]')||document.querySelector('[data-question-stage]')?.getAttribute('data-question-id')!==prev,id,{timeout:60000});n++;
  if(n%10===0)log(tier,'answers saved',{n});
 }
 await p.getByRole('heading',{name:/Your answers are complete/i}).waitFor({timeout:30000});log(tier,'completed',{answers:n});
 await p.getByRole('link',{name:/View your Snapshot/}).click();await p.locator('[data-review-snapshot]').waitFor({timeout:90000});log(tier,'snapshot visible');
 const card=p.locator('[data-report-card="'+tier+'"]');await card.waitFor();const button=card.getByRole('button',{name:/Order/});assert(await button.isEnabled(),'Report order unavailable: coverage or ordering gate');
 await button.click();await p.locator('[data-order-step="1"]').waitFor({timeout:90000});log(tier,'checkout entered');
 await p.waitForLoadState('networkidle').catch(()=>{});await p.waitForTimeout(600);await visibleClick(p,'button:has-text("Continue to billing")');if(!await p.locator('[data-order-step="2"]').isVisible()){await p.waitForTimeout(1000);if(await p.locator('[data-order-step="1"]').isVisible())await visibleClick(p,'button:has-text("Continue to billing")');}await p.locator('[data-order-step="2"]').waitFor();log(tier,'billing reached');await p.locator('label:has(input[name=invoiceRequested][value=Yes])').click();await p.locator('#legalName').waitFor();log(tier,'invoice selected');
 await p.locator('#legalName').fill(f.org);await p.locator('#addressee').fill(f.name);await p.locator('#billingEmail').fill(f.email);await p.locator('#billingAddress').fill('Office 4, 12 Commerce Avenue, Cape Town, 8001, South Africa');
 await visibleClick(p,'button:has-text("Confirm order")');
 await p.locator('[data-order-step="3"]').waitFor({timeout:90000});const screen=await p.locator('[aria-labelledby="payment-heading"]').innerText();const reference=screen.match(/MKORD-\d{4}-[A-Z0-9]+/)?.[0]??screen.match(/Payment reference\s+([A-Z0-9-]+)/)?.[1]??null;
 const amount=screen.match(/R\s*[\d\s,.]+\s*incl\. VAT/)?.[0]??null;assert(/Invoice requested:\s*Yes/i.test(screen));log(tier,'order recorded',{reference,amount,invoiceRequested:true,paymentMade:false});
 }catch(e){let error=String(e.message).split('\n')[0].replace(/\/review\/s\/[^?\s]+/g,'/review/s/[private]').replace(/token=[^&\s]+/g,'token=[private]');log(tier,'blocked',{error,visibleAlert:await p.locator('[role=alert]').first().innerText({timeout:1000}).catch(()=>null)});process.exitCode=1}
 finally{await ctx.close()}
}
async function enquiry(browser){const ctx=await browser.newContext({viewport:{width:1440,height:900}});const p=await ctx.newPage();try{
 await p.goto(BASE+'/contact',{waitUntil:'domcontentloaded'});await p.locator('#name').waitFor();await cookies(p);
 await p.locator('#name').fill('Daniel Marlowe');await p.locator('#email').fill('admin@mkfraud.co.za');await p.locator('#company').fill('Marlowe Distribution Group');await p.locator('#service').selectOption('programme-design');await p.locator('#message').fill('We are reviewing procurement fraud exposure and would like to discuss a practical fraud governance and controls programme for our distribution operations. Please advise on the scope and an introductory conversation.');
 await p.getByRole('button',{name:/Send message/}).click();await p.getByRole('heading',{name:'Message received'}).waitFor({timeout:60000});const ref=(await p.locator('body').innerText()).match(/MKENQ-\d{4}-[A-Z0-9]+/)?.[0];log('service','received',{reference:ref});
 }catch(e){log('service','blocked',{error:String(e.message).split('\n')[0]});process.exitCode=1}finally{await ctx.close()}}
async function booking(browser){const ctx=await browser.newContext({viewport:{width:1440,height:900}});const p=await ctx.newPage();try{
 await p.goto(BASE+'/contact',{waitUntil:'domcontentloaded'});await cookies(p);await p.locator('[data-calendly-inline-widget] iframe').waitFor({timeout:60000});const frame=p.frameLocator('[data-calendly-inline-widget] iframe');
 const day=frame.locator('button[data-testid="calendar-day-button"]:not([disabled]):visible, button[aria-label*="available" i]:not([disabled]):visible').first();await day.waitFor({timeout:30000});const date=await day.getAttribute('aria-label');await day.click();log('meeting','date selected',{date});
 const time=frame.locator('button[data-testid="time-slot"]:visible, button[data-container="time-button"]:visible').first();await time.waitFor({timeout:30000});const slot=await time.innerText();await time.click();log('meeting','time selected',{slot});const next=frame.getByRole('button',{name:/^(Next|Confirm)$/i}).first();await next.waitFor({state:'visible',timeout:20000});await next.click();log('meeting','booking details opened');
 await frame.locator('input[type=email]:visible').first().waitFor({timeout:30000});
 const full=frame.locator('input[name="full_name"]:visible,input[name="name"]:visible,input[autocomplete="name"]:visible,input#full_name:visible,input[data-testid="invitee-name"]:visible').first();
 const first=frame.getByRole('textbox',{name:/first name/i}).first();
 if(await full.isVisible())await full.fill('Lena Alderstone');else if(await first.isVisible()){await first.fill('Lena');await frame.getByRole('textbox',{name:/last name/i}).first().fill('Alderstone')}else{const field=frame.getByRole('textbox',{name:/^name\b/i}).first();if(await field.isVisible())await field.fill('Lena Alderstone');else await frame.locator('input[type=text]:visible').first().fill('Lena Alderstone');}
 await frame.locator('input[type=email]:visible').first().fill('info@mkfraud.co.za');log('meeting','contact details entered');
 const textarea=frame.locator('textarea').first();if(await textarea.isVisible())await textarea.fill('Discussion of fraud risk governance and control design for industrial operations.');
 await frame.getByRole('button',{name:/Schedule Event|Confirm booking/i}).click();await frame.getByText(/You are scheduled|You're scheduled|Your event has been scheduled|Confirmed/i).first().waitFor({timeout:60000});log('meeting','booked',{date,slot});
 }catch(e){log('meeting','blocked',{error:String(e.message).split('\n')[0]});process.exitCode=1}finally{await ctx.close()}}
(async()=>{const b=await chromium.launch({headless:true,args:['--no-sandbox']});try{await booking(b)}finally{await b.close()}})().catch(e=>{console.error('Runner failed',e.name,String(e.message).split('\n').slice(0,5).join(' | '));process.exitCode=1});
