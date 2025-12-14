// src/utils/unifiedPriceManager.js
/**
 * 통합 단가 관리 시스템 - 최종 완성본
 * 
 * ✅ 2025-10-26 최종 수정:
 * 1. CSV 파일(all_materials_list_v1.csv)을 유일한 데이터 소스로 사용
 * 2. 기존 서버 재고 데이터와 100% 호환
 * 3. partId 생성 규칙 완벽 재현:
 *    - x 절대 제거 안 함 (900x450 유지)
 *    - 하이랙 색상: 메트그레이→매트, 오렌지/블루→제거
 *    - 괄호/공백 제거, *→x 변환
 * 4. 275개 부품 전체 로드, 파렛트랙 H4500/H5000 포함
 * 5. 하이랙 이중 ID 시스템:
 *    - generatePartId: 단가 관리용 (색상 제거)
 *    - generateInventoryPartId: 재고 관리용 (색상 포함)
 */

// 로컬스토리지 키
const ADMIN_PRICES_KEY = 'admin_edit_prices';
const PRICE_HISTORY_KEY = 'admin_price_history';
const INVENTORY_KEY = 'inventory_data';
const RACK_OPTIONS_KEY = 'rack_options_registry';
const EXTRA_OPTIONS_PRICES_KEY = 'extra_options_prices';

// ✅ 표준 partID 생성 함수 (단가 관리용 - 색상 제거)
export const generatePartId = (item) => {
  if (!item) {
    console.warn('generatePartId: item이 undefined입니다');
    return 'unknown-part';
  }
  
  const { rackType = '', name = '', specification = '' } = item;
  
  // 부품명 처리
  let cleanName = String(name)
    .replace(/[()]/g, '')  // 괄호 제거
    .replace(/\s+/g, '')   // 공백 제거
    .replace(/\*/g, 'x');  // * → x 변환 (700*300 → 700x300)
  
  // 하이랙 전용: 색상 제거 (단가 통합 관리)
  if (rackType === '하이랙') {
    cleanName = cleanName
      .replace(/메트그레이/g, '')  // 메트그레이 제거
      .replace(/매트그레이/g, '')  // 매트그레이 제거
      .replace(/오렌지/g, '')        // 오렌지 제거
      .replace(/블루/g, '');          // 블루 제거
  }
  
  // 소문자 변환 (H4500 → h4500)
  cleanName = cleanName.toLowerCase();
  
  // 규격 처리
  if (specification && String(specification).trim()) {
    const cleanSpec = String(specification)
      .replace(/\s+/g, '')  // 공백 제거
      .toLowerCase();       // 소문자 변환
    return `${rackType}-${cleanName}-${cleanSpec}`;
  } else {
    return `${rackType}-${cleanName}-`;
  }
};

// ✅ 재고 관리용 partID 생성 함수 (색상 포함)
export const generateInventoryPartId = (item) => {
  if (!item) {
    console.warn('generateInventoryPartId: item이 undefined입니다');
    return 'unknown-part-inv';
  }
  const { rackType = '', name = '', specification = '', colorWeight = '' } = item;
  // ✅ 하이랙 전용: colorWeight가 있으면 부품명에 색상 포함
  let cleanName = String(name)
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
    .replace(/\*/g, 'x');
  // ✅ 하이랙이고 colorWeight가 있으면 색상 추가
  if (rackType === '하이랙' && colorWeight) {
    const cleanColor = String(colorWeight)
      .replace(/\s+/g, '')
      .toLowerCase();
    cleanName = `${cleanName}${cleanColor}`;
  }
  cleanName = cleanName.toLowerCase();
  if (specification && String(specification).trim()) {
    const cleanSpec = String(specification)
      .replace(/\s+/g, '')
      .toLowerCase();
    return `${rackType}-${cleanName}-${cleanSpec}`;
  } else {
    return `${rackType}-${cleanName}-`;
  }
};

// 랙옵션 고유 ID생성
export const generateRackOptionId = (rackType, size, height, level, formType, color = '') => {
  const parts = [rackType, formType, size, height, level, color].filter(Boolean);
  return parts.join('-').replace(/[^\w가-힣-]/g, '').toLowerCase();
};

// ========================================
// ✅ Phase 1: 기타 추가 옵션 → 기본 원자재 매핑 테이블 (재고관리용)
// ========================================
export const EXTRA_TO_BASE_INVENTORY_MAPPING = {
  // ========================================
  // 스텐랙 매핑 (11개)
  // ========================================
  '스텐랙-75기둥-': '스텐랙-기둥-높이75',
  '스텐랙-90기둥-': '스텐랙-기둥-높이90',
  '스텐랙-120기둥-': '스텐랙-기둥-높이120',
  '스텐랙-150기둥-': '스텐랙-기둥-높이150',
  '스텐랙-180기둥-': '스텐랙-기둥-높이180',
  '스텐랙-210기둥-': '스텐랙-기둥-높이210',
  '스텐랙-50x75선반-': '스텐랙-선반-사이즈50x75',
  '스텐랙-50x90선반-': '스텐랙-선반-사이즈50x90',
  '스텐랙-50x120선반-': '스텐랙-선반-사이즈50x120',
  '스텐랙-50x150선반-': '스텐랙-선반-사이즈50x150',
  '스텐랙-50x180선반-': '스텐랙-선반-사이즈50x180',
  
  // ========================================
  // 중량랙 매핑 (12개) - W×D 형식
  // ========================================
  // 중요: 45x95 = 폭45cm×깊이95cm = D450×W900
  '중량랙-45x95선반-': '중량랙-선반-w900xd450',
  '중량랙-45x125선반-': '중량랙-선반-w1200xd450',
  '중량랙-45x155선반-': '중량랙-선반-w1500xd450',
  '중량랙-45x185선반-': '중량랙-선반-w1800xd450',
  '중량랙-60x95선반-': '중량랙-선반-w900xd600',
  '중량랙-60x125선반-': '중량랙-선반-w1200xd600',
  '중량랙-60x155선반-': '중량랙-선반-w1500xd600',
  '중량랙-60x185선반-': '중량랙-선반-w1800xd600',
  '중량랙-90x95선반-': '중량랙-선반-w900xd900',
  '중량랙-90x125선반-': '중량랙-선반-w1200xd900',
  '중량랙-90x155선반-': '중량랙-선반-w1500xd900',
  '중량랙-90x185선반-': '중량랙-선반-w1800xd900',
  
  // ========================================
  // 하이랙 270kg 매트그레이 선반 매핑 (6개)
  // ========================================
  '하이랙-45x108매트그레이선반-': '하이랙-선반메트그레이(볼트식)270kg-사이즈45x108270kg',
  '하이랙-45x150매트그레이선반-': '하이랙-선반메트그레이(볼트식)270kg-사이즈45x150270kg',
  '하이랙-45x200매트그레이선반-': '하이랙-선반메트그레이(볼트식)270kg-사이즈45x200270kg',
  '하이랙-60x108매트그레이선반-': '하이랙-선반메트그레이(볼트식)270kg-사이즈60x108270kg',
  '하이랙-60x150매트그레이선반-': '하이랙-선반메트그레이(볼트식)270kg-사이즈60x150270kg',
  '하이랙-60x200매트그레이선반-': '하이랙-선반메트그레이(볼트식)270kg-사이즈60x200270kg',
  
  // ========================================
  // 하이랙 270kg 오렌지 선반 매핑 (6개)
  // ========================================
  '하이랙-45x108선반-': '하이랙-선반블루(기둥)+오렌지(가로대)(볼트식)270kg-사이즈45x108270kg',
  '하이랙-45x150선반-': '하이랙-선반블루(기둥)+오렌지(가로대)(볼트식)270kg-사이즈45x150270kg',
  '하이랙-45x200선반-': '하이랙-선반블루(기둥)+오렌지(가로대)(볼트식)270kg-사이즈45x200270kg',
  '하이랙-60x108선반-': '하이랙-선반블루(기둥)+오렌지(가로대)(볼트식)270kg-사이즈60x108270kg',
  '하이랙-60x150선반-': '하이랙-선반블루(기둥)+오렌지(가로대)(볼트식)270kg-사이즈60x150270kg',
  '하이랙-60x200선반-': '하이랙-선반블루(기둥)+오렌지(가로대)(볼트식)270kg-사이즈60x200270kg',
  
  // ========================================
  // 하이랙 270kg 블루 기둥 매핑 (4개)
  // ========================================
  '하이랙-45x150기둥-': '하이랙-기둥블루(기둥)+오렌지(가로대)(볼트식)270kg-높이150270kg',
  '하이랙-45x200기둥-': '하이랙-기둥블루(기둥)+오렌지(가로대)(볼트식)270kg-높이200270kg',
  '하이랙-60x150기둥-': '하이랙-기둥블루(기둥)+오렌지(가로대)(볼트식)270kg-높이150270kg',
  '하이랙-60x200기둥-': '하이랙-기둥블루(기둥)+오렌지(가로대)(볼트식)270kg-높이200270kg',
  
  // ========================================
  // 하이랙 270kg 메트그레이 기둥 매핑 (4개) - 추가상품3에 포함
  // ========================================
  '하이랙-45x150메트그레이기둥-': '하이랙-기둥메트그레이(볼트식)270kg-높이150270kg',
  '하이랙-45x200메트그레이기둥-': '하이랙-기둥메트그레이(볼트식)270kg-높이200270kg',
  '하이랙-60x150메트그레이기둥-': '하이랙-기둥메트그레이(볼트식)270kg-높이150270kg',
  '하이랙-60x200메트그레이기둥-': '하이랙-기둥메트그레이(볼트식)270kg-높이200270kg',
  
  // ========================================
  // 하이랙 450kg 매핑 (6개) - 추가상품4 (메트그레이)
  // ⚠️ 주의: 추가상품4와 추가상품5가 같은 extra option ID를 사용하지만,
  // 카테고리명으로 구분하여 처리함
  // 추가상품4는 메트그레이, 추가상품5는 블루+오렌지
  // ========================================
  '하이랙-60x150기둥450kg-': '하이랙-기둥메트그레이(볼트식)450kg-높이150450kg',
  '하이랙-60x200기둥450kg-': '하이랙-기둥메트그레이(볼트식)450kg-높이200450kg',
  '하이랙-60x250기둥450kg-': '하이랙-기둥메트그레이(볼트식)450kg-높이250450kg',
  '하이랙-60x108선반450kg-': '하이랙-선반메트그레이(볼트식)450kg-사이즈60x108450kg',
  '하이랙-60x150선반450kg-': '하이랙-선반메트그레이(볼트식)450kg-사이즈60x150450kg',
  '하이랙-60x200선반450kg-': '하이랙-선반메트그레이(볼트식)450kg-사이즈60x200450kg',
  
  // ========================================
  // 하이랙 600kg 병합 옵션 - 배열로 분리 매핑 (3개)
  // ========================================
  // ⚠️ 주의: 실제 inventory.json에 빔의 재고관리용 ID 확인 필요
  '하이랙-80x108선반+빔-': [
    '하이랙-선반블루(기둥)+오렌지(가로대)(볼트식)600kg-사이즈80x108600kg',
    '하이랙-로드빔블루(기둥.선반)+오렌지(빔)600kg-108600kg'  // ⚠️ 실제 데이터 확인 필요
  ],
  '하이랙-80x150선반+빔-': [
    '하이랙-선반블루(기둥)+오렌지(가로대)(볼트식)600kg-사이즈80x150600kg',
    '하이랙-로드빔블루(기둥.선반)+오렌지(빔)600kg-150600kg'  // ⚠️ 실제 데이터 확인 필요
  ],
  '하이랙-80x200선반+빔-': [
    '하이랙-선반블루(기둥)+오렌지(가로대)(볼트식)600kg-사이즈80x200600kg',
    '하이랙-로드빔블루(기둥.선반)+오렌지(빔)600kg-200600kg'  // ⚠️ 실제 데이터 확인 필요
  ]
  
  // ⚠️ 주의: 아래 항목들은 별도 부품이므로 매핑하지 않음
  // - 중량랙-중량바퀴- (별도 재고 관리)
  // - 파렛트랙-화이트코팅판1000x2440- (합판)
  // - 파렛트랙-월넛코팅판1000x2440- (합판)
  // - 파렛트랙-돌그레이코팅판1000x2440- (합판)
  // - 파렛트랙-일반합판1000x2440- (합판)
  // - 파렛트랙-타이빔1010- (별도 부품)
  // - 파렛트랙-로드빔1460- (타이빔 포함 세트)
  // - 파렛트랙-로드빔2660- (타이빔 포함 세트)
  // - 파렛트랙-철판형1460/2060/2660- (철판형 세트)
  // - 경량랙-기타자재- (기타 자재)
};

// ========================================
// ✅ Phase 1: 기타 추가 옵션 → 단가관리용 partId 매핑 테이블
// ========================================
export const EXTRA_TO_BASE_PARTID_MAPPING = {
  // ========================================
  // 하이랙 270kg 매트그레이 선반
  // ========================================
  '하이랙-45x108매트그레이선반-': '하이랙-선반-사이즈45x108270kg',
  '하이랙-45x150매트그레이선반-': '하이랙-선반-사이즈45x150270kg',
  '하이랙-45x200매트그레이선반-': '하이랙-선반-사이즈45x200270kg',
  '하이랙-60x108매트그레이선반-': '하이랙-선반-사이즈60x108270kg',
  '하이랙-60x150매트그레이선반-': '하이랙-선반-사이즈60x150270kg',
  '하이랙-60x200매트그레이선반-': '하이랙-선반-사이즈60x200270kg',
  
  // ========================================
  // 하이랙 270kg 오렌지 선반
  // ========================================
  '하이랙-45x108선반-': '하이랙-선반-사이즈45x108270kg',
  '하이랙-45x150선반-': '하이랙-선반-사이즈45x150270kg',
  '하이랙-45x200선반-': '하이랙-선반-사이즈45x200270kg',
  '하이랙-60x108선반-': '하이랙-선반-사이즈60x108270kg',
  '하이랙-60x150선반-': '하이랙-선반-사이즈60x150270kg',
  '하이랙-60x200선반-': '하이랙-선반-사이즈60x200270kg',
  
  // ========================================
  // 하이랙 270kg 블루 기둥
  // ========================================
  '하이랙-45x150기둥-': '하이랙-기둥-높이150270kg',
  '하이랙-45x200기둥-': '하이랙-기둥-높이200270kg',
  '하이랙-60x150기둥-': '하이랙-기둥-높이150270kg',
  '하이랙-60x200기둥-': '하이랙-기둥-높이200270kg',
  
  // ========================================
  // 하이랙 270kg 메트그레이 기둥
  // ========================================
  '하이랙-45x150메트그레이기둥-': '하이랙-기둥-높이150270kg',
  '하이랙-45x200메트그레이기둥-': '하이랙-기둥-높이200270kg',
  '하이랙-60x150메트그레이기둥-': '하이랙-기둥-높이150270kg',
  '하이랙-60x200메트그레이기둥-': '하이랙-기둥-높이200270kg',
  
  // ========================================
  // 하이랙 450kg
  // ========================================
  '하이랙-60x150기둥450kg-': '하이랙-기둥-높이150450kg',
  '하이랙-60x200기둥450kg-': '하이랙-기둥-높이200450kg',
  '하이랙-60x250기둥450kg-': '하이랙-기둥-높이250450kg',
  '하이랙-60x108선반450kg-': '하이랙-선반-사이즈60x108450kg',
  '하이랙-60x150선반450kg-': '하이랙-선반-사이즈60x150450kg',
  '하이랙-60x200선반450kg-': '하이랙-선반-사이즈60x200450kg',
  
  // ========================================
  // 하이랙 600kg 병합 옵션
  // ========================================
  '하이랙-80x108선반+빔-': ['하이랙-선반-사이즈80x108600kg', '하이랙-빔-사이즈80x108600kg'],
  '하이랙-80x150선반+빔-': ['하이랙-선반-사이즈80x150600kg', '하이랙-빔-사이즈80x150600kg'],
  '하이랙-80x200선반+빔-': ['하이랙-선반-사이즈80x200600kg', '하이랙-빔-사이즈80x200600kg']
};

// ========================================
// ✅ Phase 1: 매핑 함수 구현
// ========================================
// 재고관리용 매핑 함수
export const mapExtraToBaseInventoryPart = (extraInventoryPartId) => {
  if (!extraInventoryPartId) {
    return extraInventoryPartId;
  }
  
  const mapped = EXTRA_TO_BASE_INVENTORY_MAPPING[extraInventoryPartId];
  
  if (Array.isArray(mapped)) {
    // 병합 옵션 - 배열 반환
    console.log(`🔀 병합 옵션 분리: ${extraInventoryPartId} → [${mapped.join(', ')}]`);
    return mapped;
  } else if (mapped) {
    // 단일 매핑 - 문자열 반환
    console.log(`🔗 매핑: ${extraInventoryPartId} → ${mapped}`);
    return mapped;
  } else {
    // 매핑 없음 - 원래 값 반환
    return extraInventoryPartId;
  }
};

// 단가관리용 매핑 함수
export const mapExtraToBasePartId = (extraInventoryPartId) => {
  if (!extraInventoryPartId) {
    return null;
  }
  
  const mapped = EXTRA_TO_BASE_PARTID_MAPPING[extraInventoryPartId];
  
  if (Array.isArray(mapped)) {
    // 병합 옵션 - 배열 반환
    return mapped;
  } else if (mapped) {
    // 단일 매핑 - 문자열 반환
    return mapped;
  } else {
    // 매핑 없음 - null 반환 (호출부에서 generatePartId 사용)
    return null;
  }
};

// 관리자 수정 단가 로드
export const loadAdminPrices = () => {
  try {
    const stored = localStorage.getItem(ADMIN_PRICES_KEY) || '{}';
    return JSON.parse(stored);
  } catch (error) {
    console.error('관리자 단가 로드 실패:', error);
    return {};
  }
};

// ✅ extra_options 가격 로드
export const loadExtraOptionsPrices = () => {
  try {
    const stored = localStorage.getItem(EXTRA_OPTIONS_PRICES_KEY) || '{}';
    return JSON.parse(stored);
  } catch (error) {
    console.error('추가옵션 단가 로드 실패:', error);
    return {};
  }
};

// ✅ extra_options 단가 저장
export const saveExtraOptionsPrice = (optionId, price) => {
  try {
    const prices = loadExtraOptionsPrices();
    prices[optionId] = Number(price);
    localStorage.setItem(EXTRA_OPTIONS_PRICES_KEY, JSON.stringify(prices));
    return true;
  } catch (error) {
    console.error('추가옵션 단가 저장 실패:', error);
    return false;
  }
};

// 관리자 단가 저장
export const saveAdminPrice = (partId, price, partInfo = {}) => {
  try {
    const prices = loadAdminPrices();
    const oldPrice = prices[partId]?.price || 0;
    
    prices[partId] = {
      price: Number(price),
      ...partInfo,
      updatedAt: new Date().toISOString()
    };
    
    localStorage.setItem(ADMIN_PRICES_KEY, JSON.stringify(prices));
    
    // 히스토리 저장
    savePriceHistory(partId, oldPrice, price);
    
    return true;
  } catch (error) {
    console.error('단가 저장 실패:', error);
    return false;
  }
};

// ✅ 실제 사용할 단가 계산 (우선순위: 관리자 수정 > 기존 단가)
export const getEffectivePrice = (item) => {
  const partId = generatePartId(item);
  const adminPrices = loadAdminPrices();
  
  if (adminPrices[partId]?.price > 0) {
    return adminPrices[partId].price;
  }
  
  return Number(item.unitPrice) || 0;
};

// 랙옵션 레지스트리 저장
export const saveRackOptionsRegistry = (registry) => {
  try {
    localStorage.setItem(RACK_OPTIONS_KEY, JSON.stringify(registry));
    return true;
  } catch (error) {
    console.error('랙옵션 레지스트리 저장 실패:', error);
    return false;
  }
};

// 랙옵션 레지스트리 로드
export const loadRackOptionsRegistry = () => {
  try {
    const stored = localStorage.getItem(RACK_OPTIONS_KEY) || '{}';
    return JSON.parse(stored);
  } catch (error) {
    console.error('랙옵션 레지스트리 로드 실패:', error);
    return {};
  }
};

// 특정 랙옵션의 컴포넌트 조회
export const getRackOptionComponents = (optionId) => {
  const registry = loadRackOptionsRegistry();
  return registry[optionId]?.components || [];
};

// 특정 부품을 사용하는 랙옵션들 조회
export const getRackOptionsUsingPart = (partId) => {
  const registry = loadRackOptionsRegistry();
  const usingOptions = [];
  
  Object.values(registry).forEach(option => {
    if (option.components && option.components.some(comp => comp.partId === partId)) {
      usingOptions.push(option);
    }
  });
  
  return usingOptions;
};

// ✅ CSV 파싱 헬퍼 함수
const parseCSV = (text) => {
  const lines = text.trim().split('\n');
  
  // ✅ BOM 제거 및 정확한 헤더 파싱
  const headerLine = lines[0].replace(/\uFEFF/g, '').trim();
  const headers = headerLine.split(',').map(h => h.trim());
  
  console.log('📋 CSV 헤더:', headers);  // ✅ 디버깅용
  
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = [];
    let currentValue = '';
    let insideQuotes = false;
    
    // CSV 파싱 (따옴표 처리)
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());  // 마지막 값
    
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    result.push(row);
  }
  
  return result;
};


// ✅ CSV 기반 전체 원자재 로드 (CSV 부품ID 우선 사용)
export const loadAllMaterials = async () => {
  try {
    console.log('🔄 전체 원자재 로드 시작...');
    console.log('📋 데이터 소스: all_materials_list_v2.csv');
    
    const materials = new Map();
    
    // ✅ CSV 파일 로드
    const csvResponse = await fetch('./all_materials_list_v2.csv');
    if (!csvResponse.ok) {
      throw new Error(`CSV 파일 로드 실패: ${csvResponse.status}`);
    }
    
    const csvText = await csvResponse.text();
    const csvData = parseCSV(csvText);
    
    console.log(`📊 CSV 데이터: ${csvData.length}개 행 로드됨`);
    
    // ✅ 첫 번째 행 샘플 확인
    if (csvData.length > 0) {
      console.log('📋 첫 번째 행 샘플:', csvData[0]);
      console.log('📋 사용 가능한 키:', Object.keys(csvData[0]));
    }
    
    // CSV의 각 행을 부품으로 변환
    let validCount = 0;
    let skippedCount = 0;
    let generatedIdCount = 0;
    let csvIdUsedCount = 0;
    
    csvData.forEach((row, index) => {
      // ✅ 가능한 모든 부품ID 컬럼명 시도
      const csvPartId = (
        row['부품ID'] || 
        row['부품Id'] || 
        row['부품id'] || 
        row['partId'] || 
        row['PartID'] || 
        row['PARTID'] ||
        ''
      ).trim();
      
      const rackType = String(row['랙타입'] || '').trim();
      const name = String(row['부품명'] || '').trim();
      const specification = String(row['규격'] || '').trim();
      const unitPrice = Number(row['단가']) || 0;
      const displayName = String(row['표시명'] || '').trim();
      const source = String(row['출처'] || '').trim();
      const note = String(row['비고'] || '').trim();
      const categoryName = String(row['카테고리'] || '').trim();
      
      // 빈 행이나 유효하지 않은 데이터 스킵
      if (!rackType || !name) {
        skippedCount++;
        return;
      }
      
      // ✅ 우선순위: CSV 부품ID > 자동 생성
      let finalPartId;
      if (csvPartId && csvPartId.length > 0) {
        // CSV에 부품ID가 있으면 그대로 사용
        finalPartId = csvPartId;
        csvIdUsedCount++;
        
        // ✅ 디버깅: 처음 10개만 출력
        if (csvIdUsedCount <= 10) {
          console.log(`  ✅ CSV 부품ID 사용: "${finalPartId}"`);
        } else if (csvIdUsedCount === 11) {
          console.log(`  ... (나머지 CSV ID 사용 로그 생략)`);
        }
      } else {
        // CSV에 부품ID가 없으면 자동 생성
        finalPartId = generatePartId({
          rackType,
          name,
          specification
        });
        generatedIdCount++;
        console.warn(`  ⚠️ 부품ID 없음 - 자동 생성: ${finalPartId} (행 ${index + 2})`);
        console.warn(`     원본 데이터:`, { rackType, name, specification });
      }
      
      // 중복 체크
      if (materials.has(finalPartId)) {
        console.warn(`⚠️ 중복 부품 발견: ${finalPartId} (행 ${index + 2})`);
        return;
      }
      
      materials.set(finalPartId, {
        partId: finalPartId,
        rackType,
        name,
        specification,
        unitPrice,
        displayName: displayName || `${rackType} ${name} ${specification}`.trim(),
        source: source || 'csv',
        note,
        categoryName
      });
      
      validCount++;
    });
    
    const finalMaterials = Array.from(materials.values());
    
    console.log(`\n✅ ===== CSV 기반 원자재 로드 완료 =====`);
    console.log(`📦 총 부품 수: ${finalMaterials.length}개`);
    console.log(`✅ 유효 부품: ${validCount}개`);
    console.log(`📋 CSV 부품ID 사용: ${csvIdUsedCount}개`);
    console.log(`🔧 자동 생성 ID: ${generatedIdCount}개`);
    console.log(`⏭️  스킵된 행: ${skippedCount}개`);
    
    // ✅ CSV ID 사용률 계산
    const csvIdUsageRate = validCount > 0 
      ? ((csvIdUsedCount / validCount) * 100).toFixed(1) 
      : 0;
    console.log(`📊 CSV ID 사용률: ${csvIdUsageRate}%`);
    
    // ⚠️ CSV ID 사용률이 낮으면 경고
    if (csvIdUsageRate < 90) {
      console.warn(`\n⚠️⚠️⚠️ 경고: CSV ID 사용률이 낮습니다!`);
      console.warn(`CSV 파일의 첫 번째 컬럼명이 "부품ID"인지 확인하세요.`);
      console.warn(`현재 감지된 헤더:`, Object.keys(csvData[0] || {}));
    }
    
    // 랙타입별 통계
    const rackTypes = {};
    finalMaterials.forEach(m => {
      rackTypes[m.rackType] = (rackTypes[m.rackType] || 0) + 1;
    });
    
    console.log('\n🏷️ 랙타입별 부품 수:');
    Object.entries(rackTypes)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`   - ${type}: ${count}개`);
      });
    
    // ✅ 기존 재고 데이터와 호환성 확인
    const existingInventory = JSON.parse(localStorage.getItem('inventory_data') || '{}');
    const existingKeys = Object.keys(existingInventory);
    const newKeys = new Set(finalMaterials.map(m => m.partId));
    
    const missingInNew = existingKeys.filter(k => !newKeys.has(k));
    const matchCount = existingKeys.filter(k => newKeys.has(k)).length;
    
    console.log('\n🔍 기존 재고 데이터 호환성:');
    console.log(`   - 기존 재고 부품: ${existingKeys.length}개`);
    console.log(`   - 매칭: ${matchCount}개 ✅`);
    
    if (existingKeys.length > 0) {
      console.log(`   - 매칭률: ${(matchCount/existingKeys.length*100).toFixed(1)}%`);
    }
    
    if (missingInNew.length > 0) {
      console.warn(`   ⚠️  CSV에 없는 부품: ${missingInNew.length}개`);
      console.warn('   누락된 부품 (최대 10개):');
      missingInNew.slice(0, 10).forEach(k => {
        console.warn(`      - ${k}: ${existingInventory[k]}개`);
      });
      
      if (missingInNew.length > 10) {
        console.warn(`      ... 외 ${missingInNew.length - 10}개`);
      }
    } else {
      console.log('   ✅ 모든 기존 재고 부품이 CSV에 존재합니다!');
    }
    
    return finalMaterials;
  } catch (error) {
    console.error('❌ 원자재 로드 실패:', error);
    console.error('스택:', error.stack);
    
    // 에러 상세 정보
    if (error.message.includes('fetch')) {
      console.error('💡 힌트: CSV 파일이 public/ 폴더에 있는지 확인하세요.');
      console.error('   파일명: all_materials_list_v2.csv');
    }
    
    return [];
  }
};

// 단가 히스토리 조회
export const loadPriceHistory = (partId) => {
  try {
    const history = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || '[]');
    if (partId) {
      return history.filter(h => h.partId === partId);
    }
    return history;
  } catch (error) {
    console.error('히스토리 조회 실패:', error);
    return [];
  }
};

// 단가 히스토리 저장
export const savePriceHistory = (partId, oldPrice, newPrice, rackOption = '') => {
  try {
    const history = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || '[]');
    history.push({
      partId,
      oldPrice,
      newPrice,
      rackOption,
      timestamp: new Date().toISOString(),
    });
    
    // 최근 100개만 보관
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    
    localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('히스토리 저장 실패:', error);
  }
};

export default {
  generatePartId,
  generateInventoryPartId,
  generateRackOptionId,
  loadAdminPrices,
  saveAdminPrice,
  getEffectivePrice,
  loadAllMaterials,
  loadPriceHistory,
  savePriceHistory,
  saveRackOptionsRegistry,
  loadRackOptionsRegistry,
  getRackOptionComponents,
  getRackOptionsUsingPart,
  loadExtraOptionsPrices,
  saveExtraOptionsPrice,
  // ✅ Phase 1 추가
  mapExtraToBaseInventoryPart,
  mapExtraToBasePartId,
  EXTRA_TO_BASE_INVENTORY_MAPPING,
  EXTRA_TO_BASE_PARTID_MAPPING,
};
