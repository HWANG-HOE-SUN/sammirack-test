import React, { useState, useEffect } from 'react';
import { generateInventoryPartId } from '../utils/unifiedPriceManager';
import { inventoryService } from '../services/InventoryService';
import './ShortageInventoryPanel.css';

/**
 * ShortageInventoryPanel 컴포넌트
 * 
 * 재고 부족 품목을 표시하고 관리자가 재고를 수정할 수 있는 패널입니다.
 * 
 * Props:
 * - shortageItems: 부족한 품목 목록 (배열)
 * - onClose: 패널 닫기 콜백 함수
 * - onSave: 저장 완료 후 콜백 함수
 * - onConfirm: "무시하고 전송/인쇄" 콜백 함수
 * - onCancel: "취소" 콜백 함수
 * - allBomItems: 현재 문서의 전체 BOM 목록 (부족 여부 관계없이)
 */
function ShortageInventoryPanel({ 
  shortageItems = [], 
  onClose, 
  onSave,
  onConfirm,
  onCancel,
  allBomItems = []
}) {
  const [inventory, setInventory] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const adminStatus = localStorage.getItem('isAdmin') === 'true';
    setIsAdmin(adminStatus);
    
    // 서버 재고 불러오기
    loadServerInventory();
  }, []);

  /**
   * 서버 재고 불러오기
   */
  const loadServerInventory = async () => {
    try {
      const serverInventory = await inventoryService.getInventory();
      setInventory(serverInventory);
    } catch (error) {
      console.error('재고 데이터 로드 실패:', error);
      
      // 실패 시 로컬스토리지에서 불러오기
      const savedInventory = localStorage.getItem('inventory_data');
      if (savedInventory) {
        try {
          setInventory(JSON.parse(savedInventory));
        } catch (e) {
          console.error('재고 데이터 파싱 실패:', e);
        }
      }
    }
  };

  /**
   * 재고 수량 변경 핸들러
   * 관리자만 재고를 직접 수정할 수 있습니다.
   */
  const handleQuantityChange = (partId, value) => {
    const numValue = parseInt(value) || 0;
    setInventory(prev => ({
      ...prev,
      [partId]: numValue
    }));
  };

  /**
   * 재고 저장 핸들러
   * 로컬스토리지와 서버 재고를 동시에 업데이트합니다.
   */
  const handleSave = async () => {
    if (!isAdmin) {
      alert('관리자만 재고를 수정할 수 있습니다.');
      return;
    }

    setIsSaving(true);
    try {
      // 1. 로컬스토리지 저장
      localStorage.setItem('inventory_data', JSON.stringify(inventory));
      
      // 2. 서버 재고 동기화
      await inventoryService.updateInventory(inventory);
      
      // 3. inventoryUpdated 이벤트 발생
      window.dispatchEvent(new CustomEvent('inventoryUpdated', {
        detail: { inventory }
      }));

      alert('재고가 성공적으로 업데이트되었습니다.');
      
      if (onSave) {
        onSave(inventory);
      }
      
      // 저장 후 서버 재고 다시 불러오기
      await loadServerInventory();
      
    } catch (error) {
      console.error('재고 저장 실패:', error);
      alert('재고 저장 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ✅ "무시하고 전송/인쇄" 핸들러
  const handleProceed = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  // ✅ "취소" 핸들러
  const handleCancelAction = () => {
    if (onCancel) {
      onCancel();
    }
    onClose();
  };

  if (!shortageItems || shortageItems.length === 0) {
    return null;
  }

  // ✅ 전체 BOM 재고 현황 계산
  const allBomSummary = allBomItems.map(item => {
    const partId = generateInventoryPartId(
      item.rackType || '',
      item.name || '',
      item.specification || '',
      item.colorWeight || ''
    );
    const currentStock = inventory[partId] || 0;
    const required = item.quantity || 0;
    const afterUse = currentStock - required;

    return {
      ...item,
      partId,
      currentStock,
      required,
      afterUse
    };
  });

  return (
    <div className="shortage-inventory-panel">
      {/* 헤더 */}
      <div className="shortage-panel-header">
        <div className="shortage-panel-title">
          <span>⚠️ 재고 부족 알림</span>
          <button 
            className="shortage-panel-close" 
            onClick={handleCancelAction}
            disabled={isSaving}
          >
            ✕
          </button>
        </div>
        <div className="shortage-panel-subtitle">
          {shortageItems.length}개 품목의 재고가 부족합니다
        </div>
      </div>

      {/* 부족 품목 목록 */}
      <div className="shortage-panel-content">
        <h4 style={{ marginTop: 0, marginBottom: 10, color: '#dc3545', fontSize: 14 }}>
          🚨 부족 품목
        </h4>
        
        {shortageItems.map((item, index) => {
          // ⚠️ 중요: item.partId가 있으면 우선 사용 (재고관리용 ID)
          const partId = item.partId || generateInventoryPartId({
            rackType: item.rackType || '',
            name: item.name || '',
            specification: item.specification || '',
            colorWeight: item.colorWeight || ''
          });
          const currentStock = inventory[partId] || 0;

          return (
            <div 
              key={index} 
              className="shortage-item has-shortage"
            >
              <div className="shortage-item-name">{item.name || '-'}</div>
              <div className="shortage-item-specs">
                규격: {item.specification || '-'} | 거치대: {item.rackType || '-'}
              </div>

              <div className="shortage-item-grid">
                <div className="shortage-required">
                  필요 수량:
                  <span className="shortage-required-value">{item.quantity || 0}</span>
                </div>
                <div className="shortage-shortage">
                  부족 수량:
                  <span className="shortage-shortage-value">{item.shortage || 0}</span>
                </div>
              </div>

              <div className="shortage-current-stock">
                <div className="shortage-current-stock-row">
                  <span className="shortage-current-stock-label">현재 재고:</span>
                  {isAdmin ? (
                    <input
                      type="number"
                      value={currentStock}
                      onChange={(e) => handleQuantityChange(partId, e.target.value)}
                      disabled={isSaving}
                      className="shortage-quantity-input"
                    />
                  ) : (
                    <span className={`shortage-quantity-display ${currentStock === 0 ? 'zero' : 'normal'}`}>
                      {currentStock}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* ✅ 전체 BOM 재고 현황 테이블 */}
        <h4 style={{ marginTop: 20, marginBottom: 10, color: '#333', fontSize: 14 }}>
          📊 전체 원자재 재고 현황
        </h4>
        
        <div style={{ overflowX: 'auto', marginBottom: 15 }}>
          <table style={{ 
            width: '100%', 
            fontSize: 11, 
            borderCollapse: 'collapse',
            border: '1px solid #ddd'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ padding: '6px 4px', border: '1px solid #ddd', textAlign: 'left' }}>품명</th>
                <th style={{ padding: '6px 4px', border: '1px solid #ddd', textAlign: 'center' }}>규격</th>
                <th style={{ padding: '6px 4px', border: '1px solid #ddd', textAlign: 'right' }}>현재</th>
                <th style={{ padding: '6px 4px', border: '1px solid #ddd', textAlign: 'right' }}>소모</th>
                <th style={{ padding: '6px 4px', border: '1px solid #ddd', textAlign: 'right' }}>잔량</th>
              </tr>
            </thead>
            <tbody>
              {allBomSummary.map((item, index) => (
                <tr key={index} style={{ 
                  backgroundColor: item.afterUse < 0 ? '#ffebee' : 'white'
                }}>
                  <td style={{ padding: '6px 4px', border: '1px solid #ddd', fontSize: 10 }}>
                    {item.name}
                  </td>
                  <td style={{ padding: '6px 4px', border: '1px solid #ddd', textAlign: 'center', fontSize: 10 }}>
                    {item.specification || '-'}
                  </td>
                  <td style={{ padding: '6px 4px', border: '1px solid #ddd', textAlign: 'right' }}>
                    {isAdmin ? (
                      <input
                        type="number"
                        value={item.currentStock}
                        onChange={(e) => handleQuantityChange(item.partId, e.target.value)}
                        disabled={isSaving}
                        style={{
                          width: '50px',
                          padding: '2px 4px',
                          textAlign: 'right',
                          border: '1px solid #ddd',
                          borderRadius: '3px',
                          fontSize: '11px'
                        }}
                      />
                    ) : (
                      <span style={{ fontWeight: 'bold' }}>{item.currentStock}</span>
                    )}
                  </td>
                  <td style={{ padding: '6px 4px', border: '1px solid #ddd', textAlign: 'right', color: '#666' }}>
                    -{item.required}
                  </td>
                  <td style={{ 
                    padding: '6px 4px', 
                    border: '1px solid #ddd', 
                    textAlign: 'right',
                    fontWeight: 'bold',
                    color: item.afterUse < 0 ? '#dc3545' : '#28a745'
                  }}>
                    {item.afterUse}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 버튼 영역 */}
      <div className="shortage-panel-actions">
        {isAdmin && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="shortage-save-button"
          >
            {isSaving ? '저장 중...' : '💾 재고 저장'}
          </button>
        )}
        
        {/* ✅ 강제 인쇄하기 버튼 추가 */}
        {onConfirm && (
          <button
            onClick={handleProceed}
            disabled={isSaving}
            className="shortage-force-print-button"
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#ff5722',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '15px',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginBottom: '8px',
              transition: 'background-color 0.2s ease'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#e64a19'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#ff5722'}
          >
            🖨️ 강제 인쇄하기
          </button>
        )}
        
        <button
          onClick={handleCancelAction}
          disabled={isSaving}
          className="shortage-close-button"
        >
          ❌ {onCancel ? '취소' : '닫기'}
        </button>

        {/* 관리자만 재고를 직접 수정할 수 있습니다 안내 */}
        <div className={`shortage-permission-info ${isAdmin ? 'admin' : 'guest'}`}>
          {isAdmin 
            ? '💡 관리자 권한으로 재고를 수정할 수 있습니다.' 
            : '💡 관리자만 재고를 직접 수정할 수 있습니다.'}
        </div>
        
        {/* ✅ 강제 인쇄 안내 추가 */}
        {onConfirm && (
          <div style={{
            marginTop: '10px',
            padding: '10px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#856404'
          }}>
            ⚠️ <strong>강제 인쇄하기</strong>: 재고 부족해도 인쇄 진행<br/>
            인쇄 후 재고 감소 여부를 선택할 수 있습니다.
          </div>
        )}
      </div>
    </div>
  );
}

export default ShortageInventoryPanel;
