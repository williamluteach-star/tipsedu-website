/* =====================================================================
   TIPS 報告產生器｜密碼視窗 gate.js（2026-10-02）
   打開 /report-gen/ 底下的頁面時先跳出密碼視窗，輸入正確才顯示內容；
   勾選「記住」時，同一台電腦 30 天內不用再輸入。
   說明：這是「擋一般人」的網頁鎖。網站程式碼放在公開的 GitHub，
   懂技術的人仍可直接讀原始碼；要完全保密需把資料夾搬出官網。
   換密碼：請 Claude 重新產生 SALT／HASH 兩個值（不要把密碼明文寫進來）。
   ===================================================================== */
(function(){
  var SALT = '7951710999c707c2e722190b9a42de04';
  var ITER = 150000;
  var HASH = 'c38fa4349222f4f2ae11d063bd3ef773da3af552b3753bf2e6e774d36db162ee';
  var KEY = 'tips_rg_ok';
  var DAYS = 30;
  try{
    var o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if(o && o.h === HASH && o.exp > Date.now()) return;      // 已解鎖
  }catch(e){}
  var de = document.documentElement;
  de.classList.add('rg-locked');
  var st = document.createElement('style');
  st.textContent = 'html.rg-locked body>*:not(#rgGate){display:none!important}' +
    '#rgGate{position:fixed;inset:0;z-index:2147483647;background:#f4f1ec;display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif}' +
    '#rgGate .bx{background:#fff;border-radius:18px;box-shadow:0 8px 30px rgba(40,30,20,.12);padding:26px 24px;width:100%;max-width:360px;text-align:center}' +
    '#rgGate h1{font-size:1.15rem;margin:6px 0 4px;color:#1d1d1f}#rgGate p{font-size:.85rem;color:#6e6e73;margin:0 0 14px}' +
    '#rgGate input[type=password]{width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #d2d2d7;border-radius:12px;font-size:1rem}' +
    '#rgGate button{width:100%;margin-top:12px;padding:12px;border:0;border-radius:980px;background:#1d1d1f;color:#fff;font-size:1rem;font-weight:700;cursor:pointer}' +
    '#rgGate label{display:flex;gap:6px;align-items:center;justify-content:center;font-size:.8rem;color:#6e6e73;margin-top:10px}' +
    '#rgGate .er{color:#c0392b;font-size:.85rem;margin-top:8px;display:none}';
  (document.head || de).appendChild(st);
  function hex(buf){ return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function bytes(h){ var a = new Uint8Array(h.length / 2); for(var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i*2, 2), 16); return a; }
  function derive(pw){
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
    g.innerHTML = '<form class="bx" autocomplete="off"><div style="font-size:2rem">🔒</div><h1>TIPS 內部工具</h1><p>請輸入密碼</p>' +
      '<input type="password" id="rgPw" placeholder="密碼" autofocus>' +
      '<button type="submit" id="rgBtn">進入</button>' +
      '<label><input type="checkbox" id="rgRem" checked>這台電腦記住 30 天</label>' +
      '<div class="er" id="rgErr">密碼不對，請再試一次</div></form>';
    document.body.appendChild(g);
    var f = g.querySelector('form'), pw = document.getElementById('rgPw'), er = document.getElementById('rgErr'), bt = document.getElementById('rgBtn');
    pw.focus();
    f.onsubmit = function(ev){
      ev.preventDefault();
      bt.disabled = true; bt.textContent = '確認中…'; er.style.display = 'none';
      derive(pw.value).then(function(h){
        if(h === HASH){
          if(document.getElementById('rgRem').checked){ try{ localStorage.setItem(KEY, JSON.stringify({ h:h, exp:Date.now() + DAYS*864e5 })); }catch(e){} }
          de.classList.remove('rg-locked'); g.remove();
        }else{
          er.textContent = '密碼不對，請再試一次'; er.style.display = 'block'; pw.select();
        }
      }, function(){
        er.textContent = '這個瀏覽器無法驗證密碼，請改用 Chrome／Safari 並以 https 開啟'; er.style.display = 'block';
      }).then(function(){ bt.disabled = false; bt.textContent = '進入'; });
    };
  }
  if(document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
