/* =====================================================================
   TIPS 英典教育｜免費測驗中心 共用模組  tips-funnel.js（2026-10-02）
   ---------------------------------------------------------------------
   給 /tests/ 與各測驗頁共用。各頁在 </body> 前載入本檔，再呼叫 TIPSF.init({...})。
   本檔載入失敗時，測驗頁仍照原本方式運作（所有功能都是「外掛」上去的）。

   做的事：
   1. 來源判斷：第一次進站時判斷從哪裡來（FB／IG／LINE／Google／官網…），
      寫在名單表「結果摘要」欄最前面（例：來源：Facebook｜…）。家長不用填。
   2. 追蹤事件：開始作答 → Meta Lead＋GA test_start；完成 → CompleteRegistration
      ＋test_complete；按預約 → Schedule＋booking_*。
   3. 作答暫存：作答中每選一題就存在本機（48 小時），不小心關掉可接著做；送出後清除。
   4. 手機號碼：自動去掉「-」與空白、全形數字轉半形。
   5. 作答中收起大標題與 LINE 浮動鈕，翻頁直接看到題目。
   6. 結束頁：預約到班看報告（官方 LINE 一鍵帶入「已完成」訊息／轉傳給家長／請老師來電）。
      2026-10-03：轉傳給家長改用手機內建分享選單，叫不出來時改顯示 簡訊／LINE／複製訊息；訊息附電話。
   注意：帶有孩子姓名與手機的 LINE 連結一律用程式開啟，不寫在 <a href> 裡，
   避免被 GA「外部連結點擊」記錄到個資。
   ===================================================================== */
(function(){
  'use strict';
  var OA_ID = '%40tipsedu';
  var OA_ADD = 'https://line.me/R/ti/p/@tipsedu';
  var ADDRESS = '台中市南屯區黎明路一段295號';
  var PHONE_SHOW = '0905-547839';
  var KEEP_MS = 48 * 3600 * 1000;
  var cfg = null, started = false;

  /* ---------- 小工具 ---------- */
  function $(id){ return document.getElementById(id); }
  function ss(k, v){ try{ if(v===undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); }catch(e){ return null; } }
  function ls(k, v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k, v); }catch(e){ return null; } }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function wrap(name, after){
    var orig = window[name];
    if(typeof orig !== 'function') return;
    window[name] = function(){ var r = orig.apply(this, arguments); try{ after.apply(this, arguments); }catch(e){} return r; };
  }
  function fmtPhone(p){ return String(p||'').replace(/^(\d{4})(\d{3})(\d{3})$/, '$1-$2-$3'); }
  function maskPhone(p){ return String(p||'').replace(/^(\d{4})\d{3}(\d{3})$/, '$1-***-$2'); }

  /* ---------- 1. 來源判斷（第一次進站為準） ---------- */
  function detectSource(){
    var q; try{ q = new URLSearchParams(location.search); }catch(e){ q = { get:function(){ return null; } }; }
    var us = q.get('utm_source');
    if(us){ var um = q.get('utm_medium'), uc = q.get('utm_campaign'); return '標記:' + us + (um ? '/' + um : '') + (uc ? '/' + uc : ''); }
    if(q.get('gclid')) return 'Google廣告';
    var ua = navigator.userAgent || '';
    if(/Instagram/i.test(ua)) return 'Instagram';
    if(/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(ua)) return 'Facebook';
    if(/\bLine\//i.test(ua)) return 'LINE';
    var host = '';
    try{ host = document.referrer ? new URL(document.referrer).hostname : ''; }catch(e){}
    if(!host) return q.get('fbclid') ? 'Facebook/IG' : '直接開啟';
    if(/(^|\.)tips-edu\.com$/i.test(host)) return '官網';
    if(/(^|\.)google\./i.test(host)) return 'Google';
    if(/(^|\.)(facebook|fb)\.com$/i.test(host)) return 'Facebook';
    if(/(^|\.)instagram\.com$/i.test(host)) return 'Instagram';
    if(/(^|\.)(line\.me|lin\.ee)$/i.test(host)) return 'LINE';
    if(/(^|\.)(bing|yahoo)\./i.test(host)) return '其他搜尋';
    return '其他網站:' + host;
  }
  function source(){
    var s = ss('tf_src');
    if(!s){ s = detectSource(); ss('tf_src', s); }
    return s;
  }

  /* ---------- 2. 追蹤事件 ---------- */
  var EVT = {
    start:      { fb:'Lead',                 ga:'test_start' },
    complete:   { fb:'CompleteRegistration', ga:'test_complete' },
    book_line:  { fb:'Schedule',             ga:'booking_line' },
    book_share: { fb:'Contact',              ga:'booking_share' },
    book_call:  { fb:'Schedule',             ga:'booking_call' }
  };
  function track(stage){
    var e = EVT[stage]; if(!e) return;
    var test = cfg ? cfg.key : '';
    try{ if(window.fbq) fbq('track', e.fb, { content_name: test }); }catch(x){}
    try{ if(window.gtag) gtag('event', e.ga, { test_name: test, traffic_from: source() }); }catch(x){}
  }

  /* ---------- 3. 作答暫存 ---------- */
  function pkey(){ return 'tf_prog_' + cfg.key; }
  function save(){
    if(!cfg || !cfg.get || !started) return;
    try{
      var d = window.leadData ? leadData() : {};
      ls(pkey(), JSON.stringify({ v:1, t:Date.now(), t0:window.__t0 || Date.now(), lead:d, state:cfg.get() }));
    }catch(e){}
  }
  function load(){
    try{
      var o = JSON.parse(ls(pkey()) || 'null');
      if(!o || o.v !== 1 || Date.now() - o.t > KEEP_MS) { ls(pkey(), null); return null; }
      return o;
    }catch(e){ return null; }
  }
  function clearSaved(){ ls(pkey(), null); }
  function answeredCount(st){
    var n = 0;
    for(var k in st){ if(Object.prototype.toString.call(st[k]) === '[object Array]') st[k].forEach(function(a){ if(a !== null && a !== undefined) n++; }); }
    return n;
  }
  function resumeBanner(){
    var o = load(); if(!o) return;
    var intro = $('screen-intro'); if(!intro || intro.classList.contains('hidden')) return;
    var n = answeredCount(o.state);
    if(n === 0){ clearSaved(); return; }
    var box = document.createElement('div');
    box.className = 'tf-resume';
    box.innerHTML = '<b>📌 上次的作答還在</b><p>' + esc(o.lead && o.lead.name || '') + ' 已經做了 ' + n + ' 題，要接著做嗎？</p>' +
      '<div class="tf-row"><button type="button" class="tf-b tf-b-main" id="tfResume">接著作答 →</button>' +
      '<button type="button" class="tf-b" id="tfRestart">重新開始</button></div>';
    intro.insertBefore(box, intro.firstChild);
    setTimeout(function(){ try{ window.scrollTo(0, box.getBoundingClientRect().top + window.pageYOffset - 12); }catch(e){} }, 60);
    $('tfResume').onclick = function(){
      var L = o.lead || {};
      if($('stuName')) $('stuName').value = L.name || '';
      if($('stuClass')) $('stuClass').value = L.grade || '';
      if($('leadPhone')) $('leadPhone').value = L.phone || '';
      if($('leadLine')) $('leadLine').value = L.line || '';
      if($('leadConsent')) $('leadConsent').checked = true;
      try{ cfg.set(o.state); }catch(e){ clearSaved(); location.reload(); return; }
      window.__t0 = o.t0;
      started = true;
      box.remove();
      intro.classList.add('hidden');
      $('screen-test').classList.remove('hidden');
      document.body.classList.add('tf-testing');
      if(window.renderPage) renderPage();
      window.scrollTo(0,0);
    };
    $('tfRestart').onclick = function(){ clearSaved(); box.remove(); };
  }

  /* ---------- 4. 手機號碼正規化、錯誤訊息即時消失 ---------- */
  function normPhoneInput(el, errEl){
    if(!el) return;
    el.setAttribute('inputmode', 'numeric');
    el.addEventListener('input', function(){
      var v = el.value.replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/\D/g, '').slice(0, 10);
      if(v !== el.value) el.value = v;
      if(errEl && /^09\d{8}$/.test(v)) errEl.style.display = 'none';
    });
  }
  function clearErrOn(inputId, errId, evt){
    var el = $(inputId), er = $(errId); if(!el || !er) return;
    el.addEventListener(evt || 'input', function(){
      var ok = el.type === 'checkbox' ? el.checked : !!el.value.trim();
      if(ok) er.style.display = 'none';
    });
  }

  /* ---------- 樣式 ---------- */
  var CSS = '' +
  '.tf-testing header.top,.tf-testing .line-float{display:none !important}' +
  '.tf-resume{background:#fff7e6;border:1.5px solid #f3cf8a;border-radius:14px;padding:14px 16px;margin:14px 0 4px}' +
  '.tf-resume b{font-size:1rem}.tf-resume p{font-size:.88rem;margin:4px 0 10px;color:#5a4a2a}' +
  '.tf-row{display:flex;gap:8px;flex-wrap:wrap}' +
  '.tf-b{flex:1;min-width:120px;padding:11px 14px;border-radius:980px;border:1.5px solid #d2d2d7;background:#fff;font-family:inherit;font-size:.95rem;cursor:pointer;color:#1d1d1f}' +
  '.tf-b-main{background:#1d1d1f;border-color:#1d1d1f;color:#fff;font-weight:700}' +
  '.dv2{text-align:left}' +
  '.dv2 .ok{display:inline-block;background:#e8f5ee;color:#2b7a57;font-weight:700;font-size:.82rem;border-radius:980px;padding:4px 12px}' +
  '.dv2 h2{margin:10px 0 4px;font-size:1.25rem;line-height:1.4}' +
  '.dv2 .who{font-size:.85rem;color:#6e6e73;margin-top:4px}' +
  '.dv2 .locked{position:relative;margin:16px 0 6px;border-radius:16px;overflow:hidden;background:#f5f2ee}' +
  '.dv2 .locked svg{display:block;width:100%;height:150px;filter:blur(5px);opacity:.75}' +
  '.dv2 .lockcap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:12px}' +
  '.dv2 .lockcap .lk{font-size:1.6rem}.dv2 .lockcap b{font-size:.95rem;margin-top:4px;line-height:1.45}' +
  '.dv2 .lockcap span{font-size:.8rem;color:#494952;margin-top:6px;background:rgba(255,255,255,.8);border-radius:980px;padding:3px 10px}' +
  '.dv2 h3{font-size:1.05rem;margin:20px 0 10px}' +
  '.dv2 .lbl{font-size:.9rem;font-weight:700}' +
  '.dv2 .slots{display:flex;gap:6px;margin:8px 0 4px}' +
  '.dv2 .slots button{flex:1;padding:10px 2px;border:1.5px solid #d2d2d7;background:#fff;border-radius:12px;font-family:inherit;font-size:.85rem;color:#3a3a3c;cursor:pointer}' +
  '.dv2 .slots button.sel{background:#1d1d1f;border-color:#1d1d1f;color:#fff;font-weight:600}' +
  '.dv2 .bigbtn{display:block;text-align:center;text-decoration:none;font-weight:700;font-size:1.06rem;padding:15px 16px;border-radius:980px;margin-top:14px;cursor:pointer}' +
  '.dv2 .bigbtn.line{background:#06c755;color:#fff;box-shadow:0 4px 14px rgba(6,199,85,.28)}' +
  '.dv2 .bigbtn.ghost{background:#fff;color:#1d1d1f;border:1.5px solid #d2d2d7;font-size:.96rem;padding:12px 14px}' +
  '.dv2 .perks{background:#f0faf3;border-radius:14px;padding:12px 14px;margin-top:12px;font-size:.86rem;color:#2d4a38;line-height:1.75}' +
  '.dv2 .perks b{display:block;margin-bottom:2px;color:#1f5a35}' +
  '.dv2 .hint{font-size:.8rem;color:#6e6e73;text-align:center;margin-top:8px;line-height:1.6}' +
  '.dv2 .preview{background:#fff;border:1px dashed #9fd9b5;border-radius:12px;padding:10px 12px;font-size:.8rem;color:#2d4a38;white-space:pre-line;margin-top:10px;line-height:1.55}' +
  '.dv2 .preview em{font-style:normal;color:#6e6e73;display:block;margin-bottom:2px;font-size:.74rem}' +
  '.dv2 .alt{margin-top:20px;border-top:1px solid #eee;padding-top:14px}' +
  '.dv2 .alt b{font-size:.92rem}' +
  '.dv2 .small{font-size:.8rem;color:#6e6e73;margin-top:8px;line-height:1.6}' +
  '.dv2 .done-call{display:none;background:#e8f5ee;border-radius:12px;padding:10px 12px;font-size:.88rem;color:#2b7a57;margin-top:10px}' +
  '.dv2 .shalt{display:none;gap:8px;margin-top:10px;flex-wrap:wrap}' +
  '.dv2 .shalt .sbtn{flex:1;min-width:84px;text-align:center;text-decoration:none;font-weight:700;font-size:.92rem;padding:11px 6px;border-radius:12px;border:1.5px solid #d2d2d7;color:#1d1d1f;background:#fff}' +
  '.dv2 .shalt textarea{display:none;width:100%;min-height:130px;font-size:.8rem;border:1px solid #d2d2d7;border-radius:10px;padding:8px;font-family:inherit}' +
  '.dv2 .foot{font-size:.78rem;color:#6e6e73;text-align:center;margin-top:16px}';
  function injectCSS(){ var s = document.createElement('style'); s.id = 'tips-funnel-css'; s.textContent = CSS; document.head.appendChild(s); }

  /* ---------- 6. 結束頁：預約到班 ---------- */
  function lockedSVG(){
    var p = '';
    for(var r = 1; r <= 3; r++){
      var pts = [];
      for(var i = 0; i < 6; i++){ var a = -Math.PI/2 + i*Math.PI/3; pts.push((160 + r*20*Math.cos(a)).toFixed(1) + ',' + (75 + r*20*Math.sin(a)).toFixed(1)); }
      p += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="#c9c2b8"/>';
    }
    return '<svg viewBox="0 0 320 150" aria-hidden="true"><rect x="20" y="22" width="80" height="10" rx="5" fill="#d8cfc4"/><rect x="20" y="44" width="60" height="10" rx="5" fill="#d8cfc4"/><rect x="20" y="66" width="70" height="10" rx="5" fill="#d8cfc4"/><rect x="230" y="30" width="70" height="40" rx="8" fill="#d5e4f3"/><rect x="230" y="80" width="70" height="40" rx="8" fill="#dcefe4"/>' + p + '<polygon points="160,25 190,60 182,100 160,112 128,96 140,52" fill="rgba(61,127,193,.35)" stroke="#3d7fc1" stroke-width="2"/></svg>';
  }
  function bookingMsg(L, slot){
    return '已完成\n孩子：' + (L.name || '') + (L.grade ? '（' + L.grade + '）' : '') +
      '\n測驗：' + cfg.name + '\n家長手機：' + fmtPhone(L.phone) + '\n方便到班：' + (slot || '再跟老師約');
  }
  function oaURL(text){ return 'https://line.me/R/oaMessage/' + OA_ID + '/?' + encodeURIComponent(text); }
  function shareText(L){
    return '我做完 TIPS 英典教育的「' + cfg.name + '」了！報告要請家長到補習班，由老師當面解讀（免費）。點下面的連結、加入官方 LINE 就能預約時間：\n' + oaURL(bookingMsg(L, '')) +
      '\n不用 LINE 也可以直接打電話：' + PHONE_SHOW;
  }
  function shareURL(L){ return 'https://line.me/R/share?text=' + encodeURIComponent(shareText(L)); }
  function smsURL(L){ return 'sms:' + (/iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent || '') ? '&' : '?') + 'body=' + encodeURIComponent(shareText(L)); }
  function copyText(t, cb){
    function legacy(){
      var ok = false;
      try{ var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length); ok = document.execCommand('copy'); document.body.removeChild(ta); }catch(e){}
      cb(ok);
    }
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function(){ cb(true); }, legacy); else legacy();
  }
  function go(url){ setTimeout(function(){ location.href = url; }, 120); }

  function done(parentPresent){
    var L = window.leadData ? leadData() : {};
    var slot = '';
    var slots = ['平日下午','平日晚上','週六','週日'];
    var pp = !!parentPresent;
    var lineBlock =
      '<a class="bigbtn line" id="tfLine" href="' + OA_ADD + '">📩 加入官方 LINE，送出預約</a>' +
      '<div class="perks"><b>加入 TIPS 官方 LINE，您會收到：</b>✓ 到班時間確認與提醒<br>✓ 臨時要改時間，傳一句話就好<br>✓ 看完報告還有問題，直接問老師</div>' +
      '<p class="hint">LINE 打開後，訊息已經幫您打好，按「傳送」就完成預約。<br>還不是好友的話，順手按「加入好友」，之後的通知才收得到。</p>' +
      '<div class="preview" id="tfPrev"><em>會傳出的訊息</em>' + esc(bookingMsg(L, slot)) + '</div>';
    var shareBlock =
      '<a class="bigbtn line" id="tfShare" href="' + OA_ADD + '">📤 把預約連結傳給家長</a>' + '<div class="shalt" id="tfShareAlt"><a class="sbtn" id="tfSms" href="#">💬 簡訊</a><a class="sbtn" id="tfShLine" href="#">LINE</a><a class="sbtn" id="tfCopy" href="#">📋 複製訊息</a><textarea id="tfCopyBox" readonly></textarea></div>' +
      '<p class="hint">家長點開連結、加入官方 LINE，就能預約到班時間。</p>';
    var html =
      '<div class="card dv2">' +
        '<span class="ok">✅ 測驗完成</span>' +
        '<h2>報告已產出，請到班當面解讀</h2>' +
        '<div class="who">' + esc(L.name) + (L.grade ? '・' + esc(L.grade) : '') + '・' + esc(cfg.name) + '</div>' +
        '<div class="locked">' + lockedSVG() + '<div class="lockcap"><span class="lk">🔒</span><b>' + esc(cfg.contents) + '</b><span>到班由老師一對一解讀・免費</span></div></div>' +
        (pp
          ? '<h3>預約到班看報告</h3><div class="lbl">方便到班的時段（可略過）</div><div class="slots">' +
              slots.map(function(x){ return '<button type="button" data-slot="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
              lineBlock +
              (cfg.parentFill ? '' : '<a class="bigbtn ghost" id="tfShare2" href="' + OA_ADD + '">📤 用孩子的手機？傳連結給家長</a>' + '<div class="shalt" id="tfShareAlt"><a class="sbtn" id="tfSms" href="#">💬 簡訊</a><a class="sbtn" id="tfShLine" href="#">LINE</a><a class="sbtn" id="tfCopy" href="#">📋 複製訊息</a><textarea id="tfCopyBox" readonly></textarea></div>')
          : '<h3>最後一步：請家長預約到班</h3>' + shareBlock +
              '<a class="bigbtn ghost" id="tfLine" href="' + OA_ADD + '">📩 家長本人？直接加入官方 LINE 預約</a>') +
        '<div class="alt"><b>沒有用 LINE？</b>' +
          '<a class="bigbtn ghost" id="tfCall" href="#">📞 直接送出預約，請老師打電話約時間</a>' +
          '<div class="done-call" id="tfCallOk">✅ 已收到！老師會打 <b style="white-space:nowrap">' + esc(maskPhone(L.phone)) + '</b> 跟您約到班時間。</div>' +
          '<p class="small" id="tfCallNote">我們會打您留的手機 <b style="white-space:nowrap">' + esc(maskPhone(L.phone)) + '</b> 跟您確認時間。</p>' +
        '</div>' +
        '<p class="foot">TIPS 英典教育｜' + ADDRESS + '｜' + PHONE_SHOW + '</p>' +
      '</div>';
    var rs = $('screen-result');
    rs.innerHTML = html;
    rs.classList.remove('hidden');
    if($('screen-test')) $('screen-test').classList.add('hidden');
    document.body.classList.add('tf-testing');
    window.scrollTo(0,0);

    var logged = {};
    function log(status, extra){
      if(logged[status]) return; logged[status] = 1;
      try{ if(window.submitToGoogleForm) submitToGoogleForm({ name:L.name, grade:L.grade, phone:L.phone, line:L.line, status:status, result:extra || '' }); }catch(e){}
    }
    rs.querySelectorAll('.slots button').forEach(function(b){
      b.onclick = function(){
        slot = (slot === b.getAttribute('data-slot')) ? '' : b.getAttribute('data-slot');
        rs.querySelectorAll('.slots button').forEach(function(x){ x.classList.toggle('sel', x.getAttribute('data-slot') === slot); });
        var pv = $('tfPrev'); if(pv) pv.innerHTML = '<em>會傳出的訊息</em>' + esc(bookingMsg(L, slot));
      };
    });
    var lineBtn = $('tfLine');
    if(lineBtn) lineBtn.onclick = function(ev){
      ev.preventDefault();
      track('book_line');
      log('預約到班（按了 LINE）', '方便到班：' + (slot || '未選'));
      go(oaURL(bookingMsg(L, slot)));
    };
    /* 2026-10-03：傳給家長改用手機內建分享選單；叫不出來（多數 App 內建瀏覽器）就顯示 簡訊／LINE／複製訊息 */
    function showAlt(){ var a = $('tfShareAlt'); if(a) a.style.display = 'flex'; }
    ['tfShare','tfShare2'].forEach(function(id){
      var el = $(id); if(!el) return;
      el.onclick = function(ev){
        ev.preventDefault();
        track('book_share');
        log('預約到班（傳給家長）', '');
        if(navigator.share){
          try{ navigator.share({ text: shareText(L) }).catch(function(){ showAlt(); }); }catch(e){ showAlt(); }
        } else showAlt();
      };
    });
    var smsB = $('tfSms'); if(smsB) smsB.onclick = function(ev){ ev.preventDefault(); go(smsURL(L)); };
    var shL = $('tfShLine'); if(shL) shL.onclick = function(ev){ ev.preventDefault(); go(shareURL(L)); };
    var cpB = $('tfCopy'); if(cpB) cpB.onclick = function(ev){
      ev.preventDefault();
      var txt = shareText(L);
      copyText(txt, function(ok){
        if(ok){ cpB.textContent = '✅ 已複製'; return; }
        var box = $('tfCopyBox'); if(box){ box.value = txt; box.style.display = 'block'; box.focus(); box.select(); }
        cpB.textContent = '請長按下方文字複製';
      });
    };
    $('tfCall').onclick = function(ev){
      ev.preventDefault();
      track('book_call');
      log('預約到班（請老師來電）', '方便到班：' + (slot || '未選'));
      $('tfCallOk').style.display = 'block';
      $('tfCallNote').style.display = 'none';
      this.style.display = 'none';
    };
  }

  /* ---------- 家長檢測頁的預約按鈕 ---------- */
  function familyBook(){
    var v = function(id){ var el = $(id); return el ? (el.value || '').trim() : ''; };
    var msg = '已完成\n家長檢測：' + v('pName') + '\n家長手機：' + fmtPhone(v('pPhone')) + (v('cName') ? '\n孩子：' + v('cName') + (v('cGrade') ? '（' + v('cGrade') + '）' : '') : '') + '\n想預約到班聊聊孩子的學習';
    track('book_line');
    try{ if(window.submitToGoogleForm) submitToGoogleForm({ name:(v('cName') || v('pName')), grade:v('cGrade'), phone:v('pPhone'), line:v('pLine'), status:'預約到班（按了 LINE）', result:'家長檢測' }); }catch(e){}
    go(oaURL(msg));
    return false;
  }

  /* ---------- 初始化 ---------- */
  function init(c){
    cfg = c || {};
    source();                         // 先記下第一次的來源
    if(cfg.key === 'hub') return;     // 測驗中心首頁只記來源
    injectCSS();

    // 名單表：來源寫在「結果摘要」最前面（報告產生器只抓「代碼[…]」，不受影響）
    var origSubmit = window.submitToGoogleForm;
    if(typeof origSubmit === 'function'){
      window.submitToGoogleForm = function(fields){
        var f = {}; for(var k in fields) f[k] = fields[k];
        f.result = '來源：' + source() + (f.result ? '｜' + f.result : '');
        return origSubmit.call(this, f);
      };
    }

    if(cfg.key === 'family'){
      normPhoneInput($('pPhone'), $('ePPhone'));
      clearErrOn('pName', 'ePName'); clearErrOn('pConsent', 'ePConsent', 'change');
      window.pixelLead = function(){};          // 改由下面統一記錄
      wrap('startSurvey', function(){ var s = $('screen-survey'); if(s && !s.classList.contains('hidden') && !started){ started = true; track('start'); } });
      wrap('showResult', function(){ var r = $('screen-result'); if(r && !r.classList.contains('hidden')) track('complete'); });
      window.TIPSF.familyBook = familyBook;
      return;
    }

    normPhoneInput($('leadPhone'), $('errPhone'));
    clearErrOn('stuName', 'errName'); clearErrOn('stuClass', 'errClass', 'change'); clearErrOn('leadConsent', 'errConsent', 'change');

    wrap('startTest', function(){
      var t = $('screen-test');
      if(t && !t.classList.contains('hidden') && !started){
        started = true;
        document.body.classList.add('tf-testing');
        track('start');
        save();
      }
    });
    wrap('renderPage', save);
    wrap('pick', save);
    wrap('pickBG', save);
    wrap('showResults', function(){
      var t = $('screen-test');
      if(t && t.classList.contains('hidden')){ track('complete'); clearSaved(); started = false; }
    });
    window.showDone = function(parentDone){ done(cfg.parentFill ? true : parentDone); };
    resumeBanner();
  }

  window.TIPSF = { init:init, source:source, track:track, familyBook:function(){ return true; } };
})();
