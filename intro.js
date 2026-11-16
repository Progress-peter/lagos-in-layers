// Opening animation: an Eyo masquerade drawn as a dot matrix that lights up from the bottom,
// with a fixed-width building counter underneath. Holds until the map is ready.
(() => {
  const TOTAL = 2176483, DIGITS = 7;
  const AL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const G = {"w":48,"h":100,"p":"fef7e6faebdaf0e2d2eee0d0eddfceebddcde9dbcbe4d7c7ccd3ecdfd2c3dbcfbfd5cabbd3c196bbc2dcafb6d3b0b3b9a7adcab7ac92a3a8bfa0a7c69ca2c09ca1b8a2a6ae969fbf949bba969cb49198b68d96b69197ad8d93b097999f8890b08a90a6868dabb49e6c848ba58888948288a17c84a47f859b86807979809a797c907179939e773b6b6a7570738780736161687f726659585d6d2b68c1665c50584f444d4f5e1d315741404222427b2d2b2f191718","d":"LLKK~LL~KI~Ln~KM~LVK~LJKLLKKKJJ~KPLK~LMKJ~LH~KHJJJK~JGKJ~KJLKK~LIKJ~LF~KG~JPKJKKJ~KN~JE~LE~KF~JJHH~JX~HF~KF~JN~HG~JI~HG~GG~HE~JN~HMJJ~HE~GE~FFEEFGGHHH~JI~HL~GFHH~GEFEEEFE~DGE~GF~JF~HE~GMFEEEF~EEDDEE~DECDDDEF~GE~HFGHH~GEFF~EHDDDCDE~DI~CE~DEE~GJFEFEEEDEE~DICC~BECCCDDCC~DIEGGF~GFFE~DE~CGD~CGBCNNHBBCC~DLEFFGGFGFEDDD~COBAPovvviMBCC~DKEDDEEFED~CSBR0yw5553HBC~DG~EFDDDCED~CSAE05~zF5PA~CH~EFDDCCDDD~CQBBi6~zG5wAABB~CEDDEEEDDCCDD~CRAMs1zzzmrrwyLBBBAAACDD~EFCCE~DF~CLBAAissxy0011144110viLBD~EEDCCBED~EE~DE~CGAALv4433~5K3336MBFEEFDCBJEDEFF~EFD~CEBGx633~5E~3H~5E3tECEFFEDCCvDFDDFGGFFDDDCCBB07~5E3322244tty555ytDBEGGGEEBiiBBCCFFGFDCBBAAAK4~5E444tu22qkkkwyuBCCDFGGFGBMvBkLAABDEEFBRxveHH~5F224ut2nkquqWBDBCDFGGGFCFvKByyiMKACEFBe7336y25532u24uyqcqyyyPABCEDCGGGFBoRBG33340MACDCBe3335mk26yu2yuqlg2ugqPAACBFKDGGBRvBFG~5E34RACBBAWwQIITuuqu2tunjutnZcevMAA0xBGCJxHCGG3~5F3RAJGBCINOXfmnwuquwqkknqVcU36Mv7LBEBvRBGGGtt2~5E4BvRIQQOOOQYqynnuuwnVqqSVOm547RABARvB~GEkkky~5EMvLUXQNOalquwjnuuucZppQTTQ27eILHKxJCGGGFtoek2552vkUXbbbrrqqqucjwuncZppQTTSq2eovvxRBGGGFCooWek554xQmXmhllnnnprcduunZZpnQTUhOe05wpqRBBCBBBeeWeWr2oOTmdmrjZadgnpYdqrlZZplQTUjUN55nMiiRGJJHMkWeWePoPOYjhlrqcVadhnYdqrjVZpjQSUlbNX55MiR~sF0eeWWkWPOTYhdjpuqcZXcpXdrrgVVpjQQUlfQN55RMiisiiiyWeWWkWNTXYhYhqqungcqpXcqrgVYngQQUjfTNz5qiiv00222SeWWeSOUUYhYgnqurllwqUaprdUYlgSQUhbTOw44~3G5yScWSWOTUQahYdlnqqlluqUbprdUXjgSQUjbTN273yyuw3tisPeWPSSUTQahXdjjngglqpUXmrdUXhdQQUjaTNu2qkkeZeMi1PeePVVUTQdhXbjllcnlqmXXdpdUYfbQQVmXTNq2qtueVgZPWPWeWZUTQQffXYjpggnlqlbhjrbUYfbTOYmXTNntukegVljTQPWeVZTQQQjfYdjljnllpjaamraUYfbTOYjXTOnukeeZVdbaYPWWZYTQOTmdYajlnpnlpjXUrraUYfbTOYhUTOgtukugVZffTPPVZYTQQXpdXYfjlnnjqpTTupaUYfaTOYdUTOZtquecZUafUPPSaXTQTapdaaaggjggrrUZupbUXfaSQVbTTQVqkqVVVjaZaPPSaUTUTdpda~dEadjurSZulbXYfZSScYTSQSqkgZZSlpdaWQUbUTUThmdabddccdlunQgqddYadZVahdUQQSqucgcSZljdunTaVTTTlmdaabbddhnwuQgnldVZcZUadjpZOSnqgcZcVcdcqnTdZQQXmmdcddaYYdqwuQlljZVVZgVqcVlnSQnjgZSVZZdakjTaZQTamjddfbaaaguwlOqggZSSSVlqVUSglQgngZVVZVdaedQdVQTdmjdddbaaYnuuVSqgncVSOV2qTTTUZYnpnVZZVTbdcVTcVQUjljdddaYXdrquTUrlpcVSOc2hUTTQThlggcZZcQXaZTXaVQYlljfdbYUXpuprQdrppaZSNlyYTTTQQhccgcVVjTQUcUUZUQYjjhddaUTgyuulQluqrdYUNwuTQTQQQhcgggVSnUTXZSQUTQlpjhlaXUUuyqwdTUlrpgUQVwhTQTQQTjclggSUnhTUbTQUcnuunp~uEqytgpOQQOdpmUOpraQO~QEjZgggVSnlXbYQQXdnnquwutwug4766wjUOXqqdZaXYQONOOOccZcZVQlupTTQYnVdgquuwwuuZ4~7J666wNTQNNIIINVSZVSOcyuQQQVgcjcluurnnjVyut466~7I2Qqy62ukWeWWQOIOwbNQQVnwpccgnldhTZyZTnjgqu2446772luy~7F66641xt0qcQagnupcadjaUUQgyaYdhZVVZclut2gSVck476~7LdhdgrnccdjhaYQrwYahldhgVZVdnuaSVZcVkwyy266~7GjUQZpnZZZlplYTwwUajjcZlgVYalwcQaSgQOTTNNZckuu244hdNUjmVTUhjbTVwuTajjcVdnpafpwgOaScgQOTYNZgSSNbUWfmOThmaTUafXTdwrTYhlaUaalpgpwnOdSVpjVZdQSukZQq0efmXOhhbUUafXTjwnTYdjbUYYZnwqwnNbYTcnnkgZOqukx1qbfmbOhhbTTYYXUnwlTYbhfUYYZguwulNaaTTgqnggOc110rbXfmhOdmaXUUUTarwhTabmdSaaZgjwwqNTaUQSclllYQ44qumbhmhOXpbQQTTTdwwdTaajrUacchhq2yOTdUUQQVcgjQutqwrfmpmOQmmQOQQYwwrdTaYfrdZcdghq22djdXXTOQTTTQSqqwrfmpmTOhraOQQlwppdUYYdpdYcggjuy2pcjVYYQOOOQUQduyrmmpmYOdpjTTTuphmfXbYbpjVggguwwyync~ZEVUUaYOdwyphmphbOajmUQYyndmbXYYamndjpruuwuwupgVVagjjdaOhyymhmpfdOUhmfTnypYhbXYXYmpdppdpruurpuurjZcggdbQf2tjfprhfQQhhppuywXfbYbXYmpYXQYrrurpnruwtulgXfaQmywffjjhhTObhlpquwbbbYYXYmpfaUn~rEpjnruuuqjhrjl2ywfhuyuqgNYaYguqwjXYYYXYmphbbjpqrppgjprqpqpchrwyywdby42yjTaYXauuyrTYYYXYmphhdZn~pEddprpgnpndpwyyuaTt42ynYXUUYquwwYaYXXYppgjhZg~pEcZnrpcclljmuywuUOt4ttlXUUXUpuuwrdYXXYppjllZcrpppcZnppgZdgfjr2ypOQt4uucTUUXTjrruwlYXXarnlljdarppmZYmpmgZZaahr2yQOgt4kulO~TEhjhprrbXXbrjnpggZpppmUYmpjjcdXUfr2nNdg24kutfOOQXjbXmprjXUdrjqrjjcjpplUYmpfjddYTawwOOlZ46otx2yjQXmbTfjpmYUhpjupljgZprjUYmmbjfdbTjwTOjcg74o01674uUhXQbbfmdXmlnrnljjYhrdUYpmXhfbfbmZQnpgr7101464ttabUTXTUbfbpjuuplllcarfTbrfXjhdfbjXdugnq7~1E41ttnbTTQQQTYmrqurjlnpgXpdTfrbYmjhfbldulnnq7vxxx10ttqXXXOOONXuruulgpppnahaTfmTbrphfdburpnnp6vovoox42gTXhXTXbuwljndjrnllafTOwyhmphbYhpujmgnp64xvvx064UUXflprwwuhfdhnnlgjpwpQ272wwmu4yunffZfc001v0101uTUUflquqnjZXUgwyyytyt26774664674uwjjfpj~vEx000STUQdutqquwuuut662yuqqt4~1G4114442442~xF01oOYgnt1xkqy22ytu64ytugqo0vv~xH~1H0xx~0Eeat24440nquyytkk662tuckkv0vxvvxvvx~vH1010xx0y~1Fvonqutyugc672tucckooxxv~xFvv~xEv000~xE0xx0veWWgqquyucZ67ytugVctv11x0~xF0xx0xx~0GxxvooWWekkZZguucV6622tkVSex40xxx0xxx000xx~0Fx0xx011x1o14uqjdpcUy774qgSOPo1~0F1~0Kx~0F101146644tuqggSt7764yytt14~1E0~1E~0Fx00x00101~0F141oquuun644667774111011000x~0G"};
  G.d = G.d.replace(/~(.)(.)/g, (_, c, n) => c.repeat(AL.indexOf(n)));
  const COLS = G.w, ROWS = G.h;
  const el = document.getElementById('loading');
  if (!el) return;
  el.className = 'intro';
  el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Loading the map');
  const zeros = '0,000,000';
  el.innerHTML = `<div class="intro-art"><canvas></canvas></div><div class="intro-count"><b aria-hidden="true">${[...zeros].map(ch => `<i>${ch}</i>`).join('')}</b><span>of 2,176,483 buildings</span></div>`;
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  const cells = [...el.querySelectorAll('.intro-count i')];

  const hex = c => [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  const pal = [];
  for (let i = 0; i < G.p.length; i += 6) pal.push(hex(G.p.slice(i, i + 6)));
  const dots = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const c = G.d[y * COLS + x];
    if (c === '.') continue;
    const [r, g, b] = pal[AL.indexOf(c)];
    const l = 0.3 * r + 0.59 * g + 0.11 * b, dim = Math.round(22 + l * 0.22);
    dots.push({ x, y, lit: `rgb(${r},${g},${b})`, dim: `rgb(${dim},${dim},${dim + 3})`, t: (1 - y / ROWS) * 0.84 + Math.random() * 0.16 });
  }

  let w = 0, h = 0, P = 4, ox = 0, oy = 0;
  function size() {
    const r = cv.parentNode.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    P = Math.min(w / COLS, h / ROWS); ox = (w - P * COLS) / 2; oy = (h - P * ROWS) / 2;
  }
  size(); addEventListener('resize', size);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // HOLD keeps the finished figure on screen briefly so a fast load doesn't cut the fill off mid-flash.
  const T = reduce ? 400 : 2700, HOLD = reduce ? 0 : 400;
  const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const start = performance.now();
  let ready = false, gone = false, shown = '';
  window.lilReady = () => { ready = true; };
  function frame(now) {
    if (gone) return;
    const t = now - start, p = Math.min(1, t / T);
    // every digit is always on screen and only its brightness changes, so the counter never shifts
    const n = String(Math.round(TOTAL * ease(p))).padStart(DIGITS, '0');
    if (n !== shown) {
      shown = n;
      const txt = n.replace(/\B(?=(\d{3})+(?!\d))/g, ','), lead = txt.search(/[1-9]/);
      cells.forEach((c, i) => { c.textContent = txt[i]; c.classList.toggle('on', lead >= 0 && i >= lead); });
    }
    ctx.clearRect(0, 0, w, h);
    const r = P * 0.4;
    for (const d of dots) {
      const k = Math.min(1, Math.max(0, (p - d.t) / 0.05));
      ctx.fillStyle = k > 0.5 ? d.lit : d.dim;
      ctx.beginPath(); ctx.arc(ox + (d.x + 0.5) * P, oy + (d.y + 0.5) * P, r * (0.8 + 0.2 * k), 0, 6.2832); ctx.fill();
    }
    if (t >= T + HOLD && ready) {
      gone = true; el.classList.add('out');
      setTimeout(() => { el.hidden = true; el.innerHTML = ''; removeEventListener('resize', size); }, 750);
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
