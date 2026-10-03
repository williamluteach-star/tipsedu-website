/* =====================================================================
   TIPS 報告產生器｜管理者登入 gate.js（2026-10-03 改：帳號＋密碼，只限管理者）
   打開 /report-gen/ 底下的頁面時先跳出登入視窗，帳號與密碼都對才顯示內容；
   勾選「記住」時，同一台電腦 30 天內不用再輸入（預設不勾）；右下角可登出。
   2026-10-03 起舊的共用密碼與舊的「記住」紀錄全部失效。
   說明：這是「擋一般人」的網頁鎖。網站程式碼放在公開的 GitHub，
   懂技術的人仍可直接讀原始碼；要完全保密需把資料夾搬出官網。
   換帳密：請 Claude 重新產生 SALT／HASH 兩個值（帳號與密碼都不寫進來；雜湊＝PBKDF2(帳號小寫＋\0＋密碼)）。
   ===================================================================== */
(function(){
  var SALT = 'f0af94ebcd88128ea41d2816c32efb1a';
  var ITER = 200000;
  var HASH = '99b0d0ea80b696e13e1f899530545a48328f515c7f2f1659f3769f1d83e3426b';
  var KEY = 'tips_rg_admin';
  var DAYS = 30;
  function logoutBtn(){
    var b = document.createElement('button'); b.type = 'button'; b.textContent = '🔒 登出';
    b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483646;padding:7px 14px;border:1px solid #d2d2d7;border-radius:980px;background:#fff;color:#1d1d1f;font-size:.8rem;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.08)';
    b.className = 'rg-logout no-print';
    b.onclick = function(){ try{ localStorage.removeItem(KEY); localStorage.removeItem('tips_rg_ok'); }catch(e){} location.reload(); };
    var add = function(){ document.body.appendChild(b); };
    if(document.body) add(); else document.addEventListener('DOMContentLoaded', add);
    var ps = document.createElement('style'); ps.textContent = '@media print{.rg-logout{display:none!important}}'; (document.head || document.documentElement).appendChild(ps);
  }
  try{ localStorage.removeItem('tips_rg_ok'); }catch(e){}   // 舊版共用密碼的記住紀錄一律清掉
  try{
    var o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if(o && o.h === HASH && o.exp > Date.now()){ logoutBtn(); return; }      // 已登入
  }catch(e){}
  var de = document.documentElement;
  de.classList.add('rg-locked');
  var st = document.createElement('style');
  st.textContent = 'html.rg-locked body>*:not(#rgGate){display:none!important}' +
    '#rgGate{position:fixed;inset:0;z-index:2147483647;background:#f4f1ec;display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif}' +
    '#rgGate .bx{background:#fff;border-radius:18px;box-shadow:0 8px 30px rgba(40,30,20,.12);padding:26px 24px;width:100%;max-width:360px;text-align:center}' +
    '#rgGate h1{font-size:1.15rem;margin:6px 0 4px;color:#1d1d1f}#rgGate p{font-size:.85rem;color:#6e6e73;margin:0 0 14px}' +
    '#rgGate input[type=password],#rgGate input[type=text]{width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #d2d2d7;border-radius:12px;font-size:1rem;margin-bottom:8px}' +
    '#rgGate button{width:100%;margin-top:12px;padding:12px;border:0;border-radius:980px;background:#1d1d1f;color:#fff;font-size:1rem;font-weight:700;cursor:pointer}' +
    '#rgGate label{display:flex;gap:6px;align-items:center;justify-content:center;font-size:.8rem;color:#6e6e73;margin-top:10px}' +
    '#rgGate .er{color:#c0392b;font-size:.85rem;margin-top:8px;display:none}';
  (document.head || de).appendChild(st);
  function hex(buf){ return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function bytes(h){ var a = new Uint8Array(h.length / 2); for(var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i*2, 2), 16); return a; }
  function derive(user, pw){
    pw = String(user || '').trim().toLowerCase() + '\u0000' + pw;
    var c = window.crypto && window.crypto.subtle;
    if(!c) return Promise.reject(new Error('nosubtle'));
    return c.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits'])
      .then(function(k){ return c.deriveBits({ name:'PBKDF2', salt:bytes(SALT), iterations:ITER, hash:'SHA-256' }, k, 256); })
      .then(hex);
  }
  function show(){
    if(document.getElementById('rgGate')) return;
    var g = document.createElement('div');
    g.id = 'rgGate';
    g.innerHTML = '<form class="bx" autocomplete="off"><div style="font-size:2rem">🔒</div><h1>TIPS 內部工具｜管理者登入</h1><p>只限管理者使用</p>' +
      '<input type="text" id="rgUser" placeholder="帳號" autocomplete="username" autocapitalize="off" spellcheck="false">' +
      '<input type="password" id="rgPw" placeholder="密碼" autocomplete="current-password">' +
      '<button type="submit" id="rgBtn">進入</button>' +
      '<label><input type="checkbox" id="rgRem">這台電腦記住 30 天（公用電腦請勿勾選）</label>' +
      '<div class="er" id="rgErr">帳號或密碼不對，請再試一次</div></form>';
    document.body.appendChild(g);
    var f = g.querySelector('form'), us = document.getElementById('rgUser'), pw = document.getElementById('rgPw'), er = document.getElementById('rgErr'), bt = document.getElementById('rgBtn');
    us.focus();
    f.onsubmit = function(ev){
      ev.preventDefault();
      bt.disabled = true; bt.textContent = '確認中…'; er.style.display = 'none';
      derive(us.value, pw.value).then(function(h){
        if(h === HASH){
          if(document.getElementById('rgRem').checked){ try{ localStorage.setItem(KEY, JSON.stringify({ h:h, exp:Date.now() + DAYS*864e5 })); }catch(e){} }
          de.classList.remove('rg-locked'); g.remove(); logoutBtn();
        }else{
          er.textContent = '帳號或密碼不對，請再試一次'; er.style.display = 'block'; pw.value = ''; pw.focus();
        }
      }, function(){
        er.textContent = '這個瀏覽器無法驗證密碼，請改用 Chrome／Safari 並以 https 開啟'; er.style.display = 'block';
      }).then(function(){ bt.disabled = false; bt.textContent = '進入'; });
    };
  }
  if(document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
