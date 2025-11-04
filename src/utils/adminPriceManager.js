/**
 * 관리자 단가 데이터 관리 유틸리티
 * localStorage와 JSON 파일 백업 기능을 제공합니다.
 */
import { generatePartId } from './unifiedPriceManager';

// 관리자 단가 데이터 키
const ADMIN_PRICES_KEY = 'admin_edit_prices';
const PRICE_HISTORY_KEY = 'admin_price_history';

// 부품 고유 ID 생성 (다른 컴포넌트와 동일한 로직 사용)
// export const generatePartId = (item) => {
//   const { rackType, name, specification } = item;
//   const cleanName = name.replace(/[^\w가-힣]/g, '');
//   const cleanSpec = (specification || '').replace(/[^\w가-힣]/g, '');
//   return `${rackType}-${cleanName}-${cleanSpec}`.toLowerCase();
// };

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

// 관리자 수정 단가 저장
export const saveAdminPrice = (partId, price, partInfo = {}) => {
  try {
    const priceData = loadAdminPrices();
    
    if (price && price > 0) {
      priceData[partId] = {
        price: Number(price),
        timestamp: new Date().toISOString(),
        account: 'admin',
        partInfo
      };
    } else {
      // 가격이 0이거나 null이면 삭제 (기본값 사용)
      delete priceData[partId];
    }

    localStorage.setItem(ADMIN_PRICES_KEY, JSON.stringify(priceData));
    
    // JSON 파일로 백업
    exportToJsonFile(priceData, 'admin_edit_prices.json');
    
    return true;
  } catch (error) {
    console.error('관리자 단가 저장 실패:', error);
    return false;
  }
};

// 가격 변경 히스토리 로드
export const loadPriceHistory = (partId) => {
  try {
    const stored = localStorage.getItem(PRICE_HISTORY_KEY) || '{}';
    const historyData = JSON.parse(stored);
    return historyData[partId] || [];
  } catch (error) {
    console.error('가격 히스토리 로드 실패:', error);
    return [];
  }
};

// 가격 변경 히스토리 저장
export const savePriceHistory = (partId, oldPrice, newPrice, rackOption = '') => {
  try {
    const stored = localStorage.getItem(PRICE_HISTORY_KEY) || '{}';
    const historyData = JSON.parse(stored);
    
    if (!historyData[partId]) {
      historyData[partId] = [];
    }

    const newEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      account: 'admin',
      oldPrice: Number(oldPrice),
      newPrice: Number(newPrice),
      rackOption
    };

    historyData[partId].unshift(newEntry); // 최신 순으로 정렬
    
    // 히스토리 최대 100개로 제한
    if (historyData[partId].length > 100) {
      historyData[partId] = historyData[partId].slice(0, 100);
    }

    localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(historyData));
    
    // JSON 파일로 백업
    exportToJsonFile(historyData, 'admin_price_history.json');
    
    return true;
  } catch (error) {
    console.error('가격 히스토리 저장 실패:', error);
    return false;
  }
};

// 전체 히스토리 로드
export const loadAllPriceHistory = () => {
  try {
    const stored = localStorage.getItem(PRICE_HISTORY_KEY) || '{}';
    return JSON.parse(stored);
  } catch (error) {
    console.error('전체 히스토리 로드 실패:', error);
    return {};
  }
};

// JSON 파일로 데이터 내보내기
export const exportToJsonFile = (data, filename) => {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    
    console.log(`데이터가 ${filename}로 내보내기 되었습니다.`);
  } catch (error) {
    console.error('JSON 파일 내보내기 실패:', error);
  }
};

// JSON 파일에서 데이터 가져오기
export const importFromJsonFile = (file, dataType = 'prices') => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('파일이 선택되지 않았습니다.'));
      return;
    }

    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        const storageKey = dataType === 'prices' ? ADMIN_PRICES_KEY : PRICE_HISTORY_KEY;
        
        // 기존 데이터와 병합
        const existingData = JSON.parse(localStorage.getItem(storageKey) || '{}');
        const mergedData = { ...existingData, ...jsonData };
        
        localStorage.setItem(storageKey, JSON.stringify(mergedData));
        
        resolve({
          success: true,
          message: `${Object.keys(jsonData).length}개의 항목이 성공적으로 가져와졌습니다.`,
          data: mergedData
        });
      } catch (error) {
        reject({
          success: false,
          message: 'JSON 파일 파싱 실패: ' + error.message
        });
      }
    };

    reader.onerror = () => {
      reject({
        success: false,
        message: '파일 읽기 실패'
      });
    };

    reader.readAsText(file);
  });
};

// 데이터 초기화
export const clearAllData = (dataType = 'both') => {
  try {
    if (dataType === 'prices' || dataType === 'both') {
      localStorage.removeItem(ADMIN_PRICES_KEY);
    }
    if (dataType === 'history' || dataType === 'both') {
      localStorage.removeItem(PRICE_HISTORY_KEY);
    }
    return true;
  } catch (error) {
    console.error('데이터 초기화 실패:', error);
    return false;
  }
};

// 통계 정보 조회
export const getStatistics = () => {
  try {
    const priceData = loadAdminPrices();
    const historyData = loadAllPriceHistory();
    
    const totalParts = Object.keys(priceData).length;
    const totalHistoryEntries = Object.values(historyData).reduce((sum, entries) => sum + entries.length, 0);
    
    // 랙 타입별 통계
    const rackTypeStats = {};
    Object.values(priceData).forEach(price => {
      const rackType = price.partInfo?.rackType || '미분류';
      rackTypeStats[rackType] = (rackTypeStats[rackType] || 0) + 1;
    });

    // 최근 수정된 부품들 (최근 7일)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentChanges = Object.entries(priceData).filter(([partId, data]) => {
      const modifiedDate = new Date(data.timestamp);
      return modifiedDate > sevenDaysAgo;
    });

    return {
      totalParts,
      totalHistoryEntries,
      rackTypeStats,
      recentChangesCount: recentChanges.length,
      lastModified: Object.values(priceData).reduce((latest, current) => {
        const currentDate = new Date(current.timestamp);
        return currentDate > latest ? currentDate : latest;
      }, new Date(0))
    };
  } catch (error) {
    console.error('통계 정보 조회 실패:', error);
    return {
      totalParts: 0,
      totalHistoryEntries: 0,
      rackTypeStats: {},
      recentChangesCount: 0,
      lastModified: null
    };
  }
};

// 부품 검색
export const searchParts = (searchTerm, rackTypeFilter = null) => {
  try {
    const priceData = loadAdminPrices();
    const results = [];
    
    Object.entries(priceData).forEach(([partId, data]) => {
      const { partInfo } = data;
      const matchesSearch = !searchTerm || 
        partId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (partInfo?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (partInfo?.specification || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesRackType = !rackTypeFilter || partInfo?.rackType === rackTypeFilter;
      
      if (matchesSearch && matchesRackType) {
        results.push({
          partId,
          ...data,
          displayName: `${partInfo?.name || '이름없음'} (${partInfo?.specification || '규격없음'})`
        });
      }
    });
    
    return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('부품 검색 실패:', error);
    return [];
  }
};

// 백업 파일 생성 (모든 데이터)
export const createBackup = () => {
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      adminPrices: loadAdminPrices(),
      priceHistory: loadAllPriceHistory(),
      statistics: getStatistics()
    };
    
    const filename = `admin_price_backup_${new Date().toISOString().split('T')[0]}.json`;
    exportToJsonFile(backup, filename);
    
    return {
      success: true,
      message: `백업 파일이 ${filename}로 생성되었습니다.`,
      filename
    };
  } catch (error) {
    console.error('백업 생성 실패:', error);
    return {
      success: false,
      message: '백업 생성 실패: ' + error.message
    };
  }
};

// 백업에서 복원
export const restoreFromBackup = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('백업 파일이 선택되지 않았습니다.'));
      return;
    }

    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const backupData = JSON.parse(e.target.result);
        
        // 백업 파일 유효성 검사
        if (!backupData.adminPrices || !backupData.priceHistory) {
          throw new Error('유효하지 않은 백업 파일입니다.');
        }
        
        // 데이터 복원
        localStorage.setItem(ADMIN_PRICES_KEY, JSON.stringify(backupData.adminPrices));
        localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(backupData.priceHistory));
        
        resolve({
          success: true,
          message: `백업이 성공적으로 복원되었습니다. (백업 날짜: ${new Date(backupData.timestamp).toLocaleDateString('ko-KR')})`,
          backupDate: backupData.timestamp,
          restoredParts: Object.keys(backupData.adminPrices).length
        });
      } catch (error) {
        reject({
          success: false,
          message: '백업 복원 실패: ' + error.message
        });
      }
    };

    reader.onerror = () => {
      reject({
        success: false,
        message: '백업 파일 읽기 실패'
      });
    };

    reader.readAsText(file);
  });
};
