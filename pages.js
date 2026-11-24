/* HELLO TLV — "מפרט טכני" (text verbatim from 26000475_tel aviv mifrat.pdf) and "סרטון הפרויקט" placeholder pages. */
(() => {
const SPEC = [
  { h: 'סלון, פינת אוכל, חדרי שינה', img: 'assets/renders/liv1.jpg', items: [
    'ריצוף גרניט פורצלן 100/100 או 120/60 בשטח הסלון, מטבח, מסדרון, פינת אוכל ובחדרי השינה (למעט חדר שינה הורים, חדרים "רטובים" ומרפסות).',
    'פרקט תלת שכבתי בחדר שינה הורים.',
    'תריסי גלילה חשמליים בכל חדרי הדירה לרבות ביציאה למרפסת הסלון (למעט חדר ממ"ד, חדרי רחצה ושירותים וחדר שירות) או צלון כלוא.',
    'מערכת מיזוג מיני VRF כולל הנמכות גבס ופתחי אוורור דקורטיביים.',
    'חלונות עם זיגוג מסוג בידודית.',
    'שקעי חשמל מסדרה יוקרתית מסוג "גוויס" או ביטוצ\'ינו או ניסקו, או ש"ע.',
    'דלתות פנים מעוצבות עם צירים נסתרים, לרבות דלתות בגוון לבן/שמנת, כולל דלת בחדר הממ"ד.',
    'נקודת טלפון ותקשורת בכל חדר.',
    'נקודת מאור וחשמל במרפסת השמש.',
    'חיבור חשמל תלת פאזי.',
    'אינטרקום טלוויזיה במעגל סגור יוקרתי בכניסה לדירה.',
    'נקודת מים במרפסת השמש/מרפסת גג/בחצר.',
    'משטח מרוצף ביציאה לחצר (בדירות הגן).',
    'משטח מרוצף במרפסת השמש ממגוון דגמים וגדלים.'] },
  { h: 'חדרי רחצה ושירותים', img: 'assets/renders/bed1.jpg', items: [
    'אסלות תלויות עם מיכל הדחה סמוי בחדר רחצה הורים, חדר אמבטיה כללי ושירותי אורחים.',
    'אמבטיה אקרילית.',
    'ברזים יוקרתיים לרבות אינטרפוץ 4 דרך בחדרי הרחצה.',
    'חיפוי אריחי קרמיקה ממגוון דגמים וגדלים עד גובה התקרה.',
    'ריצוף קרמיקה ממגוון דגמים וגדלים לרבות ריצוף דמוי פרקט.',
    'שני ארונות אמבטיה הכוללים משטח אינטגרלי עם כיור ומראה בחדר רחצה הורים ובחדר אמבטיה כללי (למעט שירותי אורחים).'] },
  { h: 'מטבח', img: 'assets/renders/liv2.jpg', items: [
    'ארונות מטבח יוקרתיים מחברות מובילות.',
    'משטח עבודה יוקרתי במספר גוונים.',
    'קערת מטבח אקרילי בהתקנה שטוחה או כיור נירוסטה.',
    'הכנה למדיח כלים.',
    'ברז נשלף במטבח לרבות ברז תעשייתי יוקרתי.'] },
  { h: 'מפרט הבניין', img: 'assets/renders/lobby1.jpg', items: [
    'בניינים בתכנון ייחודי ובמפרט טכני עשיר.',
    'לובי בניין מעוצב.',
    'פיתוח סביבתי עשיר.',
    'מעליות יוקרתיות.',
    'מתחם חניה תת קרקעי סגור מקורה כולל חניה לכל דייר.',
    'מערכת אינטרקום טלוויזיה במעגל סגור.',
    'קיר מסך וחליה יבשה.',
    'חדר דיירים.'] },
];
const DISCLAIMER = 'עיקרי מפרט אלו מהווים שדרוג לתוכניות ולמפרט הטכני שיצורפו לחוזה המכר, ואשר אינם חלק מתנאי ההתקשרות והחוזה שייחתם בין הצדדים. המוצג בעיקרי מפרט אלו, לרבות ריהוט, אביזרים, מידות ותמונות הינו לצורך המחשה בלבד. לחוזה המכר מצורפים מפרט טכני ותכניות מכר והם בלבד יחייבו את החברה. התכניות הינן לפי מתן היתר בנייה וייתכנו שינויים. עיקרי מפרט אלו אינם מהווים מצג או הצעה ולא יהיו חלק מתנאי ההסכם וההתקשרות בין הצדדים. * שמות המותגים לא סופי. החברה רשאית להחליף מותג בשווה ערך. ט.ל.ח.';

const css = `
.pg{background:var(--espresso);overflow-y:auto;overscroll-behavior:contain}
.pg .x{position:fixed;top:18px;left:18px;z-index:4}
.pg-top{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 26px 18px 76px;background:linear-gradient(180deg,rgba(31,24,19,.94),rgba(31,24,19,0))}
.pg-top img{height:33px;width:auto}
.pg-top .k{font-size:12px;letter-spacing:.22em;color:var(--champagne);opacity:.8}
#spec .sp-hero{text-align:center;padding:30px 16px 46px}
#spec .sp-hero .en{font-family:'Almoni',var(--serif);font-size:clamp(40px,6vw,82px);color:var(--champagne);font-style:italic;line-height:1}
#spec .sp-hero h1{font-family:var(--display);font-weight:400;font-size:clamp(46px,6vw,86px);line-height:1;margin-top:8px}
#spec .sp-hero p{color:var(--ink-dim);font-size:15px;margin-top:10px}
#spec .sp-nav{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:22px}
#spec .sp-nav a{font-size:13px;color:var(--ink);text-decoration:none;border:1px solid var(--line);border-radius:30px;padding:8px 16px;transition:all .25s}
#spec .sp-nav a:hover{border-color:var(--champagne);background:rgba(234,211,182,.08)}
#spec .sp-sec{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-top:1px solid var(--line);min-height:70vh}
#spec .sp-sec:nth-of-type(even) .sp-txt{order:2}
#spec .sp-img{background-size:cover;background-position:center;min-height:320px}
#spec .sp-txt{padding:clamp(34px,5vw,72px) clamp(20px,4.5vw,72px);display:flex;flex-direction:column;justify-content:center}
#spec .sp-txt .n{font-family:var(--display);font-size:20px;color:var(--copper);letter-spacing:.1em}
#spec .sp-txt h2{font-family:var(--display);font-weight:400;font-size:clamp(38px,4.2vw,62px);line-height:1;margin:6px 0 22px}
#spec .sp-txt ul{list-style:none;display:flex;flex-direction:column;gap:11px;max-width:60ch}
#spec .sp-txt li{position:relative;padding-right:22px;font-size:clamp(14.5px,1.1vw,16.5px);line-height:1.65;color:var(--ink-dim)}
#spec .sp-txt li::before{content:"";position:absolute;right:2px;top:.62em;width:8px;height:8px;border-radius:50%;background:var(--copper)}
#spec .sp-disc{padding:40px clamp(16px,6vw,120px) 70px;border-top:1px solid var(--line);font-size:12px;line-height:1.8;color:var(--ink-dim);opacity:.8;text-align:center}
#film{background:#0f0b08;display:flex;align-items:center;justify-content:center}
#film .fl-bg{position:absolute;inset:0;background:url('assets/renders/ext1.jpg') center/cover;opacity:.28;filter:blur(2px) saturate(.8)}
#film .fl-bg::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(15,11,8,.35),rgba(15,11,8,.92) 75%)}
#film .fl-box{position:relative;text-align:center;padding:0 16px}
#film .fl-play{width:96px;height:96px;margin:0 auto 34px;border-radius:50%;border:2px solid var(--champagne);display:flex;align-items:center;justify-content:center;box-shadow:0 0 60px rgba(234,211,182,.25)}
#film .fl-play svg{width:34px;height:34px;margin-left:-6px;fill:var(--champagne)}
#film .k{font-size:13px;letter-spacing:.32em;color:var(--copper);margin-bottom:16px}
#film h1{font-family:var(--display);font-weight:400;font-size:clamp(54px,9vw,150px);line-height:.95}
#film h1 em{font-style:normal;color:var(--champagne)}
@media (max-width:820px){
  #spec .sp-sec,#spec .sp-sec:nth-of-type(even){grid-template-columns:1fr;min-height:0}
  #spec .sp-sec:nth-of-type(even) .sp-txt{order:0}
  #spec .sp-img{min-height:38vh}
  .pg-top{padding:14px 16px 14px 70px}
}`;
document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);

const top = (k) => `<button class="x" aria-label="סגירה">✕</button><div class="pg-top"><div class="k">${k}</div><img src="assets/logo-tight.png" alt="HELLO TLV"></div>`;
const spec = document.createElement('section');
spec.className = 'ovl pg'; spec.id = 'spec'; spec.setAttribute('aria-label', 'מפרט טכני');
spec.innerHTML = top('מפרט טכני · אורון רובע השלום') + `
<div class="sp-hero"><div class="en">Technical Details</div><h1>מפרט טכני</h1><p>לחיות בדיוק תל אביבי</p>
  <nav class="sp-nav">${SPEC.map((s, i) => `<a href="#sp${i}">${s.h}</a>`).join('')}</nav></div>
${SPEC.map((s, i) => `<article class="sp-sec" id="sp${i}">
  <div class="sp-txt"><div class="n">0${i + 1}</div><h2>${s.h}</h2><ul>${s.items.map((x) => `<li>${x}</li>`).join('')}</ul></div>
  <div class="sp-img" style="background-image:url('${s.img}')"></div></article>`).join('')}
<div class="sp-disc">${DISCLAIMER}</div>`;
spec.querySelectorAll('.sp-nav a').forEach((a) => a.onclick = (e) => { e.preventDefault(); spec.querySelector(a.getAttribute('href')).scrollIntoView({ behavior: 'smooth' }); });

const film = document.createElement('section');
film.className = 'ovl pg'; film.id = 'film'; film.setAttribute('aria-label', 'סרטון הפרויקט');
film.innerHTML = `<div class="fl-bg"></div>` + top('סרטון הפרויקט') + `
<div class="fl-box"><div class="fl-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
  <div class="k">סרטון הפרויקט · בקרוב</div><h1>כאן יהיה הסרט<br><em>של רועי ציוני</em></h1></div>`;
film.querySelector('.pg-top').style.cssText = 'position:absolute;top:0;left:0;right:0';

const P = { spec, film };
for (const el of Object.values(P)) {
  document.body.appendChild(el);
  el.querySelector('.x').onclick = () => close(el);
}
function open(k) { const el = P[k]; el.scrollTop = 0; el.classList.add('on'); document.body.classList.add('ovl-open'); window.HELLO?.pause(true); }
function close(el) { el.classList.remove('on'); if (!document.querySelectorAll('.ovl.on').length) { document.body.classList.remove('ovl-open'); window.HELLO?.pause(false); } }
addEventListener('keydown', (e) => { if (e.key === 'Escape') for (const el of Object.values(P)) if (el.classList.contains('on')) close(el); });
window.HELLO_PAGES = { open };
})();
