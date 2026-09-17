// Isolated browser acceptance pages; never mounted by the owner application.
const style = `:root{font-family:Tahoma,sans-serif;color-scheme:light;color:#1c2934;background:#f3f5f7}body{margin:0;padding:24px;direction:rtl}main{max-width:650px;margin:5vh auto;background:#fff;border:1px solid #dbe1e6;border-radius:16px;padding:28px;box-shadow:0 8px 24px #15233108}h1{font-size:1.4rem;line-height:1.7}p{line-height:1.9}button,a.action{font:inherit;display:inline-block;margin:8px 0 8px 8px;padding:12px 18px;border:1px solid #1d5e66;border-radius:8px;background:#1d5e66;color:white;text-decoration:none;cursor:pointer}button.secondary{color:#1d5e66;background:white}button:disabled{opacity:.5;cursor:wait}.notice{font-size:.85rem;background:#fff6db;color:#614600;padding:10px;border-radius:8px}.muted{color:#576574;font-size:.9rem}label{display:block;margin-top:16px}input{box-sizing:border-box;width:100%;padding:12px;margin-top:8px;font:inherit;border:1px solid #9daab4;border-radius:8px}#status{min-height:1.9em}a{color:#145860}[hidden]{display:none!important}@media(max-width:500px){body{padding:12px}main{padding:18px;margin:12px auto}}`;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function page(title: string, body: string, script: string, nonce: string) {
  if (!/^[a-zA-Z0-9_-]{20,100}$/.test(nonce)) throw Error("Invalid acceptance script nonce");
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${style}</style></head><body><main><p class="notice">آزمون کنترل‌شدهٔ ورود — بدون اتصال به گوگل یا اطلاعات سبد شخصی</p>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ""}</body></html>`;
}

export function loginPage(nonce: string) {
  return page("آزمون ورود خصوصی", `<h1>ورود خصوصی</h1><p>در این صفحه، ورود مالک و رد دسترسی دیگران را بررسی می‌کنیم. از حساب یا رمز واقعی استفاده نمی‌شود.</p><button id="login" type="button">آزمایش ورود</button><p id="status" role="status" aria-live="polite"></p>`, `
const button=document.querySelector('#login'),status=document.querySelector('#status');
button.addEventListener('click',async()=>{button.disabled=true;status.textContent='در حال آغاز آزمون…';try{const response=await fetch('/auth/google/start',{method:'POST',credentials:'same-origin',headers:{'X-ASHA-Intent':'owner-login'}});const result=await response.json();if(!response.ok||typeof result.authorizationUrl!=='string')throw Error();const target=new URL(result.authorizationUrl,location.origin);if(target.origin!==location.origin||target.pathname!=='/__test/provider')throw Error();location.assign(target.href);}catch{status.textContent='آغاز ورود ناموفق بود؛ هیچ دسترسی‌ای فعال نشد.';button.disabled=false;}});
`, nonce);
}

export function providerPage(nonce: string, transaction: string) {
  if (!/^[a-zA-Z0-9_-]{20,150}$/.test(transaction)) throw Error("Invalid synthetic transaction");
  return page("انتخاب هویت ساختگی", `<h1>کدام مسیر را آزمایش کنیم؟</h1><p class="muted">این صفحه ارائه‌دهندهٔ هویت ساختگی است؛ اطلاعات حساب گوگل وارد نکن.</p><form method="post" action="/__test/provider"><input type="hidden" name="transaction" value="${escapeHtml(transaction)}"><button name="choice" value="owner" type="submit">مالک آزمایشی</button><button class="secondary" name="choice" value="non-owner" type="submit">کاربر غیرمجاز</button><button class="secondary" name="choice" value="cancel" type="submit">لغو ورود</button></form><p id="status" role="status"></p>`, `
const form=document.querySelector('form');let pending=false;
form.addEventListener('submit',async event=>{event.preventDefault();if(pending)return;pending=true;const buttons=[...form.querySelectorAll('button')];buttons.forEach(button=>{button.disabled=true;});try{const data=new URLSearchParams({transaction:form.elements.transaction.value,choice:event.submitter.value});const response=await fetch('/__test/provider',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded','X-ASHA-Intent':'test-provider'},body:data.toString()});if(!response.ok)throw Error();const result=await response.json(),target=new URL(result.callbackUrl,location.origin);if(target.origin!==location.origin||target.pathname!=='/auth/google/callback')throw Error();location.assign(target.href);}catch{document.querySelector('#status').textContent='ادامهٔ ورود تأیید نشد؛ از صفحهٔ ورود دوباره آغاز کن.';pending=false;buttons.forEach(button=>{button.disabled=false;});}});
`, nonce);
}

export function protectedPage(nonce: string) {
  return page("آزمون دسترسی مالک", `<h1>فضای خصوصیِ آزمون</h1><p id="status" role="status" aria-live="polite">در حال بررسی نشست…</p><section id="private" hidden><p>ورود مالک آزمایشی تأیید شد.</p><label for="note">یادداشت ساختگی برای آزمون ذخیره و بازیابی</label><input id="note" maxlength="120" autocomplete="off" value=""><button id="save" type="button">ذخیرهٔ یادداشت آزمون</button><button class="secondary" id="logout" type="button">خروج</button><details><summary>بررسی انقضای ورود</summary><p class="muted">این کنترل فقط در همین اجرای جداگانهٔ آزمون وجود دارد.</p><button class="secondary" id="expire" type="button">منقضی‌کردن نشست آزمایشی</button></details></section><a id="retry" href="/" hidden>بررسی دوباره</a>`, `
const box=document.querySelector('#private'),status=document.querySelector('#status'),note=document.querySelector('#note'),retry=document.querySelector('#retry');
let generation=0,active=false,busy=false,controller=new AbortController(),timer=null;
function hide(message){generation++;active=false;controller.abort();controller=new AbortController();box.hidden=true;note.value='';status.textContent=message;retry.hidden=false;if(timer!==null){clearInterval(timer);timer=null;}}
async function check(){const current=generation;try{const response=await fetch('/auth/session',{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(current!==generation)return;if(response.status===401){hide('ورود پایان یافته؛ اطلاعات خصوصی پنهان شد.');location.replace('/');return;}if(!response.ok)throw Error();const result=await response.json();if(current!==generation)return;if(result.authenticated!==true)throw Error();if(!active){active=true;box.hidden=false;retry.hidden=true;status.textContent='نشست معتبر است؛ ذخیره فقط در حافظهٔ همین آزمون است.';await load(current);}}catch(error){if(error.name!=='AbortError'&&current===generation)hide('ارتباط قابل تأیید نیست؛ اطلاعات خصوصی موقتاً پنهان شد.');}}
async function load(current){const response=await fetch('/api/private-test-record',{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(current!==generation||!active)return;if(!response.ok)throw Error();const result=await response.json();if(current===generation&&active)note.value=result.note;}
document.querySelector('#save').addEventListener('click',async()=>{if(!active||busy)return;busy=true;const current=generation;try{const response=await fetch('/api/private-test-record',{method:'PUT',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json','X-ASHA-Intent':'owner-action'},body:JSON.stringify({note:note.value})});if(current!==generation)return;if(response.status===401){hide('نشست پایان یافته؛ ذخیره تأیید نشد.');return;}if(!response.ok)throw Error();const result=await response.json();if(current===generation&&active){note.value=result.note;status.textContent='یادداشت آزمون ذخیره شد.';}}catch(error){if(error.name!=='AbortError'&&current===generation)hide('ذخیره تأیید نشد؛ اطلاعات خصوصی پنهان شد.');}finally{busy=false;}});
document.querySelector('#logout').addEventListener('click',async()=>{hide('در حال خروج…');try{const response=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-ASHA-Intent':'owner-logout'}});if(!response.ok)throw Error();location.replace('/');}catch{status.textContent='خروج از سرور تأیید نشد؛ محتوا پنهان است. دوباره بررسی کن.';}});
document.querySelector('#expire').addEventListener('click',async()=>{try{const response=await fetch('/__test/expire',{method:'POST',credentials:'same-origin',headers:{'X-ASHA-Intent':'test-expire'}});if(!response.ok)throw Error();await check();}catch{hide('نتیجهٔ آزمون انقضا تأیید نشد.');}});
window.addEventListener('pagehide',()=>hide('در حال بررسی نشست…'));
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)hide('برای نمایش دوباره، اعتبار ورود بررسی می‌شود.');else{void check();if(timer===null)timer=setInterval(()=>{void check();},2000);}});
window.addEventListener('focus',()=>{void check();});
void check();timer=setInterval(()=>{void check();},2000);
`, nonce);
}

export function deniedPage(nonce: string) {
  return page("ورود تأیید نشد", `<h1>دسترسی داده نشد</h1><p>ورود لغو شده یا هویت، شرایط لازم را ندارد. هیچ اطلاعات خصوصی نمایش داده نشد.</p><a class="action" href="/">بازگشت به آزمون ورود</a>`, "", nonce);
}
