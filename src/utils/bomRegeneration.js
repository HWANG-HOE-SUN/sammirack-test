// src/utils/bomRegeneration.js
// ✅ ProductContext의 BOM 생성 로직을 순수 함수로 추출
// ✅ 견적서 displayName에서 옵션을 역추적하여 BOM 재생성

import { loadAdminPrices, generatePartId, loadExtraOptionsPrices } from './unifiedPriceManager';
import { sortBOMByMaterialRule } from './materialSort';

// ===== 헬퍼 함수들 (ProductContext와 100% 동일) =====
const parseHeightMm = (h) => Number(String(h || "").replace(/[^\d]/g, "")) || 0;

const parseLevel = (levelStr, rackType) => {
  if (!levelStr) return 1;
  if (rackType === "파렛트랙 철판형") {
    const m = String(levelStr).match(/L?(\d+)/);
    return m ? parseInt(m[1]) : 1;
  } else {
    const m = String(levelStr).match(/(\d+)/);
    return m ? parseInt(m[1]) : 1;
  }
};

const parseWD = (size = "") => {
  const m = String(size).replace(/\s+/g, "").match(/W?(\d+)\s*[xX]\s*D?(\d+)/);
  return m ? { w: Number(m[1]), d: Number(m[2]) } : { w: null, d: null };
};

const calcPalletIronShelfPerLevel = (size) => {
  const { w } = parseWD(size);
  if (w === 1380) return 2;
  if (w === 2080) return 3;
  if (w === 2580) return 4;
  return 1;
};

const calcHighRackShelfPerLevel = (size) => {
  const { d } = parseWD(size);
  if (d === 108) return 1;
  if (d === 150 || d === 200) return 2;
  return 1;
};

const calcBracingBoltCount = (heightRaw, isConn, qty) => {
  let heightMm = parseHeightMm(heightRaw);
  const baseHeight = 1500;
  let perUnit = 10 + Math.max(0, Math.floor((heightMm - baseHeight) / 500)) * 2;
  if (isConn) perUnit = Math.floor(perUnit / 2);
  return perUnit * qty;
};

const calcBrushingRubberCount = (postQty) => postQty;

const extractWeightOnly = (color = "") => {
  const m = String(color).match(/(\d{2,4}kg)/);
  return m ? m[1] : "";
};

const normalizePartName = (name = "") => {
  return name.replace(/브레싱고무/g, "브러싱고무");
};

const applyAdminEditPrice = (item) => {
  try {
    const stored = localStorage.getItem('admin_edit_prices') || '{}';
    const priceData = JSON.parse(stored);
    const partId = generatePartId(item);
    const adminPrice = priceData[partId];

    if (adminPrice && adminPrice.price > 0) {
      return {
        ...item,
        unitPrice: adminPrice.price,
        totalPrice: adminPrice.price * (Number(item.quantity) || 0),
        hasAdminPrice: true,
        originalUnitPrice: item.unitPrice
      };
    }
  } catch (error) {
    console.error('관리자 단가 적용 실패:', error);
  }
  return item;
};

const ensureSpecification = (row, ctx = {}) => {
  if (!row) return row;
  const { size, height, weight } = ctx;
  row.name = normalizePartName(row.name || "");
  const weightOnly = weight ? extractWeightOnly(weight) : "";

  if (!row.specification || !row.specification.trim()) {
    const nm = row.name || "";

    if (/브러싱고무|브레싱고무|브레싱볼트|앙카볼트/.test(nm)) {
      row.specification = "";
    } else if (/(수평|경사)브레?싱/.test(nm)) {
      const { d } = parseWD(size || "");
      row.specification = d ? `${d}` : "";
    } else if (/^기둥$/.test(nm) && height) {
      row.specification = `${height}`;
    } else if (/^로드빔$/.test(nm)) {
      const { w } = parseWD(size || "");
      row.specification = w ? `${w}` : "";
    } else if (/^타이빔$/.test(nm)) {
      const { d } = parseWD(size || "");
      row.specification = d ? `${d}` : "";
    } else if (/^선반$/.test(nm)) {
      const { w, d } = parseWD(size || "");
      if (row.rackType === "경량랙" || row.rackType === "중량랙") {
        row.specification = w && d ? `W${w}xD${d}` : "";
      } else {
        row.specification = `사이즈 ${size || ""}${weightOnly ? ` ${weightOnly}` : ""}`;
      }
    } else if (/받침\(상\)/.test(nm) || /받침\(하\)/.test(nm)) {
      const { d } = parseWD(size || "");
      row.specification = d ? `D${d}` : "";
    } else if (/연결대/.test(nm)) {
      const { w } = parseWD(size || "");
      row.specification = w ? `W${w}` : "";
    } else if (/^안전핀$/.test(nm) || /^안전좌$/.test(nm)) {
      row.specification = "";
    }
  } else {
    if (weightOnly && row.rackType === "하이랙" && !row.specification.includes(weightOnly)) {
      row.specification = `${row.specification} ${weightOnly}`;
    }
  }

  return row;
};

const appendCommonHardwareIfMissing = (base, selectedType, selectedOptions, qty) => {
  const names = new Set(base.map(b => normalizePartName(b.name)));
  const sz = selectedOptions.size || "";
  const ht = selectedOptions.height || "";

  const pushIfAbsent = (name, quantity, specification = '') => {
    const normalized = normalizePartName(name);
    if (!names.has(normalized)) {
      base.push({
        rackType: selectedType,
        size: sz,
        name,
        specification,
        note: "",
        quantity,
        unitPrice: 0,
        totalPrice: 0
      });
      names.add(normalized);
    }
  };

  if (selectedType === "파렛트랙" || selectedType === "파렛트랙 철판형") {
    const isConn = selectedOptions.formType === "연결형";
    const qtyNum = Number(qty) || 1;
    const postQty = isConn ? 2 * qtyNum : 4 * qtyNum;
    const braceBolt = calcBracingBoltCount(ht, isConn, qtyNum);
    const rubber = calcBrushingRubberCount(postQty);
    const heightMm = parseHeightMm(ht);
    const baseHeight = 1500;
    const heightStep = 500;
    const baseDiagonal = isConn ? 2 : 4;
    const additionalSteps = Math.max(0, Math.floor((heightMm - baseHeight) / heightStep));
    const additionalDiagonal = (isConn ? 1 : 2) * additionalSteps;
    const diagonal = (baseDiagonal + additionalDiagonal) * qtyNum;
    const horizontal = (isConn ? 2 : 4) * qtyNum;
    const anchor = (isConn ? 2 : 4) * qtyNum;

    const { d } = parseWD(sz);
    const bracingSpec = d ? `${d}` : '';

    pushIfAbsent("수평브레싱", horizontal, bracingSpec);
    pushIfAbsent("경사브레싱", diagonal, bracingSpec);
    pushIfAbsent("앙카볼트", anchor, '');
    pushIfAbsent("브레싱볼트", braceBolt, '');
    pushIfAbsent("브러싱고무", rubber, '');
  }
};

// ===== 메인 함수: displayName에서 BOM 재생성 =====
/**
 * displayName 파싱하여 옵션 추출
 * 
 * ✅ 수정 (1208): "파렛트랙 철판형" 같은 2단어 랙타입 처리
 * 
 * 예1: "파렛트랙 독립형 2580x1000 2500 L1" 
 * → { type: "파렛트랙", formType: "독립형", size: "2580x1000", height: "2500", level: "L1" }
 * 
 * 예2: "파렛트랙 철판형 독립형 2580x1000 2500 L1"
 * → { type: "파렛트랙 철판형", formType: "독립형", size: "2580x1000", height: "2500", level: "L1" }
 */
export const parseDisplayNameToOptions = (displayName) => {
  if (!displayName) return null;

  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 4) return null;

  // ✅ "파렛트랙 철판형" 같은 2단어 랙타입 처리
  let type, formType, size, height, level, color, weight;
  
  if (parts[0] === "파렛트랙" && parts[1] === "철판형") {
    // "파렛트랙 철판형 독립형 2580x1000 2500 L1"
    type = "파렛트랙 철판형";
    formType = parts[2];  // 독립형
    size = parts[3];      // 2580x1000
    height = parts[4];    // 2500
    level = parts[5] || '';
    color = parts[6] || '';
    weight = parts[7] || '';
  } else {
    // 일반 랙 (1단어 랙타입)
    type = parts[0];      // 파렛트랙, 경량랙, 중량랙, 하이랙, 스텐랙
    formType = parts[1];  // 독립형
    size = parts[2];      // 2580x1000
    height = parts[3];    // 2500
    level = parts[4] || '';
    color = parts[5] || '';
    weight = parts[6] || '';
  }

  console.log('🔍 displayName 파싱:', { displayName, type, formType, size, height, level });

  return { type, formType, size, height, level, color, weight };
};

/**
 * 옵션 기반 BOM 재생성 (ProductContext 로직 100% 재현)
 */
export const regenerateBOMFromOptions = (options, quantity, bomData = null) => {
  if (!options || !options.type) {
    console.error('❌ regenerateBOMFromOptions: 옵션이 유효하지 않음');
    return [];
  }

  const selectedType = options.type;
  const selectedOptions = {
    formType: options.formType,
    size: options.size,
    height: options.height,
    level: options.level,
    color: options.color,
    weight: options.weight
  };
  const qty = Number(quantity) || 1;

  console.log('🔧 BOM 재생성 시작:', { selectedType, selectedOptions, qty });

  // ===== 파렛트랙 / 파렛트랙 철판형 =====
  if (selectedType === "파렛트랙" || selectedType === "파렛트랙 철판형") {
    const lvl = parseLevel(selectedOptions.level, selectedType);
    const sz = selectedOptions.size || "";
    const ht = selectedOptions.height || "";
    const form = selectedOptions.formType || "독립형";
    const { w, d } = parseWD(sz);
    const loadSpec = w != null ? String(w) : "";
    const tieSpec = d != null ? String(d) : "";

    const base = [
      { rackType: selectedType, size: sz, name: "기둥", specification: `${ht}`, quantity: (form === "연결형" ? 2 : 4) * qty, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: "로드빔", specification: loadSpec, quantity: 2 * lvl * qty, unitPrice: 0, totalPrice: 0 },
      ...(selectedType === "파렛트랙 철판형" ? [] : [
        { rackType: selectedType, size: sz, name: "타이빔", specification: tieSpec, quantity: 2 * lvl * qty, unitPrice: 0, totalPrice: 0 },
      ]),
      { rackType: selectedType, size: sz, name: "안전핀", specification: "", quantity: 2 * lvl * 2 * qty, unitPrice: 0, totalPrice: 0 },
    ];

    if (selectedType === "파렛트랙 철판형") {
      const shelfPerLevel = calcPalletIronShelfPerLevel(sz);
      base.push({
        rackType: selectedType, size: sz, name: "선반",
        specification: `사이즈 ${sz}`, quantity: shelfPerLevel * lvl * qty, unitPrice: 0, totalPrice: 0
      });
    }

    appendCommonHardwareIfMissing(base, selectedType, selectedOptions, qty);

    const normalized = base.map(r => ensureSpecification(r, { size: sz, height: ht, ...parseWD(sz) }));
    const withAdmin = normalized.map(applyAdminEditPrice);
    return sortBOMByMaterialRule(withAdmin.filter(r => !/베이스볼트/.test(r.name)));
  }

  // ===== 하이랙 =====
  if (selectedType === "하이랙") {
    const color = selectedOptions.color || "";
    const size = selectedOptions.size || "";
    const heightValue = selectedOptions.height || "";
    const level = parseLevel(selectedOptions.level, selectedType);
    const weightOnly = extractWeightOnly(color);
    const pillarQty = (selectedOptions.formType === "연결형" ? 2 : 4) * qty;
    const { w, d } = parseWD(size);
    const rodBeamNum = d ? String(d) : '';
    const shelfNum = w ? String(w) : '';
    const shelfPerLevel = calcHighRackShelfPerLevel(size);
  
    const list = [
      {
        rackType: selectedType,
        name: "기둥",
        specification: `높이 ${heightValue}${weightOnly ? ` ${weightOnly}` : ""}`,
        colorWeight: color, // ✅ 핵심: 원본 색상 저장
        quantity: pillarQty,
        unitPrice: 0,
        totalPrice: 0
      },
      {
        rackType: selectedType,
        name: "로드빔",
        specification: `${rodBeamNum}${weightOnly ? ` ${weightOnly}` : ""}`,
        colorWeight: color, // ✅ 핵심: 원본 색상 저장
        quantity: 2 * level * qty,
        unitPrice: 0,
        totalPrice: 0
      },
      {
        rackType: selectedType,
        name: "선반",
        specification: `사이즈 ${size}${weightOnly ? ` ${weightOnly}` : ""}`,
        colorWeight: color, // ✅ 핵심: 원본 색상 저장
        quantity: shelfPerLevel * level * qty,
        unitPrice: 0,
        totalPrice: 0
      }
    ].map(r => ensureSpecification(r, { size, height: heightValue, ...parseWD(size), weight: weightOnly }));
  
    const listWithAdminPrices = list.map(applyAdminEditPrice);
    return sortBOMByMaterialRule(listWithAdminPrices);
  }

  // ===== 스텐랙 =====
  if (selectedType === "스텐랙") {
    const heightValue = selectedOptions.height || "";
    const sz = selectedOptions.size || "";
    const sizeFront = (sz.split("x")[0]) || sz;
    const levelNum = parseInt((selectedOptions.level || "").replace(/[^\d]/g, "")) || 0;

    const list = [
      { rackType: selectedType, name: "기둥", specification: `높이 ${heightValue}`, quantity: 4 * qty, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, name: "선반", specification: `사이즈 ${sz}`, quantity: levelNum * qty, unitPrice: 0, totalPrice: 0 },
    ].map(r => ensureSpecification(r, { size: sz, height: heightValue, ...parseWD(sz) }));

    const listWithAdminPrices = list.map(applyAdminEditPrice);
    return sortBOMByMaterialRule(listWithAdminPrices);
  }

  // ===== 경량랙 / 중량랙 =====
  if (selectedType === "경량랙" || selectedType === "중량랙") {
    const sz = selectedOptions.size || "";
    const ht = selectedOptions.height || "";
    const level = parseLevel(selectedOptions.level, selectedType);
    const form = selectedOptions.formType || "독립형";
    const { w, d } = parseWD(sz);

    const base = [
      { rackType: selectedType, size: sz, name: "기둥", specification: ``, quantity: (form === "연결형" ? 2 : 4) * qty, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: "받침(상)", specification: ``, quantity: (form === "연결형" ? 2 : 4) * qty, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: "받침(하)", specification: ``, quantity: (form === "연결형" ? 2 : 4) * qty, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: "연결대", specification: ``, quantity: level * qty, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: "선반", specification: "", quantity: level * qty, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: "안전좌", specification: ``, quantity: level * qty, unitPrice: 0, totalPrice: 0 },
      { rackType: selectedType, size: sz, name: "안전핀", specification: ``, quantity: level * qty, unitPrice: 0, totalPrice: 0 },
    ];

    const normalized = base.map(r => ensureSpecification(r, { size: sz, height: ht, ...parseWD(sz) }));
    const withAdmin = normalized.map(applyAdminEditPrice);
    return sortBOMByMaterialRule(withAdmin);
  }

  console.warn('⚠️ 알 수 없는 랙 타입:', selectedType);
  return [];
};

/**
 * displayName에서 직접 BOM 재생성 (최상위 함수)
 */
export const regenerateBOMFromDisplayName = (displayName, quantity) => {
  const options = parseDisplayNameToOptions(displayName);
  if (!options) {
    console.warn('⚠️ displayName 파싱 실패 - 기타 품목으로 처리:', displayName);
    return []; // ✅ 빈 배열 반환 (HistoryPage에서 기타 품목으로 처리)
  }

  return regenerateBOMFromOptions(options, quantity);
};
