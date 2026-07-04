/* =========================================================================
   千葉県公立高校入試 対策教材 共通モジュール
   - 解答の正誤記録（localStorage）と間違い問題の復習キュー
   - 模試スコア履歴 / 日別学習統計（ポータルが集計に使う）
   - 復習タブの汎用UI / 模試用タイマー / 音声（リスニング・聞き取り）
   使い方: <script src="../chiba-common.js"></script> のあと Chiba.init('sugaku')
   ========================================================================= */
window.Chiba = (function(){
  let SUBJ = null;
  const k = n => `chiba_${SUBJ}_${n}_v1`;

  function load(n, def){
    try{ const v = JSON.parse(localStorage.getItem(k(n))); return v===null||v===undefined ? def : v; }
    catch(e){ return def; }
  }
  function store(n, v){ localStorage.setItem(k(n), JSON.stringify(v)); }
  function today(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  /* ---------- 正誤記録・復習キュー ----------
     item: {id, type:'choice'|'flash', q, opts?, a, e?, field?, lv?}
     choice: a=正解の選択肢番号 / flash: a=答えのHTML文字列
     間違えると復習キューに入り、復習で2連続正解すると卒業 */
  function record(item, ok){
    if(!SUBJ || !item || !item.id) return;
    const st = load('stats', {});
    const d = today();
    st[d] = st[d] || {n:0, c:0};
    st[d].n++; if(ok) st[d].c++;
    store('stats', st);

    const wq = load('wrong', {});
    if(!ok){
      const w = wq[item.id] || {miss:0, hit:0};
      w.item = item; w.miss++; w.hit = 0; w.last = Date.now();
      wq[item.id] = w;
    }else if(wq[item.id]){
      wq[item.id].hit = (wq[item.id].hit||0) + 1;
      wq[item.id].last = Date.now();
      if(wq[item.id].hit >= 2) delete wq[item.id];
    }
    store('wrong', wq);
    updateReviewBadge();
  }
  function wrongEntries(){ return load('wrong', {}); }
  function wrongItems(){
    return Object.values(wrongEntries()).map(w=>w.item).filter(Boolean);
  }
  function wrongCount(){ return Object.keys(wrongEntries()).length; }
  function clearWrong(){ store('wrong', {}); updateReviewBadge(); }

  /* ---------- 模試履歴 ---------- */
  function saveMoshi(rec){
    const h = load('moshi', []);
    h.push(rec);
    store('moshi', h.slice(-50));
  }
  function moshiHistory(){ return load('moshi', []); }

  /* ---------- 表示ヘルパー ---------- */
  function lvTag(lv){
    if(lv===3) return `<span class="c-lv c-lv3">差がつく</span>`;
    return '';
  }
  function updateReviewBadge(){
    const b = document.getElementById('reviewBadge');
    if(!b) return;
    const n = wrongCount();
    b.textContent = n>0 ? n : '';
    b.style.display = n>0 ? 'inline-flex' : 'none';
  }
  function esc(s){ return String(s); } // 教材データは自前なのでエスケープ不要

  /* ---------- 復習タブ（汎用） ---------- */
  let rev = null;
  function renderReview(elId){
    const area = document.getElementById(elId);
    const items = shuffle(wrongItems());
    if(!items.length){
      area.innerHTML = `<div class="test-intro">
        <h2>🔁 復習（まちがえた問題）</h2>
        <p style="margin:0">いま復習まちの問題はありません。🎉<br>
        確認問題・一問一答・模試などでまちがえた問題が自動でここにたまり、<b>2回連続で正解すると卒業</b>します。まちがいを恐れずどんどん解こう。</p>
      </div>`;
      return;
    }
    area.innerHTML = `<div class="test-intro">
      <h2>🔁 復習（まちがえた問題）</h2>
      <p>復習まちが <b style="font-size:16px">${items.length}問</b> あります。まちがえた問題こそ伸びしろ。<b>2回連続で正解すると卒業</b>です。</p>
      <div class="row">
        <button class="btn primary" id="revStart">復習スタート</button>
        <button class="btn" id="revClear">全部リセット</button>
      </div>
    </div>`;
    document.getElementById('revStart').onclick = ()=>{
      rev = {queue: items, total: items.length, done:0, ok:0, elId};
      renderReviewItem();
    };
    document.getElementById('revClear').onclick = ()=>{
      if(confirm('復習キューを空にしますか？（記録した問題が消えます）')){ clearWrong(); renderReview(elId); }
    };
  }
  function renderReviewItem(){
    const area = document.getElementById(rev.elId);
    if(!rev.queue.length){
      const pct = rev.total ? Math.round(rev.ok/rev.total*100) : 0;
      area.innerHTML = `<div class="result-card">
        <div class="result-score">${rev.ok} / ${rev.total}</div>
        <div style="font-size:18px;font-weight:700;margin-top:4px">復習 正答率 ${pct}%</div>
        <div class="result-msg">${wrongCount()>0 ? 'まだ残っている問題は、また明日たしかめよう。くり返しが記憶をつくる。' : '全問卒業！この調子。'}</div>
        <div class="row" style="justify-content:center;margin-top:14px"><button class="btn primary" id="revAgain">復習トップへ</button></div>
      </div>`;
      document.getElementById('revAgain').onclick = ()=>renderReview(rev.elId);
      return;
    }
    const item = rev.queue[0];
    const head = `<div class="qa-stat" style="display:flex;gap:14px;font-size:13px;color:var(--sub);margin:10px 0">
      <span>のこり <b style="color:var(--txt)">${rev.queue.length}</b> 問</span>
      <span>正解 <b style="color:var(--good,#66d9a8)">${rev.ok}</b></span>
      ${item.field?`<span style="margin-left:auto">${item.field}</span>`:''}
    </div>`;
    if(item.type === 'choice'){
      area.innerHTML = head + `<div class="q" id="revQ">
        <div class="q-txt">${lvTag(item.lv)}${esc(item.q)}</div>
        <div class="opts">${item.opts.map((o,i)=>`<div class="opt" data-oi="${i}">${esc(o)}</div>`).join('')}</div>
        <div class="expl" id="revExpl"><b>解説：</b>${esc(item.e||'')}</div>
        <div class="row" id="revNextRow" style="display:none;margin-top:10px"><button class="btn primary" id="revNext">次へ</button></div>
      </div>`;
      const qEl = document.getElementById('revQ');
      qEl.querySelectorAll('.opt').forEach(opt=>{
        opt.onclick = ()=>{
          if(qEl.classList.contains('answered')) return;
          qEl.classList.add('answered');
          const chosen = +opt.dataset.oi;
          const ok = chosen === item.a;
          qEl.querySelectorAll('.opt').forEach((o,i)=>{
            o.classList.add('disabled');
            if(i===item.a) o.classList.add('correct');
            if(i===chosen && !ok) o.classList.add('wrong');
          });
          if(item.e) document.getElementById('revExpl').classList.add('show');
          finishReviewItem(item, ok);
        };
      });
    }else{ // flash（自己採点）
      area.innerHTML = head + `<div class="q" id="revQ">
        <div class="q-txt">${lvTag(item.lv)}${esc(item.q)}</div>
        <div class="expl" id="revExpl"><b>答え：</b>${esc(item.a)}${item.e?`<div style="margin-top:6px">🔑 ${esc(item.e)}</div>`:''}</div>
        <div class="row" style="margin-top:10px" id="revCtl">
          <button class="btn primary" id="revShow">答えを見る</button>
        </div>
      </div>`;
      document.getElementById('revShow').onclick = ()=>{
        document.getElementById('revExpl').classList.add('show');
        document.getElementById('revCtl').innerHTML = `
          <button class="btn" id="revNG">× まだあやしい</button>
          <button class="btn primary" id="revOK">✓ できた</button>`;
        document.getElementById('revOK').onclick = ()=>finishReviewItem(item, true);
        document.getElementById('revNG').onclick = ()=>finishReviewItem(item, false);
      };
    }
  }
  function finishReviewItem(item, ok){
    record(item, ok);
    rev.queue.shift();
    rev.done++; if(ok) rev.ok++;
    const go = ()=>renderReviewItem();
    if(item.type==='choice'){
      const row = document.getElementById('revNextRow');
      if(row){ row.style.display='flex'; document.getElementById('revNext').onclick = go; return; }
    }
    go();
  }

  /* ---------- 模試ヘルパー ---------- */
  function startTimer(elId, targetSec){
    const el = document.getElementById(elId);
    const t0 = Date.now();
    const iv = setInterval(()=>{
      if(!document.getElementById(elId)){ clearInterval(iv); return; }
      const s = Math.floor((Date.now()-t0)/1000);
      const over = targetSec && s>targetSec;
      el.innerHTML = `⏱ ${fmt(s)}${targetSec?` <span style="opacity:.7">/ 目安 ${fmt(targetSec)}</span>`:''}`;
      el.classList.toggle('c-over', !!over);
    }, 1000);
    el.innerHTML = `⏱ 0:00${targetSec?` <span style="opacity:.7">/ 目安 ${fmt(targetSec)}</span>`:''}`;
    return { stop(){ clearInterval(iv); return Math.floor((Date.now()-t0)/1000); } };
  }
  function fmt(s){ return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

  function breakdownHtml(pool, answers){
    const by = {};
    pool.forEach((q,i)=>{
      const f = q.field || 'その他';
      by[f] = by[f] || {n:0, c:0};
      by[f].n++; if(answers[i]===q.a) by[f].c++;
    });
    return `<div class="c-breakdown">${Object.keys(by).map(f=>{
      const b=by[f]; const pct=Math.round(b.c/b.n*100);
      return `<div class="c-bd-row"><span class="c-bd-name">${f}</span>
        <span class="c-bd-bar"><span style="width:${pct}%"></span></span>
        <span class="c-bd-num">${b.c}/${b.n}</span></div>`;
    }).join('')}</div>`;
  }
  function moshiHistoryHtml(){
    const h = moshiHistory().slice(-5).reverse();
    if(!h.length) return '';
    return `<div style="margin-top:12px;font-size:12px;color:var(--sub)">
      <b>これまでの記録</b>（最新5回）<br>
      ${h.map(r=>{
        const d=new Date(r.t); const pct=Math.round(r.score/r.total*100);
        return `${d.getMonth()+1}/${d.getDate()} — ${r.score}/${r.total}（${pct}%）${r.sec?` ⏱${fmt(r.sec)}`:''}`;
      }).join('<br>')}
    </div>`;
  }

  /* ---------- 音声（リスニング・聞き取り） ---------- */
  const speech = {
    supported: typeof speechSynthesis !== 'undefined',
    playing: false,
    stop(){ if(this.supported){ speechSynthesis.cancel(); this.playing=false; } },
    voice(lang){
      const vs = speechSynthesis.getVoices();
      return vs.find(v=>v.lang===lang) || vs.find(v=>v.lang && v.lang.startsWith(lang.slice(0,2))) || null;
    },
    /* parts: [{text, pause?}] を順に読む */
    speakSeq(parts, opts, onEnd){
      if(!this.supported){ alert('この端末は音声再生（speechSynthesis）に対応していません。台本を見て練習しよう。'); if(onEnd)onEnd(); return; }
      this.stop();
      this.playing = true;
      const lang = opts.lang || 'ja-JP';
      const rate = opts.rate || 1;
      const v = this.voice(lang);
      let i = 0;
      const next = ()=>{
        if(!this.playing || i >= parts.length){ this.playing=false; if(onEnd)onEnd(); return; }
        const p = parts[i++];
        const u = new SpeechSynthesisUtterance(p.text);
        u.lang = lang; u.rate = rate;
        if(v) u.voice = v;
        u.onend = ()=>{ setTimeout(next, p.pause!==undefined ? p.pause : 450); };
        u.onerror = ()=>{ setTimeout(next, 200); };
        speechSynthesis.speak(u);
      };
      next();
    }
  };

  /* ---------- リスニング演習の汎用レンダラー ----------
     LIST: [{id, title, kind, note?, script:[{sp?, text, pause?}], qs:[{q,opts,a,e}]}]
     opts: {lang, rate, title, intro, playLabel?} */
  function renderListening(elId, LIST, opts){
    const area = document.getElementById(elId);
    let html = `<div class="test-intro">
      <h2>${opts.title}</h2>
      <p style="margin:0">${opts.intro}</p>
      ${speech.supported?'':'<p style="margin-top:8px;color:var(--warn,#ffb454)">⚠️ この端末は音声再生に対応していないため、「台本を見る」で読んで練習してください。</p>'}
    </div>`;
    LIST.forEach((ex,xi)=>{
      html += `<div class="unit open" style="margin-top:12px">
        <div class="unit-head" style="cursor:default">
          <span class="unit-grade">${ex.kind}</span>
          <span class="unit-title">${ex.title}</span>
        </div>
        <div class="unit-body" style="display:block">
          <div class="row" style="margin:10px 0">
            <button class="btn primary ls-play" data-xi="${xi}">▶ ${opts.playLabel||'放送を再生'}</button>
            <button class="btn ls-stop">■ 停止</button>
            <button class="btn ls-script" data-xi="${xi}">台本を見る</button>
          </div>
          <div class="expl ls-script-box" id="lsScript-${xi}">${ex.script.map(s=>`${s.sp?`<b>${s.sp}:</b> `:''}${s.text}`).join('<br>')}</div>
          ${ex.note?`<div style="font-size:12px;color:var(--sub);margin:6px 0">💡 ${ex.note}</div>`:''}
          <div class="quiz-box">
          ${ex.qs.map((q,qi)=>`<div class="q ls-q" data-xi="${xi}" data-qi="${qi}">
            <div class="q-txt"><span class="num">Q${qi+1}.</span>${q.q}</div>
            <div class="opts">${q.opts.map((o,oi)=>`<div class="opt" data-oi="${oi}">${o}</div>`).join('')}</div>
            <div class="expl"><b>解説：</b>${q.e}</div>
          </div>`).join('')}
          </div>
        </div>
      </div>`;
    });
    area.innerHTML = html;
    area.querySelectorAll('.ls-play').forEach(b=>{
      b.onclick = ()=>{
        const ex = LIST[+b.dataset.xi];
        b.textContent = '▶ 再生中…';
        speech.speakSeq(ex.script, opts, ()=>{ b.textContent = `▶ ${opts.playLabel||'放送を再生'}`; });
      };
    });
    area.querySelectorAll('.ls-stop').forEach(b=> b.onclick = ()=>{
      speech.stop();
      area.querySelectorAll('.ls-play').forEach(p=>p.textContent=`▶ ${opts.playLabel||'放送を再生'}`);
    });
    area.querySelectorAll('.ls-script').forEach(b=>{
      b.onclick = ()=>{
        const box = document.getElementById('lsScript-'+b.dataset.xi);
        const open = box.classList.toggle('show');
        b.textContent = open ? '台本を隠す' : '台本を見る';
      };
    });
    area.querySelectorAll('.ls-q').forEach(qEl=>{
      const ex = LIST[+qEl.dataset.xi], qi = +qEl.dataset.qi, q = ex.qs[qi];
      qEl.querySelectorAll('.opt').forEach(opt=>{
        opt.onclick = ()=>{
          if(qEl.classList.contains('answered')) return;
          qEl.classList.add('answered');
          const chosen = +opt.dataset.oi;
          const ok = chosen === q.a;
          qEl.querySelectorAll('.opt').forEach((o,i)=>{
            o.classList.add('disabled');
            if(i===q.a) o.classList.add('correct');
            if(i===chosen && !ok) o.classList.add('wrong');
          });
          qEl.querySelector('.expl').classList.add('show');
          record({id:`ls:${ex.id}:${qi}`, type:'choice', q:`【${ex.title}】${q.q}`, opts:q.opts, a:q.a, e:q.e, field:'リスニング'}, ok);
        };
      });
    });
  }

  function shuffle(a){
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }

  /* ---------- 共通CSSの注入 ---------- */
  function injectCss(){
    const css = `
    .c-badge{display:none;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:#ff6b6b;color:#fff;font-size:11px;font-weight:700;margin-left:4px;vertical-align:1px}
    .c-lv{display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:12px;margin-right:6px;vertical-align:2px}
    .c-lv3{background:rgba(255,107,107,.16);color:#ff8a8a;border:1px solid rgba(255,107,107,.4)}
    .c-timer{position:sticky;top:52px;z-index:15;display:inline-block;background:var(--panel2,#1c2330);border:1px solid var(--line,#2a3441);border-radius:20px;padding:5px 14px;font-size:13px;font-weight:700;margin:4px 0}
    .c-timer.c-over{color:#ff8a8a;border-color:#ff6b6b}
    .c-breakdown{margin-top:12px;text-align:left}
    .c-bd-row{display:flex;align-items:center;gap:10px;font-size:12px;margin:5px 0}
    .c-bd-name{width:92px;color:var(--sub,#8b98a9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .c-bd-bar{flex:1;height:7px;background:var(--panel2,#1c2330);border-radius:5px;overflow:hidden}
    .c-bd-bar span{display:block;height:100%;background:var(--accent,#4fc3f7);border-radius:5px}
    .c-bd-num{width:44px;text-align:right;font-weight:700}
    .ls-script-box{margin:4px 0 10px}
    `;
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  function init(subj){
    SUBJ = subj;
    injectCss();
    if(speech.supported) speechSynthesis.getVoices(); // 音声リストの先読み
    document.addEventListener('DOMContentLoaded', updateReviewBadge);
    updateReviewBadge();
  }

  return { init, record, wrongItems, wrongCount, clearWrong,
           saveMoshi, moshiHistory, moshiHistoryHtml,
           renderReview, startTimer, breakdownHtml, lvTag,
           renderListening, speech, shuffle, updateReviewBadge, today, load, store };
})();
