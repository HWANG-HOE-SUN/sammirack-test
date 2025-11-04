// src/components/ShortageInventoryPanel.jsx
import React, { useState, useEffect } from 'react';
import { generatePartId } from '../utils/unifiedPriceManager'; // ✅ 통일된 함수 import


const ShortageInventoryPanel = ({ 
  isVisible, 
  onClose, 
  shortageItems = [], 
  documentType = '',
  isAdmin = false 
}) => {
  const [inventory_data, set_inventory_data] = useState({});
  const [editingItems, setEditingItems] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 컴포넌트가 표시될 때 현재 재고 데이터 로드
  useEffect(() => {
    if (isVisible && shortageItems.length > 0) {
      loadCurrentInventory();
    }
  }, [isVisible, shortageItems]);

  // 현재 재고 데이터 로드
  const loadCurrentInventory = () => {
    setIsLoading(true);
    try {
      // 로컬스토리지에서 현재 재고 데이터 가져오기
      const inventoryStorage = localStorage.getItem('inventory_data') || '{}';
      const currentInventory = JSON.parse(inventoryStorage);
      
      // 부족한 부품들의 현재 재고 정보만 추출
      const shortageInventory = {};
      shortageItems.forEach(item => {
        const partId = generatePartId(item) || item.partId || item.name;
        shortageInventory[partId] = {
          ...item,
          currentStock: currentInventory[partId] || 0,  // ✅
          originalStock: currentInventory[partId] || 0   // ✅
        };
      });
      
      set_inventory_data(shortageInventory);
      console.log('📦 재고 부족 데이터 로드:', shortageInventory);
    } catch (error) {
      console.error('재고 데이터 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 재고 수량 변경 처리
  const handleQuantityChange = (partId, newQuantity) => {
    if (!isAdmin) return;
    
    const quantity = Math.max(0, parseInt(newQuantity) || 0);
    
    set_inventory_data(prev => ({
      ...prev,
      [partId]: {
        ...prev[partId],
        currentStock: quantity
      }
    }));
    
    setEditingItems(prev => ({
      ...prev,
      [partId]: quantity
    }));
    
    setHasChanges(true);
  };

  // 변경사항 저장
  const saveChanges = () => {
    if (!isAdmin || !hasChanges) return;
    
    setIsLoading(true);
    try {
      // 현재 전체 재고 데이터 로드
      const inventoryStorage = localStorage.getItem('inventory_data') || '{}';
      const currentInventory = JSON.parse(inventoryStorage);
      
      // 변경된 항목들 업데이트
      Object.keys(editingItems).forEach(partId => {
        if (currentInventory[partId]) {
          currentInventory[partId].quantity = editingItems[partId];
          currentInventory[partId].lastUpdated = new Date().toISOString();
        } else {
          // 새로운 항목 추가
          currentInventory[partId] = {
            quantity: editingItems[partId],
            lastUpdated: new Date().toISOString(),
            name: inventory_data[partId]?.name || partId
          };
        }
      });
      
      // 로컬스토리지에 저장
      localStorage.setItem('inventory_data', JSON.stringify(currentInventory));
      
      // 시스템 전체에 재고 업데이트 이벤트 발생
      window.dispatchEvent(new CustomEvent('inventoryUpdated', {
        detail: {
          updatedItems: editingItems,
          source: 'ShortageInventoryPanel'
        }
      }));
      
      // 상태 초기화
      setEditingItems({});
      setHasChanges(false);
      
      // 최신 데이터로 다시 로드
      loadCurrentInventory();
      
      alert('재고 수량이 성공적으로 업데이트되었습니다.');
      console.log('✅ 재고 업데이트 완료:', editingItems);
      
    } catch (error) {
      console.error('재고 저장 실패:', error);
      alert('재고 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 패널이 보이지 않으면 렌더링하지 않음
  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      left: 0,
      top: 0,
      width: '400px',
      height: '100vh',
      backgroundColor: '#ffffff',
      border: '2px solid #dc3545',
      borderLeft: 'none',
      boxShadow: '2px 0 10px rgba(0,0,0,0.1)',
      zIndex: 9999,
      overflow: 'auto',
      fontFamily: '"Malgun Gothic", Arial, sans-serif'
    }}>
      {/* 헤더 */}
      <div style={{
        backgroundColor: '#dc3545',
        color: 'white',
        padding: '15px',
        position: 'sticky',
        top: 0,
        zIndex: 10000
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>
            ⚠️ 재고 부족 ({documentType})
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '0 5px'
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: '12px', marginTop: '5px', opacity: 0.9 }}>
          {shortageItems.length}개 부품 재고 부족
        </div>
      </div>

      {/* 로딩 상태 */}
      {isLoading && (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          color: '#666'
        }}>
          <div>🔄 재고 정보 로딩 중...</div>
        </div>
      )}

      {/* 재고 부족 목록 */}
      {!isLoading && (
        <div style={{ padding: '15px' }}>
          {Object.entries(inventory_data).map(([partId, item]) => (
            <div key={partId} style={{
              border: '1px solid #ddd',
              borderRadius: '5px',
              padding: '12px',
              marginBottom: '10px',
              backgroundColor: item.shortage > 0 ? '#fff5f5' : '#f8f9fa'
            }}>
              {/* 부품명 */}
              <div style={{
                fontWeight: 'bold',
                fontSize: '14px',
                marginBottom: '5px',
                color: '#333'
              }}>
                {item.name}
              </div>

              {/* 랙타입 및 규격 */}
              {(item.rackType || item.specification) && (
                <div style={{
                  fontSize: '12px',
                  color: '#666',
                  marginBottom: '8px'
                }}>
                  {item.rackType && `${item.rackType} `}
                  {item.specification && `(${item.specification})`}
                </div>
              )}

              {/* 재고 정보 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                fontSize: '13px'
              }}>
                <div>
                  <span style={{ color: '#666' }}>필요:</span>
                  <span style={{ fontWeight: 'bold', marginLeft: '5px' }}>
                    {item.required}개
                  </span>
                </div>
                <div>
                  <span style={{ color: '#666' }}>부족:</span>
                  <span style={{ 
                    fontWeight: 'bold', 
                    color: '#dc3545',
                    marginLeft: '5px'
                  }}>
                    {item.shortage}개
                  </span>
                </div>
              </div>

              {/* 현재 재고 및 수정 */}
              <div style={{
                marginTop: '10px',
                padding: '8px',
                backgroundColor: '#f8f9fa',
                borderRadius: '3px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '13px', color: '#666' }}>
                    현재 재고:
                  </span>
                  
                  {isAdmin ? (
                    <input
                      type="number"
                      min="0"
                      value={item.currentStock}
                      onChange={(e) => handleQuantityChange(partId, e.target.value)}
                      style={{
                        width: '80px',
                        padding: '4px 6px',
                        border: '1px solid #ddd',
                        borderRadius: '3px',
                        textAlign: 'right',
                        fontSize: '13px'
                      }}
                    />
                  ) : (
                    <span style={{
                      fontWeight: 'bold',
                      color: item.currentStock === 0 ? '#dc3545' : '#333'
                    }}>
                      {item.currentStock}개
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 액션 버튼들 */}
      {!isLoading && (
        <div style={{
          position: 'sticky',
          bottom: 0,
          backgroundColor: '#f8f9fa',
          padding: '15px',
          borderTop: '1px solid #ddd'
        }}>
          {isAdmin && hasChanges && (
            <button
              onClick={saveChanges}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginBottom: '8px'
              }}
            >
              💾 재고 수량 저장
            </button>
          )}
          
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            닫기
          </button>

          {/* 권한 안내 */}
          <div style={{
            marginTop: '10px',
            fontSize: '11px',
            color: '#666',
            textAlign: 'center'
          }}>
            {isAdmin ? 
              '✅ 관리자 권한: 재고 수정 가능' : 
              '👁️ 조회 권한: 읽기 전용'
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default ShortageInventoryPanel;
