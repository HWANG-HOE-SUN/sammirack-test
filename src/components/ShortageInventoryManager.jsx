import React, { useState, useEffect, useCallback } from 'react';
import ShortageInventoryPanel from './ShortageInventoryPanel';
import { useProducts } from '../contexts/ProductContext'; // ProductContext에서 재고 관리 함수 임포트

const ShortageInventoryManager = ({ isAdmin = false }) => {
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [shortageData, setShortageData] = useState({
    shortageItems: [],
    documentType: '',
    timestamp: null
  });
  
  // ProductContext에서 서버 재고 데이터 및 관리 함수 가져오기
  const { 
    inventory, 
    updateInventory, 
    loadingInventory 
  } = useProducts();

  // 패널 닫기
  const handleClosePanel = useCallback(() => {
    setIsPanelVisible(false);
    setShortageData({
      shortageItems: [],
      documentType: '',
      timestamp: null
    });
    
    // 로컬스토리지에서도 제거 (기존 로직 유지)
    localStorage.removeItem('shortageInventoryData');
  }, []);

  // 재고 부족 이벤트 핸들러
  const handleShowShortagePanel = useCallback((event) => {
    const { shortageItems, documentType, timestamp } = event.detail;
    
    console.log('📋 재고 부족 패널 표시 요청:', {
      shortageItems,
      documentType,
      timestamp
    });
    
    setShortageData({
      shortageItems,
      documentType,
      timestamp
    });
    setIsPanelVisible(true);
  }, []);

  useEffect(() => {
    // 이벤트 리스너 등록
    window.addEventListener('showShortageInventoryPanel', handleShowShortagePanel);
    
    // 페이지 로드 시 로컬스토리지에서 저장된 데이터 확인 (기존 로직 유지)
    const checkSavedShortageData = () => {
      try {
        const savedData = localStorage.getItem('shortageInventoryData');
        if (savedData) {
          const data = JSON.parse(savedData);
          const now = Date.now();
          
          // 5분 이내의 데이터만 사용 (너무 오래된 데이터는 무시)
          if (data.timestamp && (now - data.timestamp) < 5 * 60 * 1000) {
            console.log('📦 저장된 재고 부족 데이터 복원:', data);
            setShortageData(data);
            setIsPanelVisible(true);
            
            // 사용된 데이터는 제거
            localStorage.removeItem('shortageInventoryData');
          }
        }
      } catch (error) {
        console.error('저장된 재고 부족 데이터 로드 실패:', error);
      }
    };
    
    // 컴포넌트 마운트 시 한 번 확인
    checkSavedShortageData();

    // 클린업
    return () => {
      window.removeEventListener('showShortageInventoryPanel', handleShowShortagePanel);
    };
  }, [handleShowShortagePanel]);

  // ✅ ShortageInventoryPanel에 전달할 최종 재고 데이터
  // 서버 재고(inventory)를 기준으로 재고 부족 여부를 판단하도록 데이터 보강
  const finalShortageItems = shortageData.shortageItems.map(item => {
    // partId를 사용하여 서버 재고 수량을 가져옵니다. 없으면 0으로 간주합니다.
    const serverInventory = inventory[item.partId] || 0;
    
    return {
      ...item,
      serverInventory: serverInventory, // 서버 재고 수량 추가
      isShortage: serverInventory < item.requiredQuantity // 서버 재고 기준으로 부족 여부 판단
    };
  });

  return (
    <ShortageInventoryPanel
      isVisible={isPanelVisible}
      onClose={handleClosePanel}
      shortageItems={finalShortageItems} // 보강된 아이템 리스트 전달
      documentType={shortageData.documentType}
      isAdmin={isAdmin}
      // 재고 업데이트 함수도 패널에 전달하여 서버 연동을 돕습니다.
      onUpdateInventory={updateInventory} 
      isLoading={loadingInventory}
    />
  );
};

export default ShortageInventoryManager;
