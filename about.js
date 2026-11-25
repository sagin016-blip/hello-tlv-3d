/* HELLO TLV — "אודות הפרויקט" page. Text taken verbatim from the project prospectus
   (26000335_tel aviv procpect.pdf, pages 5 · 9 · 18 · 6). */
(() => {
const SECTIONS = [
  { w: 'STYLE', img: 'assets/renders/ext1.jpg', k: 'אורון רובע השלום',
    lead: ['יש ערים שחיים בהן.', 'ויש עיר שחיים אותה.', 'תל אביב.'],
    p: ['הבוקר התל אביבי מתחיל בבית הקפה הקבוע.<br>בשדרה שמכירים בעל פה, בריצה שלפני העבודה,<br>בשיחה עם השכנים, ובתחושה שכל מה שצריך נמצא במרחק הליכה.',
        'ככה בדיוק נולד אורון רובע השלום<br>לא עוד פרויקט מגורים, אלא רובע חדש שמשנה פני עיר,<br>שנבנה עבור מי שאוהב לחיות בדיוק תל אביבי.'] },
  { w: 'HOME', img: 'assets/renders/bal1.jpg', k: 'הפרויקט',
    lead: ['תגידו Hello לבית התל-אביבי החדש שלכם.'],
    p: ['פרויקט אורון רובע השלום כולל <b>600 יחידות דיור</b>, ב-<b>4 בניינים</b>, בני <b>9 ו-15 קומות</b>, בסטנדרט פרימיום בתכנונו של משרד האדריכלים <b>כנען שנהב</b>.',
        'בפרויקט דירות 5,4,3 חדרים, דירות גן ופנטהאוזים מיוחדים, מפרט נחשק הכולל מיזוג מיני מרכזי, מטבחים יוקרתיים, לובי מפואר, חניון תת קרקעי, תשתית להטענת רכבים חשמליים ועוד הרבה יותר.',
        'תגידו Hello לבית התל-אביבי החדש שלכם.'] },
  { w: 'LOBBY', img: 'assets/renders/lobby1.jpg', k: 'אדריכלות ועיצוב',
    lead: ['מתחם Hello מאגד 4 בניינים בעיצוב מעודן לכדי יצירה ארכיטקטונית מוקפדת.'],
    p: ['המתחם משתלב באופן הרמוני עם מרקם השכונה בה הוא מוקם ונהנה מהדיאלוג הזה. מצד אחד הסביבה האורבנית התוססת של דרך השלום ומצד שני השקט והפסטורליות של שכונת רמת חן גבעתיים.',
        'בכל שלב בתכנון, מתכנני המתחם שמו להם למשימה לתת מענה שלם לצרכיו של הדייר ומשפחתו החל מפיתוח השטח האיכותי, דרך תכנון החלל ועד בחירת החומרים.',
        'הפרויקט עוצב על מנת לספק חוויית מגורים תל-אביבית, נוחה ומרווחת, בהתאמה מושלמת למשפחה העירונית הצעירה.',
        'חיפוי הבניין בחומרים עמידים לתנאי האקלים, כמו אבן נסורה איכותית, אלומיניום וזכוכית משיג שתי מטרות: יצירת הופעה אדריכלית מכובדת מצד אחד, ומצד שני שימור ערך הנכס לאורך שנים.'] },
  { w: 'TLV', img: 'assets/renders/city1.jpg', k: 'המיקום',
    lead: ['אורון רובע השלום נמצא בסביבת מוקדי הבילוי הגדולים של תל אביב.'],
    p: ['במרחק הליכה ממתחם שרונה השוקק, רחוב הארבעה הייחודי, פארק וולפסון, רחוב כצנלסון המתחדש ושופינג בעזריאלי.',
        'בסביבת הפרויקט מחכים לכם מרכזי תעסוקה רבים כמו, מגדל אלקטרה, מגדלי אלון, קניון עזריאלי, קניון גבעתיים, מרכז רפואי אסותא השלום, בתי ספר וגנים ועוד...',
        'אורון רובע השלום, מאפשר נגישות מקסימלית בבחירת אמצעי תחבורה. הרובע קרוב לנתיבי איילון, סמוך לתחנת רכבת השלום, קו הסגול של הרכבת הקלה.'] },
];

const css = `
#about{background:var(--espresso);overflow-y:auto;overscroll-behavior:contain;scroll-behavior:smooth}
#about .x{position:fixed;top:18px;left:18px;z-index:4}
#about .ab-top{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 26px 18px 76px;
  background:linear-gradient(180deg,rgba(31,24,19,.92),rgba(31,24,19,0))}
#about .ab-top img{height:33px;width:auto}
#about .ab-top .k{font-size:12px;letter-spacing:.22em;color:var(--champagne);opacity:.8}
#about .ab-sec{position:relative;min-height:88vh;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);align-items:stretch;border-top:1px solid var(--line)}
#about .ab-sec:nth-child(even){grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)}
#about .ab-sec:nth-child(even) .ab-txt{order:2}
#about .ab-img{position:relative;overflow:hidden;min-height:340px}
#about .ab-img div{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.08);transition:transform 2.4s cubic-bezier(.2,.7,.2,1)}
#about .ab-sec.in .ab-img div{transform:scale(1)}
#about .ab-img::after{content:"";position:absolute;inset:0;background:linear-gradient(270deg,rgba(31,24,19,.55),rgba(31,24,19,0) 45%)}
#about .ab-sec:nth-child(even) .ab-img::after{background:linear-gradient(90deg,rgba(31,24,19,.55),rgba(31,24,19,0) 45%)}
#about .ab-txt{position:relative;padding:clamp(40px,7vw,96px) clamp(24px,5vw,80px);display:flex;flex-direction:column;justify-content:center;max-width:680px}
#about .ab-w{font-family:'Almoni',var(--display);font-weight:300;line-height:.9;font-size:clamp(40px,5.2vw,84px);white-space:nowrap;color:transparent;-webkit-text-stroke:1px var(--champagne);
  direction:ltr;text-align:right;letter-spacing:.01em;margin-bottom:26px;opacity:.9}
#about .ab-w b{font-weight:300;font-size:1.32em;-webkit-text-stroke:1px var(--copper)}
#about .ab-k{font-size:12px;letter-spacing:.24em;color:var(--copper);margin-bottom:14px}
#about .ab-lead{font-family:var(--sans);font-weight:600;font-size:clamp(24px,2.6vw,36px);line-height:1.25;color:var(--ink);margin-bottom:22px}
#about .ab-lead span{display:block}
#about .ab-lead span:nth-child(2){color:var(--champagne)}
#about .ab-txt p{font-size:clamp(15px,1.15vw,17px);line-height:1.85;color:var(--ink-dim);margin-bottom:14px;max-width:56ch}
#about .ab-txt p b{color:var(--ink);font-weight:600}
#about .ab-txt > *{opacity:0;transform:translateY(18px);transition:opacity .9s ease,transform .9s cubic-bezier(.2,.7,.2,1)}
#about .ab-sec.in .ab-txt > *{opacity:1;transform:none}
#about .ab-sec.in .ab-txt > :nth-child(2){transition-delay:.1s}
#about .ab-sec.in .ab-txt > :nth-child(3){transition-delay:.2s}
#about .ab-sec.in .ab-txt > :nth-child(n+4){transition-delay:.32s}
#about .ab-foot{padding:56px 26px 72px;text-align:center;border-top:1px solid var(--line);color:var(--ink-dim);font-size:13px;letter-spacing:.08em}
#about .ab-foot button{margin-top:18px;padding:12px 26px;border-radius:999px;border:1px solid var(--champagne);color:var(--espresso);background:var(--champagne);font-weight:600;letter-spacing:.04em}
@media (max-width:820px),(pointer:coarse) and (max-height:500px){
  #about .ab-sec,#about .ab-sec:nth-child(even){grid-template-columns:1fr;min-height:0}
  #about .ab-sec:nth-child(even) .ab-txt{order:0}
  #about .ab-img{min-height:46vh}
  #about .ab-txt{padding:34px 16px 48px}
  #about .ab-top{padding:14px 16px 14px 70px}
}
@media (prefers-reduced-motion:reduce){#about .ab-txt > *,#about .ab-img div{transition:none;transform:none;opacity:1}}
`;
document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);

const outline = (w) => `HELLO<b>${w[0]}</b>${w.slice(1)}`;
const el = document.createElement('section');
el.className = 'ovl'; el.id = 'about'; el.setAttribute('aria-label', 'אודות הפרויקט');
el.innerHTML = `<button class="x" aria-label="סגירה">✕</button>
<div class="ab-top"><div class="k">אודות הפרויקט · אורון רובע השלום</div><img src="assets/logo-tight.png" alt="HELLO TLV"></div>
<div class="ab-list">${SECTIONS.map((s) => `
  <article class="ab-sec">
    <div class="ab-txt">
      <div class="ab-w" aria-hidden="true">${outline(s.w)}</div>
      <div class="ab-k">${s.k}</div>
      <h2 class="ab-lead">${s.lead.map((l) => `<span>${l}</span>`).join('')}</h2>
      ${s.p.map((x) => `<p>${x}</p>`).join('')}
    </div>
    <div class="ab-img"><div style="background-image:url('${s.img}')"></div></div>
  </article>`).join('')}
</div>
<div class="ab-foot">לחיות בדיוק תל אביבי · דרך השלום, תל אביב<br><button type="button" data-ab="apts">לכל הדירות</button></div>`;
document.body.appendChild(el);

const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); }), { root: el, threshold: 0.18 });
el.querySelectorAll('.ab-sec').forEach((s) => io.observe(s));

function open() { el.scrollTop = 0; el.classList.add('on'); document.body.classList.add('ovl-open'); window.HELLO?.pause(true); el.focus?.(); }
function close() { el.classList.remove('on'); if (!document.querySelectorAll('.ovl.on').length) { document.body.classList.remove('ovl-open'); window.HELLO?.pause(false); } }
el.querySelector('.x').onclick = close;
el.querySelector('[data-ab="apts"]').onclick = () => { close(); window.HELLO_APT?.openGallery(); };
addEventListener('keydown', (e) => { if (e.key === 'Escape' && el.classList.contains('on')) close(); });

window.HELLO_ABOUT = { open, close };
})();
