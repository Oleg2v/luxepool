/**
 * Luxepool concept — content model.
 *
 * Every company fact on the page comes from the brief and from the captions printed
 * on Luxepool's own project photos (city, size, pool type). Anything that is not a
 * fact (build times, prices, depths) is marked `example` and is labelled as such in the UI.
 */

/* ------------------------------------------------------------------ contacts */

export const company = {
  nameHe: 'לוקספול שירותי בריכות בע״מ',
  shortHe: 'לוקספול',
  wordmark: 'LUXEPOOL',
  addressHe: 'רחוב יהלום 1, אשדוד',
  years: '20+',
  email: 'office@luxepool.co.il',
  shopUrl: 'https://luxepoolshop.co.il',
  shopLabel: 'luxepoolshop.co.il',
  logoWhite: 'https://luxepool.co.il/wp-content/uploads/2023/03/w-logo.png',
  googleRating: '4.9',
  googleReviews: '170+',
  /** Opens Google results for the business, where all reviews are listed. */
  googleReviewsUrl:
    'https://www.google.com/search?q=%D7%9C%D7%95%D7%A7%D7%A1%D7%A4%D7%95%D7%9C+%D7%A9%D7%99%D7%A8%D7%95%D7%AA%D7%99+%D7%91%D7%A8%D7%99%D7%9B%D7%95%D7%AA+%D7%91%D7%99%D7%A7%D7%95%D7%A8%D7%95%D7%AA',
} as const;

export interface Phone {
  display: string; // as printed, always shown exactly
  tel: string; // E.164 for tel: links
}

export const phones = {
  build: { display: '074-700-9884', tel: '+97247009884' },
  buildWhatsApp: { display: '050-238-1007', tel: '+972502381007' },
  service: { display: '050-523-8884', tel: '+972505238884' },
} satisfies Record<string, Phone>;

/** WhatsApp number for new-pool leads, digits only for wa.me. */
export const whatsappNumber = '972502381007';

/** Placeholder profile URLs — replace with the official Luxepool profiles. */
export const socials = [
  { id: 'facebook', label: 'פייסבוק', href: 'https://www.facebook.com/' },
  { id: 'instagram', label: 'אינסטגרם', href: 'https://www.instagram.com/' },
  { id: 'tiktok', label: 'טיקטוק', href: 'https://www.tiktok.com/' },
  { id: 'youtube', label: 'יוטיוב', href: 'https://www.youtube.com/' },
] as const;

/* -------------------------------------------------------------------- photos */

/**
 * The project photos are 1600×900 social graphics: a caption panel on the left and
 * the actual photograph inside a circle on the right. (cx, cy) is the measured centre
 * of that circle in source pixels; the photo is clean inside radius 366.
 * See src/lib/crop.ts for how the crops are computed.
 */
export interface Photo {
  src: string;
  cx: number;
  cy: number;
  alt: string;
}

const up = (path: string) => `https://luxepool.co.il/wp-content/uploads/${path}`;

export const photos = {
  roshHaAyin: { src: up('2025/09/54345354345354234423.jpg'), cx: 1149.1, cy: 449.7, alt: 'בריכה עילית מתועשת עם סקימרים, דק עץ מסביב וחיפוי אריחים כחולים, ראש העין' },
  sderot8x3: { src: up('2024/04/18.jpg'), cx: 1149.1, cy: 449.8, alt: 'בריכה מתועשת עם סקימרים, חיפוי אבן אפורה ומיטת שיזוף לבנה בתוך המים, שדרות' },
  ashkelon: { src: up('2024/04/17.jpg'), cx: 1148.7, cy: 449.9, alt: 'בריכה מתועשת עם תעלת גלישה בצד אחד וריצוף אבן בהיר, אשקלון' },
  orYehuda: { src: up('2024/04/16.jpg'), cx: 1148.7, cy: 450.2, alt: 'בריכה מתועשת מוארת בלילה בתאורה כחולה, עם מפל מים וגדר זכוכית, אור יהודה' },
  beitShemesh: { src: up('2024/04/15.jpg'), cx: 1148.9, cy: 450.0, alt: 'בריכת בטון עם תעלות גלישה, חיפוי כהה וג׳קוזי בנוי, בית שמש' },
  omer: { src: up('2024/04/13.jpg'), cx: 1142.3, cy: 462.3, alt: 'בריכה מתועשת עם תעלת גלישה בצד אחד, מדרגות כניסה רחבות ומפל נירוסטה, עומר' },
  jerusalem: { src: up('2024/04/12.jpg'), cx: 1142.8, cy: 462.2, alt: 'בריכה ברוחב משתנה על מדרון, מוקפת דק עץ ומעקה, ירושלים' },
  kadima: { src: up('2024/04/11.jpg'), cx: 1141.9, cy: 461.5, alt: 'בריכה מתועשת עם תעלות גלישה, פסיפס כחול ודק עץ, קדימה צורן' },
  sderot10x4: { src: up('2024/04/10.jpg'), cx: 1142.7, cy: 462.0, alt: 'בריכת בטון עם תעלות גלישה, קיר ירוק וגדר זכוכית, שדרות' },
  petahTikva: { src: up('2024/04/9.jpg'), cx: 1142.2, cy: 461.8, alt: 'בריכה מתועשת בתאורת ערב, מוקפת דקלים וריצוף בהיר, פתח תקווה' },
  ashdod: { src: up('2024/04/8.jpg'), cx: 1142.4, cy: 462.1, alt: 'בריכת בטון עם תעלת גלישה, פסיפס כהה וקיר אבן, אשדוד' },
  beerSheva: { src: up('2024/04/7.jpg'), cx: 1142.5, cy: 462.0, alt: 'בריכה בחצר פתוחה עם שמשייה ומיטות שיזוף, באר שבע' },
} satisfies Record<string, Photo>;

/* ---------------------------------------------------------------- pool types */

export type PoolTypeId =
  | 'concrete'
  | 'overflow'
  | 'favorit'
  | 'fiberglass'
  | 'industrial'
  | 'natural'
  | 'rooftop'
  | 'aboveground';

export interface PoolType {
  id: PoolTypeId;
  name: string; // card title
  short: string; // used in summaries / WhatsApp
  buildTime: string; // example value
  look: string;
  use: string;
  bestFor: string;
  /** Real Luxepool photo of this type, or a plan illustration when none exists. */
  visual:
    | { kind: 'photo'; photo: Photo; caption: string; scale?: number; dx?: number; dy?: number }
    | { kind: 'diagram'; caption: string };
  /** Example multiplier used by the configurator's example price model. */
  priceFactor: number;
  /** Optional note shown in the configurator when this type is selected. */
  configNote?: string;
}

export const poolTypes: PoolType[] = [
  {
    id: 'concrete',
    name: 'בריכת בטון',
    short: 'בריכת בטון',
    buildTime: '8–12 שבועות',
    look: 'כל צורה, כל עומק וכל גימור: פסיפס, אריחים או אבן.',
    use: 'חצר של בית פרטי עם תכנון אישי.',
    bestFor: 'מי שרוצה חופש תכנון מלא.',
    visual: { kind: 'photo', photo: photos.sderot10x4, caption: 'שדרות · 10 על 4 · בטון' },
    priceFactor: 1,
  },
  {
    id: 'overflow',
    name: 'בריכת גלישה',
    short: 'בריכת גלישה',
    buildTime: '10–14 שבועות',
    look: 'המים בגובה הדק וגולשים לתעלה, מכל הצדדים או מצד אחד.',
    use: 'בתים בעיצוב נקי ומודרני.',
    bestFor: 'מי שרוצה קו מים רציף, כמו מראה.',
    visual: { kind: 'photo', photo: photos.omer, caption: 'עומר · 9 על 4 · גלישה מצד אחד' },
    priceFactor: 1,
  },
  {
    id: 'favorit',
    name: 'Favorit קרמית',
    short: 'בריכת Favorit קרמית',
    buildTime: '3–5 שבועות',
    look: 'גוף מוכן בגימור קרמי, עם מדרגות וספסל מובנים.',
    use: 'חצרות שבהן רוצים בריכה מוכנה ברמת גימור גבוהה.',
    bestFor: 'מי שרוצה את המהירות של בריכה מוכנה, בלי להתפשר על הגימור.',
    visual: { kind: 'diagram', caption: 'איור תכנון · גוף קרמי מוכן' },
    priceFactor: 0.95,
    configNote: 'בבריכה מוכנה בוחרים מתוך דגמים קיימים. המידות כאן הן להמחשה.',
  },
  {
    id: 'fiberglass',
    name: 'בריכת פיברגלס',
    short: 'בריכת פיברגלס',
    buildTime: '2–4 שבועות',
    look: 'גוף אחד חלק, פינות מעוגלות ומדרגות מובנות.',
    use: 'חצרות שבהן רוצים התקנה מהירה ונקייה.',
    bestFor: 'מי שרוצה בריכה מוכנה בדגם קבוע.',
    visual: { kind: 'diagram', caption: 'איור תכנון · גוף פיברגלס מוכן' },
    priceFactor: 0.85,
    configNote: 'בבריכה מוכנה בוחרים מתוך דגמים קיימים. המידות כאן הן להמחשה.',
  },
  {
    id: 'industrial',
    name: 'בריכה מתועשת',
    short: 'בריכה מתועשת',
    buildTime: '4–6 שבועות',
    look: 'פסיפס, אריחים או PVC, עם סקימרים או גלישה.',
    use: 'בתים פרטיים שרוצים לוח זמנים קצר יותר.',
    bestFor: 'איזון בין מחיר, זמן ומראה.',
    visual: { kind: 'photo', photo: photos.sderot8x3, caption: 'שדרות · 8 על 3 · מתועשת' },
    priceFactor: 0.88,
  },
  {
    id: 'natural',
    name: 'בריכה טבעית',
    short: 'בריכה טבעית',
    buildTime: '8–12 שבועות',
    look: 'אזור שחייה לצד אזור צמחייה שמסנן את המים.',
    use: 'גינות גדולות ומי שמעדיף פחות כימיקלים.',
    bestFor: 'מי שרוצה בריכה שנראית כמו חלק מהגינה.',
    visual: { kind: 'diagram', caption: 'איור תכנון · אזור שחייה וצמחייה' },
    priceFactor: 1.2,
  },
  {
    id: 'rooftop',
    name: 'מרפסת וגג',
    short: 'בריכה במרפסת או על הגג',
    buildTime: '4–8 שבועות',
    look: 'בריכה קלה במבנה הבית, לעיתים עם דופן זכוכית.',
    use: 'פנטהאוזים, גגות ומרפסות גדולות, לאחר בדיקת מהנדס.',
    bestFor: 'מי שאין לו חצר, אבל יש לו נוף.',
    visual: { kind: 'diagram', caption: 'איור תכנון · בריכה על הגג' },
    priceFactor: 1.35,
  },
  {
    id: 'aboveground',
    name: 'בריכה עילית',
    short: 'בריכה עילית',
    buildTime: '2–4 שבועות',
    look: 'בריכה מעל פני הקרקע, מוקפת דק.',
    use: 'חצרות שבהן חפירה עמוקה לא אפשרית.',
    bestFor: 'פרויקט מהיר, בלי חפירה גדולה.',
    visual: {
      kind: 'photo',
      photo: photos.roshHaAyin,
      caption: 'ראש העין · 7 על 3 · עילית',
      scale: 0.9,
      dy: 30,
    },
    priceFactor: 0.78,
  },
];

export const poolTypeById = (id: string | null | undefined) =>
  poolTypes.find((t) => t.id === id) ?? null;

/* ------------------------------------------------------------- configurator */

export type ShapeId = 'rect' | 'l' | 'free';
export type EdgeId = 'overflow' | 'skimmer';
export type FinishId = 'white' | 'sky' | 'deep' | 'stone' | 'graphite';
export type ExtraId = 'jacuzzi' | 'waterfall' | 'led' | 'cover';

export const shapes: { id: ShapeId; label: string }[] = [
  { id: 'rect', label: 'מלבן' },
  { id: 'l', label: 'צורת L' },
  { id: 'free', label: 'צורה חופשית' },
];

export const edges: { id: EdgeId; label: string; hint: string }[] = [
  { id: 'skimmer', label: 'סקימר', hint: 'המים מעט מתחת לשפה' },
  { id: 'overflow', label: 'גלישה', hint: 'המים בגובה הדק' },
];

/**
 * Interior finishes. `tile` is the interior colour (sRGB); the 3D water colour is not
 * painted on — it comes from light passing through the water over this finish.
 * `swatch` is a two-stop preview of the resulting water colour for the UI.
 */
export const finishes: { id: FinishId; label: string; tile: string; swatch: [string, string] }[] = [
  { id: 'white', label: 'לבן', tile: '#F4F7FA', swatch: ['#BFF3FB', '#2BB7DD'] },
  { id: 'sky', label: 'תכלת', tile: '#8ED2EA', swatch: ['#8BE6F7', '#0090D7'] },
  { id: 'deep', label: 'כחול עמוק', tile: '#2A63AE', swatch: ['#4BA7E0', '#1C5198'] },
  { id: 'stone', label: 'אפור אבן', tile: '#A3AEB5', swatch: ['#9ED8DC', '#2F7C93'] },
  { id: 'graphite', label: 'גרפיט', tile: '#3B4652', swatch: ['#4C8BB0', '#163A5E'] },
];

export const extras: { id: ExtraId; label: string; price: [number, number] }[] = [
  { id: 'jacuzzi', label: 'פינת ג׳קוזי', price: [28000, 42000] },
  { id: 'waterfall', label: 'מפל מים', price: [6000, 11000] },
  { id: 'led', label: 'תאורת LED', price: [4000, 8000] },
  { id: 'cover', label: 'כיסוי לבריכה', price: [32000, 58000] },
];

export const sizeLimits = {
  length: { min: 4, max: 12, step: 0.5, initial: 8 },
  width: { min: 2.5, max: 6, step: 0.5, initial: 4 },
  /** Example average depth used only for the volume estimate. */
  exampleDepth: 1.4,
};

/* ------------------------------------------------------------ build stages */

export const stages: { id: string; title: string; text: string }[] = [
  { id: 'plan', title: 'תכנון', text: 'מודדים את החצר, מתכננים את הבריכה ומסמנים אותה על הקרקע.' },
  { id: 'dig', title: 'חפירה', text: 'הצוות שלנו חופר בדיוק לפי התוכנית, כולל מקום למערכות.' },
  { id: 'build', title: 'שלד', text: 'ברזל ובטון יוצרים את גוף הבריכה, המדרגות והקירות.' },
  { id: 'systems', title: 'אינסטלציה ומערכות', text: 'צנרת, משאבה, סינון ותאורה מחוברים לחדר המכונות.' },
  { id: 'finish', title: 'גמר', text: 'חיפוי, אבני שפה וריצוף, בגימור שבחרתם.' },
  { id: 'fill', title: 'מילוי', text: 'ממלאים, מאזנים את המים ובודקים כל מערכת לפני המסירה.' },
  { id: 'care', title: 'תחזוקה', text: 'אנחנו כאן גם אחרי המסירה, עם שירות, ציוד ותיקונים.' },
];

/* ----------------------------------------------------------------- projects */

export interface Project {
  city: string;
  size: string; // as printed on the original caption
  type: string;
  photo: Photo;
}

/** Captions transcribed from Luxepool's own project graphics. */
export const projects: Project[] = [
  { city: 'עומר', size: '9×4', type: 'מתועשת, תעלת גלישה בצד אחד', photo: photos.omer },
  { city: 'בית שמש', size: '10×5', type: 'בטון, תעלות גלישה, ג׳קוזי בנוי', photo: photos.beitShemesh },
  { city: 'שדרות', size: '10×4', type: 'בטון, תעלות גלישה', photo: photos.sderot10x4 },
  { city: 'קדימה צורן', size: '9×4', type: 'מתועשת, תעלות גלישה', photo: photos.kadima },
  { city: 'אשדוד', size: '11×4', type: 'בטון, תעלות גלישה', photo: photos.ashdod },
  { city: 'אור יהודה', size: '8×4', type: 'מתועשת, סקימרים', photo: photos.orYehuda },
  { city: 'ירושלים', size: '8 על רוחב משתנה', type: 'בריכה על מדרון', photo: photos.jerusalem },
  { city: 'אשקלון', size: '7×3', type: 'מתועשת, תעלת גלישה בצד אחד', photo: photos.ashkelon },
  { city: 'פתח תקווה', size: '7.5×3.5', type: 'מתועשת', photo: photos.petahTikva },
  { city: 'שדרות', size: '8×3', type: 'מתועשת, סקימרים', photo: photos.sderot8x3 },
  { city: 'ראש העין', size: '7×3', type: 'עילית מתועשת, סקימרים', photo: photos.roshHaAyin },
  { city: 'באר שבע', size: '9×4', type: 'בריכה פרטית', photo: photos.beerSheva },
];

/* ------------------------------------------------------------------ reviews */

/** The gist of recurring themes in Luxepool's Google reviews. Paraphrased, no names. */
export const reviewGist: { theme: string; quote: string }[] = [
  {
    theme: 'הצוותים של לוקספול בכל שלב',
    quote: 'מהחפירה ועד הריצוף, כל שלב נעשה על ידי הצוותים של לוקספול עצמם.',
  },
  {
    theme: 'תיאום בין הצוותים',
    quote: 'כל צוות ידע בדיוק מתי הוא נכנס. מה שסוכם עם צוות אחד, הצוות הבא כבר ידע.',
  },
  {
    theme: 'שירות שנמשך',
    quote: 'גם שנים אחרי שהבריכה נמסרה, הם עדיין עונים ומגיעים כשצריך.',
  },
];

/* ----------------------------------------------------------------- services */

export const services: { title: string; text: string; link?: { href: string; label: string } }[] = [
  { title: 'תכנון ובנייה', text: 'כל סוגי הבריכות, מהחפירה ועד המילוי.' },
  { title: 'תחזוקה ושיפוץ', text: 'שירות שוטף, תיקונים וחידוש בריכות קיימות.' },
  {
    title: 'חנות ציוד',
    text: 'משאבות, מסננים, מערכות מלח, חימום, רובוטים וכיסויים.',
    link: { href: 'https://luxepoolshop.co.il', label: 'luxepoolshop.co.il' },
  },
  { title: 'ג׳קוזי וסאונות', text: 'ג׳קוזי, סאונות יבשות, מפלים ומסכי LED לחצר.' },
];

export const equipment = [
  'ציפוי PVC',
  'חיפוי וריצוף',
  'כיסויים',
  'רובוטים',
  'משאבות',
  'מסננים',
  'מערכות מלח',
  'חימום',
  'מפלים',
  'מסכי LED',
];

/* --------------------------------------------------------------- quote form */

export const startOptions = [
  { value: 'asap', label: 'בחודש הקרוב' },
  { value: '1-3', label: 'בעוד 1–3 חודשים' },
  { value: '3-6', label: 'בעוד 3–6 חודשים' },
  { value: 'exploring', label: 'רק בודקים אפשרויות' },
];
