import materialOrder from "../config/materialOrder.json";

const ORDER = (materialOrder.order || []).map((o, idx) => ({
  key: o.key,
  aliases: o.aliases || [],
  idx,
}));

const getGroupIndex = (name = "") => {
  for (const e of ORDER) {
    if (e.key === "*") continue;
    if (name.includes(e.key)) return e.idx;
    if (e.aliases.some(a => name.includes(a))) return e.idx;
  }
  const star = ORDER.find(e => e.key === "*");
  return star ? star.idx : 9999;
};

const normalizeName = (n = "") =>
  n.replace(/경사브래싱/g, "경사브레싱")
   .replace(/경사브레싱/g, "경사브레싱"); // 최종 통일 형태 하나로

export const materialComparator = (a, b) => {
  if (a.rackType !== b.rackType) {
    return String(a.rackType).localeCompare(String(b.rackType), "ko");
  }

  const an = normalizeName(a.name || "");
  const bn = normalizeName(b.name || "");
  const ga = getGroupIndex(an);
  const gb = getGroupIndex(bn);
  if (ga !== gb) return ga - gb;

  // 같은 그룹 내: 숫자 우선 비교 후 한글/숫자 혼합 localeCompare
  const na = (an.match(/\d+/) || [])[0];
  const nb = (bn.match(/\d+/) || [])[0];
  if (na && nb && na !== nb) return Number(na) - Number(nb);

  return an.localeCompare(bn, "ko");
};

export const sortBOMByMaterialRule = (list = []) =>
  [...list].map(i => ({ ...i, name: normalizeName(i.name) }))
           .sort(materialComparator);
