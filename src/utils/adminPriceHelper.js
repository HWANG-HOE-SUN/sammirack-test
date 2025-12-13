// 관리자 단가 적용을 위한 헬퍼 유틸
// 기존 adminPriceEditor / BOMDisplay 와 동일한 ID 규칙 사용
import { generatePartId } from './unifiedPriceManager';

// export const generatePartId = (item) => {
//   if (!item) return '';
//   const rackType = item.rackType || '';
//   const name = item.name || '';
//   const specification = item.specification || '';
//   const cleanName = String(name).replace(/[^\w가-힣]/g, '');
//   const cleanSpec = String(specification).replace(/[^\w가-힣]/g, '');
//   return `${rackType}-${cleanName}-${cleanSpec}`.toLowerCase();
// };

// adminPrices: localStorage에서 로드한 맵
// item: { rackType, name, specification, unitPrice, quantity ... }
export const resolveAdminPrice = (adminPrices, item) => {
  if (!adminPrices || !item) return null;
  const primaryId = generatePartId(item);
  let record = adminPrices[primaryId];
  if (record && record.price > 0) return record.price;

  // Fallback: rackType 누락된 BOM 데이터 대응
  const cleanName = (item.name || '').replace(/[^\w가-힣]/g, '');
  const cleanSpec = (item.specification || '').replace(/[^\w가-힣]/g, '');
  const suffix = `-${cleanName}-${cleanSpec}`.toLowerCase();

  const foundKey = Object.keys(adminPrices).find(k => k.endsWith(suffix) && adminPrices[k]?.price > 0);
  if (foundKey) {
    return adminPrices[foundKey].price;
  }
  return null;
};

// localStorage 로드
export const loadAdminPricesDirect = () => {
  try {
    const stored = localStorage.getItem('admin_edit_prices') || '{}';
    return JSON.parse(stored);
  } catch {
    return {};
  }
};
