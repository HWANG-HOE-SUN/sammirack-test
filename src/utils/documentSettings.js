/**
 * 문서 양식 설정 관리
 * - 관리자가 문서 양식의 고정값들을 수정 가능
 * - localStorage에 저장
 * - 기존 저장된 문서들은 영향받지 않음 (각 문서가 생성 시점의 설정값 보유)
 */

const SETTINGS_KEY = 'document_template_settings';

// 기본 설정값
const DEFAULT_SETTINGS = {
  bizNumber: '232-81-01750',
  companyName: '삼미앵글랙산업',
  ceo: '박이삭',
  address: '경기도 광명시 원노온사로 39, 철제 스틸하우스 1',
  tel: '010-9548-9578 010-4311-7733',
  fax: '(02)2611-4595',
  website: 'http://www.ssmake.com',
  updatedAt: new Date().toISOString()
};

/**
 * 현재 문서 양식 설정 가져오기
 */
export const getDocumentSettings = () => {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    // 없으면 기본값 반환
    return { ...DEFAULT_SETTINGS };
  } catch (error) {
    console.error('문서 설정 로드 실패:', error);
    return { ...DEFAULT_SETTINGS };
  }
};

/**
 * 문서 양식 설정 저장
 */
export const saveDocumentSettings = (settings) => {
  try {
    const newSettings = {
      ...settings,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    console.log('✅ 문서 양식 설정 저장 완료');
    return true;
  } catch (error) {
    console.error('문서 설정 저장 실패:', error);
    return false;
  }
};

/**
 * 문서 양식 설정 초기화 (기본값으로 리셋)
 */
export const resetDocumentSettings = () => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    console.log('✅ 문서 양식 설정 초기화 완료');
    return true;
  } catch (error) {
    console.error('문서 설정 초기화 실패:', error);
    return false;
  }
};
