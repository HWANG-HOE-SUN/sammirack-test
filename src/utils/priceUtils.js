/**
 * 가격 계산 관련 유틸리티 함수들
 */

/**
 * 적용률을 반영하여 가격을 계산합니다
 * @param {number} originalPrice - 원래 가격
 * @param {number} rate - 적용률 (0-100)
 * @returns {number} 적용률이 반영된 가격
 */
export const applyRateToPrice = (originalPrice, rate) => {
  // 적용률이 유효하지 않으면 100%로 기본값 설정
  if (rate === null || rate === undefined || isNaN(rate) || rate < 0 || rate > 100) {
    rate = 100;
  }
  
  return Math.round(originalPrice * (rate / 100));
};

/**
 * 적용률 입력값을 검증합니다
 * @param {string|number} value - 입력된 적용률 값
 * @returns {number} 검증된 적용률 (0-100)
 */
export const validateRate = (value) => {
  const numValue = parseFloat(value);
  
  if (isNaN(numValue)) return 100;
  if (numValue < 0) return 0;
  if (numValue > 100) return 100;
  
  return numValue;
};

/**
 * 가격을 천 단위 콤마로 포맷팅합니다
 * @param {number} price - 가격
 * @returns {string} 포맷팅된 가격 문자열
 */
export const formatPrice = (price) => {
  return price.toLocaleString('ko-KR');
};
