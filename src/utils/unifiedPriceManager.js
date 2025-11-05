// src/utils/unifiedPriceManager.js

// ===== 최상단 import (문법 에러 방지) =====
import { saveAdminPriceSync } from './realtimeAdminSync';
import { getCanonicalPartId, isDeprecatedPartId } from './canonicalPartIdManager';

// 로컬스토리지 키
const ADMIN_PRICES_KEY = 'admin_edit_prices';
const PRICE_HISTORY_KEY = 'admin_price_history';
const INVENTORY_KEY = 'inventory_data';
const RACK_OPTIONS_KEY = 'rack_options_registry';
const EXTRA_OPTIONS_PRICES_KEY = 'extra_options_prices';

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
      .replace(/오렌지/g, '')      // 오렌지 제거
      .replace(/블루/g, '');        // 블루 제거
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

// =================================================================
// 하이랙 전용: 단가-재고 키 분리 유틸리티 (Phase 3)
// =================================================================

/**
 * 하이랙 부품의 가격키(priceKey)를 생성합니다.
 * 가격키는 무게급 + 규격(W×D) + 높이 + 형식(독립/연결)로 구성되며, 색상을 포함하지 않습니다.
 */
export const generatePriceKey = (item) => {
  if (!item || item.rackType !== '하이랙') {
    return generatePartId(item);
  }

  const { name } = item;
  const basePartId = generatePartId(item);
  const weightMatch = String(name).match(/(\d+kg)/i);
  const extractedWeight = weightMatch ? weightMatch[1].toLowerCase() : '';
  return `${basePartId}${extractedWeight}`;
};

/**
 * ✅ 재고용 ID (색상 포함) - 파일 내 구현 추가
 * 하이랙은 색상 포함, 기타는 generatePartId와 동일
 */
export const generateInventoryPartId = (item) => {
  if (!item) {
    console.warn('generateInventoryPartId: item이 undefined입니다');
    return 'unknown-part';
  }
  const { rackType = '', name = '', specification = '' } = item;

  // 부품명 처리 (재고용: 색상 유지)
  let cleanName = String(name)
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
    .replace(/\*/g, 'x')
    .toLowerCase();

  // 하이랙인 경우 색상 표기가 그대로 남도록 별도 제거 로직 없음
  // (예: 기둥독립형h1500메트그레이)

  const base = `${rackType}-${cleanName}-`;
  if (specification && String(specification).trim()) {
    const cleanSpec = String(specification).replace(/\s+/g, '').toLowerCase();
    return `${rackType}-${cleanName}-${cleanSpec}`;
  }
  return base;
};

/**
 * 하이랙 부품의 재고키(stockKey)를 생성합니다.
 * 재고키는 가격키 + 색상(= generateInventoryPartId에 이미 포함) + 무게 로 구성됩니다.
 */
export const generateStockKey = (item) => {
  if (!item || item.rackType !== '하이랙') {
    return generateInventoryPartId(item);
  }
  const { name } = item;
  const baseInventoryPartId = generateInventoryPartId(item);
  const weightMatch = String(name).match(/(\d+kg)/i);
  const extractedWeight = weightMatch ? weightMatch[1].toLowerCase() : '';
  return `${baseInventoryPartId}${extractedWeight}`;
};

// 랙옵션 고유 ID 생성
export const generateRackOptionId = (rackType, size, height, level, formType, color = '') => {
  const parts = [rackType, formType, size, height, level, color].filter(Boolean);
  return parts.join('-').replace(/[^\w가-힣-]/g, '').toLowerCase();
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

// 관리자 단가 저장 (기존 시그니처 보존)
export const saveAdminPrice = async (partId, price, partInfo = {}) => {
  if (partInfo.rackType !== '하이랙') {
    partInfo.priceKey = partId;
  }
  return await saveAdminPriceSync(partId, price, partInfo);
};

// ✅ 실제 사용할 단가 계산 (우선순위: 관리자 수정 > 기존 단가)
export const getEffectivePrice = (item) => {
  let partId = generatePartId(item);

  if (isDeprecatedPartId(partId)) {
    partId = getCanonicalPartId(partId);
    console.warn(`⚠️ 폐기 partId 감지: ${generatePartId(item)} -> 정본 partId: ${partId}`);
  }
  
  const adminPrices = loadAdminPrices();
  if (adminPrices[partId]?.price > 0) {
    return adminPrices[partId].price;
  }
  return Number(item.unitPrice) || 0;
};

// 랙옵션 레지스트리 저장/로드
export const saveRackOptionsRegistry = (registry) => {
  try {
    localStorage.setItem(RACK_OPTIONS_KEY, JSON.stringify(registry));
    return true;
  } catch (error) {
    console.error('랙옵션 레지스트리 저장 실패:', error);
    return false;
  }
};

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

// ✅ CSV 파싱 헬퍼
const parseCSV = (text) => {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/\uFEFF/g, ''));  // BOM 제거
  
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = [];
    let currentValue = '';
    let insideQuotes = false;
    
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
    values.push(currentValue.trim());
    
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    result.push(row);
  }
  return result;
};

// ✅ CSV 기반 전체 원자재 로드
export const loadAllMaterials = async () => {
  try {
    console.log('🔄 전체 원자재 로드 시작...');
    console.log('📋 데이터 소스: all_materials_list_v1.csv');
    
    const materials = new Map();
    const csvResponse = await fetch('./all_materials_list_v1.csv');
    if (!csvResponse.ok) {
      throw new Error(`CSV 파일 로드 실패: ${csvResponse.status}`);
    }
    
    const csvText = await csvResponse.text();
    const csvData = parseCSV(csvText);
    console.log(`📊 CSV 데이터: ${csvData.length}개 행 로드됨`);
    
    let validCount = 0;
    let skippedCount = 0;
    
    csvData.forEach((row, index) => {
      const rackType = String(row['랙타입'] || '').trim();
      const name = String(row['부품명'] || '').trim();
      const specification = String(row['규격'] || '').trim();
      const unitPrice = Number(row['단가']) || 0;
      const displayName = String(row['표시명'] || '').trim();
      const source = String(row['출처'] || '').trim();
      const note = String(row['비고'] || '').trim();
      const categoryName = String(row['카테고리'] || '').trim();
      
      if (!rackType || !name) {
        skippedCount++;
        return;
      }
      
      const normalizedPartId = generatePartId({
        rackType,
        name,
        specification
      });
      
      if (materials.has(normalizedPartId)) {
        console.warn(`⚠️ 중복 부품 발견: ${normalizedPartId} (행 ${index + 2})`);
        return;
      }
      
      materials.set(normalizedPartId, {
        partId: normalizedPartId,
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
      
      if (validCount <= 5 || validCount > csvData.length - 5) {
        console.log(`  ➕ [${validCount}] ${normalizedPartId}`);
      } else if (validCount === 6) {
        console.log(`  ... (중간 ${csvData.length - 10}개 생략)`);
      }
    });
    
    const finalMaterials = Array.from(materials.values());
    
    console.log(`\n✅ ===== CSV 기반 원자재 로드 완료 =====`);
    console.log(`📦 총 부품 수: ${finalMaterials.length}개`);
    console.log(`✅ 유효 부품: ${validCount}개`);
    console.log(`⏭️  스킵된 행: ${skippedCount}개`);
    
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
    
    const existingInventory = JSON.parse(localStorage.getItem(INVENTORY_KEY) || '{}');
    const existingKeys = Object.keys(existingInventory);
    const newKeys = new Set(finalMaterials.map(m => m.partId));
    
    const missingInNew = existingKeys.filter(k => !newKeys.has(k));
    const matchCount = existingKeys.filter(k => newKeys.has(k)).length;
    
    console.log('\n🔍 기존 재고 데이터 호환성:');
    console.log(`   - 기존 재고 부품: ${existingKeys.length}개`);
    console.log(`   - 매칭: ${matchCount}개 ✅`);
    console.log(`   - 매칭률: ${(existingKeys.length ? (matchCount / existingKeys.length * 100) : 0).toFixed(1)}%`);
    
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
    
    if (error.message.includes('fetch')) {
      console.error('💡 힌트: CSV 파일이 public/ 폴더에 있는지 확인하세요.');
      console.error('   파일명: all_materials_list_v1.csv');
    }
    
    return [];
  }
};

// =================================================================
// 단가 히스토리
// =================================================================

// ✅ 로컬/캐시 기반 히스토리 로더 (누락 보완)
const loadPriceHistory = () => {
  try {
    const raw = localStorage.getItem(PRICE_HISTORY_KEY) || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('가격 히스토리 로드 실패:', e);
    return [];
  }
};

// 단가 히스토리 조회
export const loadPriceHistoryForPart = (partId) => {
  const history = loadPriceHistory();
  if (partId) return history.filter(h => h.partId === partId);
  return history;
};

export default {
  generatePartId,
  generateInventoryPartId,
  generateRackOptionId,
  loadAdminPrices,
  saveAdminPrice,
  getEffectivePrice,
  loadAllMaterials,
  loadPriceHistory: loadPriceHistoryForPart,
  saveRackOptionsRegistry,
  getCanonicalPartId,
  isDeprecatedPartId,
  loadRackOptionsRegistry,
  getRackOptionComponents,
  getRackOptionsUsingPart,
  loadExtraOptionsPrices,
  saveExtraOptionsPrice,
  generatePriceKey,
  generateStockKey,
};
