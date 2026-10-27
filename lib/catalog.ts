// Shared, data-free catalog knowledge used by the import mapper and the UI.
// Codes are stable identifiers stored in the database; labels are Egyptian Arabic.
// The alias lists were derived ONLY from the column headers of the original
// directorate Google Sheets (no data rows), so the importer understands them as-is.

/** Normalizes Arabic text so spelling variants compare equal (أ/ا, ة/ه, ى/ي, spaces...). */
export function normalizeArabic(value: string) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "") // diacritics + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[‌-‏‪-‮]/g, "")
    .replace(/[،,؛;:._\-–—/\\()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const GRADE_ALIASES: Record<string, string[]> = {
  kg1: ["اولي حضانه", "اولي رياض اطفال", "رياض اطفال اولي", "كي جي 1", "kg1"],
  kg2: ["ثانيه حضانه", "تانيه حضانه", "ثانيه رياض اطفال", "رياض اطفال ثانيه", "كي جي 2", "kg2"],
  primary1: ["اولي ابتدائي", "الصف الاول الابتدائي", "primary1"],
  primary4: ["رابعه ابتدائي", "الصف الرابع الابتدائي", "primary4"],
  preparatory1: ["اولي اعدادي", "الصف الاول الاعدادي", "preparatory1"],
  secondary1: ["اولي ثانوي", "الصف الاول الثانوي", "secondary1"],
};

/** Indicator codes with Arabic labels and the header spellings seen in the source sheets. */
export const INDICATORS: { code: string; label: string; aliases: string[] }[] = [
  { code: "thalassemia", label: "أنيميا البحر المتوسط", aliases: ["انيميا بحر متوسط", "انيميا البحر المتوسط"] },
  { code: "favism", label: "أنيميا الفول", aliases: ["انيميا فول", "انيميا الفول"] },
  { code: "anemia", label: "الأنيميا", aliases: ["الانيميا", "انيميا"] },
  { code: "obesity", label: "السمنة", aliases: ["السمنه", "سمنه"] },
  { code: "underweight", label: "النحافة", aliases: ["النحافه", "نحافه", "نقص الوزن"] },
  { code: "stunting", label: "التقزم", aliases: ["التقزم", "تقزم"] },
  { code: "visual_impairment", label: "ضعف الإبصار", aliases: ["ضعف الابصار", "حده الابصار غير الطبيعيه", "حده ابصار غير طبيعيه"] },
  { code: "strabismus", label: "الحول", aliases: ["الحول", "حول"] },
  { code: "ptosis", label: "سقوط الجفن", aliases: ["سقوط الجفن", "سقوط جفن"] },
  { code: "dental_other", label: "أمراض أسنان أخرى", aliases: ["امراض اسنان اخري", "امراض الاسنان الاخري"] },
  { code: "dental_caries", label: "تسوس الأسنان", aliases: ["تسوس الاسنان", "تسوس اسنان"] },
  { code: "dental_diseases", label: "أمراض الأسنان", aliases: ["امراض اسنان", "امراض الاسنان"] },
  { code: "skin", label: "الأمراض الجلدية", aliases: ["امراض جلديه", "جلديه"] },
  { code: "inclusion", label: "الدمج", aliases: ["الدمج", "دمج"] },
  { code: "diabetes", label: "السكر", aliases: ["السكر", "سكر"] },
  { code: "hypertension", label: "الضغط", aliases: ["الضغط", "ضغط"] },
  { code: "heart", label: "أمراض القلب", aliases: ["امراض القلب", "قلب"] },
  { code: "epilepsy", label: "الصرع", aliases: ["الصرع", "صرع"] },
  { code: "asthma", label: "حساسية الصدر", aliases: ["حساسيه الصدر", "حساسيه صدر"] },
  { code: "rheumatic_fever", label: "الحمى الروماتيزمية", aliases: ["حمي روماتيزميه", "حمه روماتيزميه", "الحمي الروماتيزميه", "حمي روماتيوميه"] },
  { code: "renal", label: "الاعتلال الكلوي", aliases: ["اعتلال كلوي"] },
  { code: "blood_disorders", label: "أمراض الدم", aliases: ["امراض الدم", "امراض دم"] },
  { code: "tumors", label: "الأورام", aliases: ["اورام سرطانيه", "اورام"] },
  { code: "glasses", label: "النظارات", aliases: ["نظارات", "نضارات"] },
  { code: "psychological", label: "نفسية", aliases: ["نفسيه"] },
  { code: "ent", label: "أنف وأذن", aliases: ["انف و اذن", "انف واذن"] },
  { code: "internal_medicine", label: "باطنة", aliases: ["باطنه"] },
  { code: "urology", label: "مسالك", aliases: ["مسالك"] },
  { code: "neurology", label: "أعصاب", aliases: ["اعصاب"] },
  { code: "orthopedics", label: "عظام", aliases: ["عظام"] },
  { code: "assistive_devices", label: "أجهزة تكميلية", aliases: ["اجهزه تكميليه"] },
  { code: "endemic", label: "أمراض متوطنة", aliases: ["متوطنه"] },
  { code: "speech", label: "تخاطب", aliases: ["تخاطب"] },
  { code: "motor_disability", label: "إعاقة حركية", aliases: ["اعاقه حركيه"] },
  { code: "other_conditions", label: "حالات أخرى", aliases: ["حالات اخري"] },
  { code: "dental", label: "الأسنان", aliases: [] },
  { code: "hearing", label: "السمع", aliases: [] },
];

/** Comprehensive-screening indicators that appear in the original sheets (vision is separate). */
export const SHEET_COMPREHENSIVE_INDICATORS = INDICATORS.filter(
  (i) => i.aliases.length && !["strabismus", "ptosis"].includes(i.code),
).map((i) => i.code);

export const ADMINISTRATION_ALIASES: Record<string, string[]> = {
  أوسيم: ["اوسيم"],
  كرداسة: ["كرداسه"],
  البدرشين: ["البدرشين", "بدرشين"],
  الصف: ["الصف"],
  أطفيح: ["اطفيح"],
  "أبو النمرس": ["ابو النمرس", "ابوالنمرس"],
  "شرق القناطر": ["شرق القناطر"],
  "غرب القناطر": ["غرب القناطر"],
  "شمال العياط": ["شمال العياط"],
  "جنوب العياط": ["جنوب العياط"],
  الوراق: ["الوراق", "وراق"],
  الحوامدية: ["الحوامديه", "حوامديه"],
  الواحات: ["الواحات", "الواحات البحريه", "واحات"],
};

/** Returns the canonical administration name for a free-text spelling, or null. */
export function matchAdministration(raw: string, names: string[]) {
  const value = normalizeArabic(raw).replace(/^اداره\s+/, "").replace(/\s*الصحيه$/, "");
  if (!value) return null;
  for (const name of names) {
    const aliases = [name, ...(ADMINISTRATION_ALIASES[name] ?? [])].map(normalizeArabic);
    if (aliases.includes(value)) return name;
  }
  return null;
}

const sortedIndicatorAliases = INDICATORS.flatMap((i) =>
  i.aliases.map((a) => ({ code: i.code, alias: normalizeArabic(a) })),
).sort((a, b) => b.alias.length - a.alias.length);
const sortedGradeAliases = Object.entries(GRADE_ALIASES)
  .flatMap(([code, list]) => list.map((a) => ({ code, alias: normalizeArabic(a) })))
  .sort((a, b) => b.alias.length - a.alias.length);

export type HeaderMeaning =
  | { kind: "administration" }
  | { kind: "timestamp" }
  | { kind: "week" }
  | { kind: "sector" }
  | { kind: "target" | "screened"; grade: string }
  | { kind: "indicator"; indicator: string; grade: string }
  | { kind: "unknown"; reason: string };

/** Understands one column header of the original wide sheets, e.g. "السمنه اولي حضانه". */
export function interpretHeader(raw: string): HeaderMeaning {
  // Azhar sheets sometimes add the sector at the end ("مستهدف اولي حضانه أزهر").
  const h = normalizeArabic(raw).replace(/\s+(ازهر|الازهر|ازهري|عام)$/, "");
  if (!h) return { kind: "unknown", reason: "عمود من غير عنوان" };
  if (["timestamp", "الطابع الزمني", "تاريخ الارسال", "وقت الارسال"].includes(h)) return { kind: "timestamp" };
  if (["الاداره", "اداره", "الاداره الصحيه", "الادارة"].includes(h)) return { kind: "administration" };
  if (["الاسبوع", "بدايه الاسبوع", "اسبوع الاحد", "week"].includes(h)) return { kind: "week" };
  if (["القطاع", "sector"].includes(h)) return { kind: "sector" };
  const grade = sortedGradeAliases.find((g) => h.endsWith(" " + g.alias) || h === g.alias || h.includes(" " + g.alias + " "));
  if (!grade) return { kind: "unknown", reason: "مش لاقي الصف الدراسي في عنوان العمود" };
  const remainder = h.replace(grade.alias, " ").replace(/\s+/g, " ").trim();
  const text = remainder.replace(/^حالات\s+/, "").replace(/\s*المكتشفه/, "").replace(/\s+/g, " ").trim();
  if (/^اجمالي/.test(text)) return { kind: "unknown", reason: "عمود إجمالي — السيستم بيحسب الإجماليات لوحده" };
  if (text === "مستهدف") return { kind: "target", grade: grade.code };
  if (/^(عدد )?(ما ?تم ?فحصه|المفحوصين|المفحوصون)$/.test(text)) return { kind: "screened", grade: grade.code };
  for (const candidate of [remainder, text, text.replace(/\s+اخري$/, "")]) {
    const hit = sortedIndicatorAliases.find((i) => i.alias === candidate);
    if (hit) return { kind: "indicator", indicator: hit.code, grade: grade.code };
  }
  return { kind: "unknown", reason: "مؤشر مش معروف للسيستم: " + text };
}

export function indicatorLabel(code: string) {
  return INDICATORS.find((i) => i.code === code)?.label;
}
