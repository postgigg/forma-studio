(() => {
  const canonical='https://tryformastudio.netlify.app';
  if(location.origin!==canonical&&!['localhost','127.0.0.1'].includes(location.hostname)){location.replace(canonical+'/mac.html'+location.search);return;}
  const buy=document.querySelector('#purchase'),availability=document.querySelector('#availability'),receipt=document.querySelector('#receipt'),receiptStatus=document.querySelector('#receipt-status'),receiptHeading=document.querySelector('#receipt-heading'),keySection=document.querySelector('#key-section'),key=document.querySelector('#license-key'),download=document.querySelector('#mac-download'),again=document.querySelector('#check-receipt');
  let checking=false;
  const params=new URLSearchParams(location.search),attemptId=params.get('purchase');
  async function post(endpoint,value){const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});const data=await response.json();if(!response.ok)throw Error(data.message||'We could not finish that request. Please try again.');return data;}
  async function checkPurchase(){
    if(checking)return;checking=true;again.hidden=true;receipt.hidden=false;buy.hidden=true;
    try{for(let i=0;i<20;i++){
      const value=await post('/api/mac/receipt',{attemptId});
      if(value.status==='paid'||value.status==='activated'){
        receiptHeading.textContent=value.status==='paid'?'Your studio is ready.':'Your Mac is activated.';
        receiptStatus.textContent=value.status==='paid'?'Payment confirmed. Save your key, then open Forma on your Mac.':'This key has already activated a Mac. Open Forma on that computer to continue.';
        if(value.licenseKey){key.value=value.licenseKey;keySection.hidden=false;}
        if(value.download){const url=new URL(value.download);if(url.origin===canonical&&url.pathname.startsWith('/downloads/')&&url.pathname.endsWith('.dmg')){download.href=url.href;download.hidden=false;}}
        return;
      }
      if(value.status==='failed'){receiptHeading.textContent='Payment did not complete.';receiptStatus.textContent='Stripe could not confirm this payment. No license was issued. You can try checkout again when purchasing is available.';return;}
      if(value.status==='unavailable'){receiptHeading.textContent='Purchase unavailable.';receiptStatus.textContent='This payment is no longer eligible for activation.';return;}
      receiptStatus.textContent='Waiting for Stripe to confirm payment. Some payment methods take longer. You do not need to pay again.';
      if(i<19)await new Promise(resolve=>setTimeout(resolve,3000));
    }receiptStatus.textContent='Payment confirmation is taking longer. Keep this browser’s purchase page and check again; do not pay twice.';again.hidden=false;
    }catch(error){receiptStatus.textContent=error.message;again.hidden=false;}finally{checking=false;}
  }
  buy.addEventListener('click',async()=>{buy.disabled=true;availability.textContent='Opening secure Stripe checkout…';try{const value=await post('/api/mac/checkout',{}),url=new URL(value.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.username||url.password)throw Error('Checkout could not be verified.');location.assign(url.href);}catch(error){availability.textContent=error.message;buy.disabled=false;}});
  document.querySelector('#copy-key').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(key.value);document.querySelector('#copy-key').textContent='Copied';}catch{key.focus();key.select();receiptStatus.textContent='Your key is selected. Copy it and save it somewhere safe.';}});
  again.addEventListener('click',checkPurchase);
  fetch('/api/mac/status',{credentials:'same-origin'}).then(async response=>{if(!response.ok)throw Error();const value=await response.json();if(value.price?.amount!==4900||value.price?.currency!=='usd'||value.price?.type!=='one_time')throw Error();buy.disabled=!value.available;buy.textContent=value.available?'Get Forma for Mac — $49 ↗':'Mac edition coming soon';availability.textContent=value.available?'One-time purchase. Secure checkout with Stripe.':'We’re preparing the Mac release. Checkout is closed and no payment is collected.';}).catch(()=>{buy.disabled=true;buy.textContent='Purchasing unavailable';availability.textContent='We could not check the Mac release. Please try again later.';});
  if(attemptId&&/^[a-f0-9-]{36}$/.test(attemptId)){history.replaceState(null,'','/mac.html?purchase='+encodeURIComponent(attemptId));void checkPurchase();}
  else if(params.has('cancelled'))availability.textContent='Checkout cancelled. You have not activated a license.';
})();
