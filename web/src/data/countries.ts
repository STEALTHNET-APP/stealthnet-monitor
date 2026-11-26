// ISO 3166-1 alpha-2 codes. Display names are localized by the browser.
const codes = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
)
  .toLowerCase()
  .split(" ");
const countryCodes = new Set(codes);

const russian = new Intl.DisplayNames(["ru"], {
  type: "region",
  fallback: "none",
});
const english = new Intl.DisplayNames(["en"], {
  type: "region",
  fallback: "none",
});
const normalize = (value: string) =>
  value.trim().toLowerCase().replaceAll("ё", "е");

export const countryName = (code: string) =>
  !/^[a-z]{2}$/i.test(code) || code.toLowerCase() === "xx"
    ? "Не указана"
    : (russian.of(code.toUpperCase()) ?? code);

export const countries = codes
  .map((code) => ({
    code,
    name: countryName(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "ru"));

export function matchesCountry(query: string, code: string, name = "") {
  const term = normalize(query);
  if (countryCodes.has(term)) return code.toLowerCase() === term;
  return (
    !term ||
    normalize(name).includes(term) ||
    (/^[a-z]{2}$/i.test(code) &&
      (code.toLowerCase() === term ||
        normalize(countryName(code)).includes(term) ||
        normalize(english.of(code.toUpperCase()) ?? "").includes(term)))
  );
}
