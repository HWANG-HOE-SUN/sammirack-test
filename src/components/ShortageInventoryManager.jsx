// src/components/ShortageInventoryManager.jsx
import React, { useState, useEffect } from 'react';
import ShortageInventoryPanel from './ShortageInventoryPanel';

const ShortageInventoryManager = ({ isAdmin = false }) => {
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [shortageData, setShortageData] = useState({
    shortageItems: [],
    documentType: '',
    timestamp: null
  });

  useEffect(() => {
    // 재고 부족 컴포넌트 표시 이벤트 리스너
    const handleShowShortagePanel = (event) => {
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
    };

    // 이벤트 리스너 등록
    window.addEventListener('showShortageInventoryPanel', handleShowShortagePanel);
    
    // 페이지 로드 시 로컬스토리지에서 저장된 데이터 확인
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
  }, []);

  // 패널 닫기
  const handleClosePanel = () => {
    setIsPanelVisible(false);
    setShortageData({
      shortageItems: [],
      documentType: '',
      timestamp: null
    });
    
    // 로컬스토리지에서도 제거
    localStorage.removeItem('shortageInventoryData');
  };

  return (
    <ShortageInventoryPanel
      isVisible={isPanelVisible}
      onClose={handleClosePanel}
      shortageItems={shortageData.shortageItems}
      documentType={shortageData.documentType}
      isAdmin={isAdmin}
    />
  );
};

export default ShortageInventoryManager;
