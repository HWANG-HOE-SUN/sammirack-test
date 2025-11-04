// src/components/AdminPriceEditor.jsx (변동이력 기능 포함, 부품ID 표시 추가)
import React, { useState, useEffect } from 'react';
import { 
  saveAdminPriceSync, 
  loadAdminPrices, 
} from '../utils/realtimeAdminSync';
import { generatePartId } from '../utils/unifiedPriceManager'; // ✅ 통일된 함수 import

// 변동 이력 관리 함수들
const loadPriceHistory = (partId) => {
  try {
    const historyKey = `priceHistory_${partId}`;
    const saved = localStorage.getItem(historyKey);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('가격 이력 로드 실패:', error);
    return [];
  }
};

const savePriceHistory = (partId, oldPrice, newPrice, partName, userInfo) => {
  try {
    const history = loadPriceHistory(partId);
    
    // 사용자 IP 가져오기 (간단한 방법)
    const getUserIP = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
      } catch {
        return 'unknown';
      }
    };
    
    getUserIP().then(ip => {
      const newEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        oldPrice: Number(oldPrice) || 0,
        newPrice: Number(newPrice) || 0,
        partName: partName || '',
        username: userInfo?.username || 'admin',
        userRole: userInfo?.role || 'admin',
        userIP: ip,
        action: newPrice === 0 ? 'deleted' : oldPrice === 0 ? 'created' : 'updated'
      };
      
      history.unshift(newEntry); // 최신 항목을 맨 앞에
      
      // 최대 100개 항목만 유지
      if (history.length > 100) {
        history.splice(100);
      }
      
      const historyKey = `priceHistory_${partId}`;
      localStorage.setItem(historyKey, JSON.stringify(history));
      
      // 전역 이벤트 발생 (다른 컴포넌트에서 이력 업데이트 감지)
      window.dispatchEvent(new CustomEvent('priceHistoryUpdated', {
        detail: { partId, newEntry }
      }));
    });
  } catch (error) {
    console.error('가격 이력 저장 실패:', error);
  }
};

const AdminPriceEditor = ({ item, part, onClose, currentUser, onSave }) => {
  // ✅ item과 part 둘 다 받을 수 있도록 처리 (하위 호환성)
  const targetPart = part || item;
  
  const [newPrice, setNewPrice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentAdminPrice, setCurrentAdminPrice] = useState(0);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('edit'); // 'edit' or 'history'
  const [history, setHistory] = useState([]);

  // ✅ 방어 코드 추가: targetPart가 없으면 에러 표시
  if (!targetPart) {
    return (
      <div className="admin-price-editor-overlay">
        <div className="admin-price-editor">
          <div className="editor-header">
            <h3>오류</h3>
            <button onClick={onClose} className="close-btn">×</button>
          </div>
          <div style={{ padding: '20px', textAlign: 'center', color: '#dc3545' }}>
            부품 정보를 불러올 수 없습니다.
          </div>
          <div className="editor-actions">
            <button onClick={onClose} className="cancel-btn">닫기</button>
          </div>
        </div>
      </div>
    );
  }

  const partId = generatePartId(targetPart);

  useEffect(() => {
    loadCurrentPrice();
    loadPriceHistoryData();
  }, [targetPart]);

  // 실시간 업데이트 감지
  useEffect(() => {
    const handlePriceUpdate = (event) => {
      console.log('실시간 단가 업데이트 감지:', event.detail);
      loadCurrentPrice();
      setMessage('다른 PC에서 단가가 업데이트되었습니다.');
      setTimeout(() => setMessage(''), 3000);
    };

    const handleHistoryUpdate = (event) => {
      if (event.detail.partId === partId) {
        loadPriceHistoryData();
      }
    };

    window.addEventListener('adminPricesUpdated', handlePriceUpdate);
    window.addEventListener('priceHistoryUpdated', handleHistoryUpdate);
    
    return () => {
      window.removeEventListener('adminPricesUpdated', handlePriceUpdate);
      window.removeEventListener('priceHistoryUpdated', handleHistoryUpdate);
    };
  }, [partId]);

  const loadCurrentPrice = () => {
    try {
      const adminPrices = loadAdminPrices();
      const currentPrice = adminPrices[partId]?.price || 0;
      setCurrentAdminPrice(currentPrice);
      setNewPrice(currentPrice > 0 ? currentPrice.toString() : '');
    } catch (error) {
      console.error('현재 단가 로드 실패:', error);
    }
  };

  // 가격 변경 히스토리 로드
  const loadPriceHistoryData = () => {
    try {
      const partHistory = loadPriceHistory(partId);
      setHistory(partHistory);
    } catch (error) {
      console.error('히스토리 로드 실패:', error);
      setHistory([]);
    }
  };

  const handleSave = async () => {
    const price = Number(newPrice);
    
    if (price < 0) {
      alert('가격은 0 이상이어야 합니다.');
      return;
    }

    setIsLoading(true);
    setMessage('저장 중...');

    try {
      const partInfo = {
        rackType: targetPart.rackType || '',
        name: targetPart.name || '',
        specification: targetPart.specification || '',
        originalPrice: targetPart.unitPrice || 0
      };

      const userInfo = {
        username: currentUser?.username || 'admin',
        role: currentUser?.role || 'admin'
      };

      // 현재 가격 (변경 전)
      const oldPrice = currentAdminPrice;

      // 실시간 동기화 저장
      const success = await saveAdminPriceSync(partId, price, partInfo, userInfo);
      
      if (success) {
        // 변동 이력 저장
        const partName = `${targetPart.rackType} ${targetPart.name} ${targetPart.specification || ''}`.trim();
        savePriceHistory(partId, oldPrice, price, partName, userInfo);
        
        setMessage('✅ 모든 PC에 즉시 반영되었습니다!');
        setCurrentAdminPrice(price);
        
        // 상위 컴포넌트에 알림
        if (onSave) {
          onSave(partId, price, oldPrice);
        }
        
        // 히스토리 재로드
        setTimeout(() => {
          loadPriceHistoryData();
        }, 500);
        
        // 3초 후 자동 닫기
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setMessage('❌ 저장에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (error) {
      console.error('단가 저장 실패:', error);
      setMessage('❌ 저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('이 부품의 관리자 수정 단가를 삭제하시겠습니까?\n기본 단가로 되돌아갑니다.')) {
      return;
    }

    setIsLoading(true);
    setMessage('삭제 중...');

    try {
      const partInfo = {
        rackType: targetPart.rackType || '',
        name: targetPart.name || '',
        specification: targetPart.specification || ''
      };

      const userInfo = {
        username: currentUser?.username || 'admin',
        role: currentUser?.role || 'admin'
      };

      // 현재 가격 (변경 전)
      const oldPrice = currentAdminPrice;

      // 실시간 동기화로 삭제 (price = 0으로 설정)
      const success = await saveAdminPriceSync(partId, 0, partInfo, userInfo);
      
      if (success) {
        // 변동 이력 저장
        const partName = `${targetPart.rackType} ${targetPart.name} ${targetPart.specification || ''}`.trim();
        savePriceHistory(partId, oldPrice, 0, `${partName} (기본값으로 복원)`, userInfo);
        
        setMessage('✅ 관리자 단가가 삭제되었습니다.');
        setCurrentAdminPrice(0);
        setNewPrice('');
        
        // 상위 컴포넌트에 알림
        if (onSave) {
          onSave(partId, 0, oldPrice);
        }
        
        // 히스토리 재로드
        setTimeout(() => {
          loadPriceHistoryData();
        }, 500);
        
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setMessage('❌ 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('단가 삭제 실패:', error);
      setMessage('❌ 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyPartIdToClipboard = () => {
    try {
      navigator.clipboard.writeText(partId);
      setMessage('부품ID가 클립보드에 복사되었습니다.');
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setMessage('부품ID 복사에 실패했습니다.');
      setTimeout(() => setMessage(''), 2000);
    }
  };

  return (
    <div className="admin-price-editor-overlay">
      <div className="admin-price-editor">
        <div className="editor-header">
          <h3>관리자 단가 수정</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        {/* 탭 메뉴 */}
        <div className="tab-menu">
          <button
            onClick={() => setActiveTab('edit')}
            className={`tab-btn ${activeTab === 'edit' ? 'active' : ''}`}
          >
            단가 수정
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          >
            변동 이력 ({history.length})
          </button>
        </div>

        {/* 단가 수정 탭 */}
        {activeTab === 'edit' && (
          <>
            <div className="part-info">
              <div className="info-row">
                <span className="label">랙타입:</span>
                <span className="value">{targetPart.rackType || '정보 없음'}</span>
              </div>
              <div className="info-row">
                <span className="label">부품명:</span>
                <span className="value">{targetPart.name || '정보 없음'}</span>
              </div>
              {targetPart.specification && (
                <div className="info-row">
                  <span className="label">규격:</span>
                  <span className="value">{targetPart.specification}</span>
                </div>
              )}

              {/* 부품ID 표시 추가 */}
              <div className="info-row">
                <span className="label">부품 ID:</span>
                <span className="value part-id">
                  <code style={{background: '#f1f3f5', padding: '4px 8px', borderRadius: '4px', fontSize: '13px'}}>{partId}</code>
                  <button onClick={copyPartIdToClipboard} className="copy-btn" title="부품ID 복사" style={{marginLeft: '8px'}}>복사</button>
                </span>
              </div>

              <div className="info-row">
                <span className="label">기본 단가:</span>
                <span className="value">{(targetPart.unitPrice || 0).toLocaleString()}원</span>
              </div>
              <div className="info-row">
                <span className="label">현재 관리자 단가:</span>
                <span className={`value ${currentAdminPrice > 0 ? 'active' : 'inactive'}`}>
                  {currentAdminPrice > 0 ? `${currentAdminPrice.toLocaleString()}원` : '없음'}
                </span>
              </div>
            </div>

            <div className="price-input-section">
              <label htmlFor="newPrice">새 단가 (원)</label>
              <input
                type="number"
                id="newPrice"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="새 단가를 입력하세요"
                min="0"
                disabled={isLoading}
              />
              <small>0을 입력하면 기본 단가를 사용합니다.</small>
            </div>

            {message && (
              <div className={`message ${message.includes('✅') ? 'success' : message.includes('❌') ? 'error' : 'info'}`}>
                {message}
              </div>
            )}

            <div className="editor-actions">
              <button 
                onClick={handleSave} 
                disabled={isLoading || newPrice === ''}
                className="save-btn"
              >
                {isLoading ? '저장 중...' : '💾 즉시 적용'}
              </button>
              
              {currentAdminPrice > 0 && (
                <button 
                  onClick={handleReset} 
                  disabled={isLoading}
                  className="reset-btn"
                >
                  🗑️ 관리자 단가 삭제
                </button>
              )}
              
              <button onClick={onClose} className="cancel-btn">
                취소
              </button>
            </div>

            <div className="sync-info">
              <small>
                🌐 이 변경사항은 모든 PC에서 즉시 반영됩니다.<br/>
                💾 GitHub에 자동 백업되며, 오프라인 시에는 온라인 복구 시 동기화됩니다.
              </small>
            </div>
          </>
        )}

        {/* 변동 이력 탭 */}
        {activeTab === 'history' && (
          <div className="history-section">
            {history.length > 0 ? (
              <div className="history-list">
                {history.map((entry, index) => (
                  <div key={entry.id || index} className={`history-item ${index === 0 ? 'latest' : ''}`}>
                    <div className="history-header">
                      <span className="timestamp">
                        {new Date(entry.timestamp).toLocaleString('ko-KR')}
                      </span>
                      <span className={`action-badge ${entry.action}`}>
                        {entry.action === 'created' ? '생성' : 
                         entry.action === 'updated' ? '수정' : 
                         entry.action === 'deleted' ? '삭제' : '변경'}
                      </span>
                    </div>
                    
                    <div className="price-change">
                      <span className="old-price">
                        {entry.oldPrice.toLocaleString()}원
                      </span>
                      <span className="arrow">→</span>
                      <span className="new-price">
                        {entry.newPrice.toLocaleString()}원
                      </span>
                    </div>
                    
                    <div className="history-details">
                      <div className="detail-row">
                        <span className="label">수정자:</span>
                        <span className="value">{entry.username} ({entry.userRole})</span>
                      </div>
                      <div className="detail-row">
                        <span className="label">IP 주소:</span>
                        <span className="value">{entry.userIP}</span>
                      </div>
                      {entry.partName && (
                        <div className="detail-row">
                          <span className="label">부품:</span>
                          <span className="value">{entry.partName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-history">
                <div className="no-history-icon">📝</div>
                <div className="no-history-text">변동 이력이 없습니다.</div>
                <div className="no-history-subtext">
                  단가를 수정하면 이곳에 이력이 기록됩니다.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .admin-price-editor-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .admin-price-editor {
          background: white;
          border-radius: 12px;
          padding: 24px;
          width: 600px;
          max-width: 90vw;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid #f0f0f0;
        }

        .editor-header h3 {
          margin: 0;
          color: #333;
          font-size: 18px;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          padding: 0;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          background: #f0f0f0;
          color: #333;
        }

        .tab-menu {
          display: flex;
          border-bottom: 1px solid #eee;
          margin-bottom: 20px;
        }

        .tab-btn {
          padding: 10px 20px;
          border: none;
          background: transparent;
          color: #666;
          cursor: pointer;
          border-radius: 4px 4px 0 0;
          transition: all 0.2s;
          font-size: 14px;
          font-weight: 500;
        }

        .tab-btn.active {
          background: #007bff;
          color: white;
        }

        .tab-btn:hover:not(.active) {
          background: #f8f9fa;
          color: #333;
        }

        .part-info {
          background: #f8f9fa;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          align-items: center;
        }

        .info-row:last-child {
          margin-bottom: 0;
        }

        .label {
          font-weight: bold;
          color: #555;
        }

        .value {
          color: #333;
        }

        .value.active {
          color: #28a745;
          font-weight: bold;
        }

        .value.inactive {
          color: #6c757d;
          font-style: italic;
        }

        .price-input-section {
          margin-bottom: 20px;
        }

        .price-input-section label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
          color: #333;
        }

        .price-input-section input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 16px;
          box-sizing: border-box;
        }

        .price-input-section input:focus {
          border-color: #007bff;
          outline: none;
          box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
        }

        .price-input-section small {
          display: block;
          margin-top: 6px;
          color: #666;
          font-size: 14px;
        }

        .message {
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 20px;
          font-weight: bold;
        }

        .message.success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .message.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .message.info {
          background: #d1ecf1;
          color: #0c5460;
          border: 1px solid #bee5eb;
        }

        .editor-actions {
          display: flex;
          gap: 10px;
          margin-bottom: 16px;
        }

        .editor-actions button {
          flex: 1;
          padding: 12px 16px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
        }

        .save-btn {
          background: #28a745;
          color: white;
        }

        .save-btn:hover:not(:disabled) {
          background: #218838;
        }

        .save-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .reset-btn {
          background: #dc3545;
          color: white;
        }

        .reset-btn:hover:not(:disabled) {
          background: #c82333;
        }

        .cancel-btn {
          background: #6c757d;
          color: white;
        }

        .cancel-btn:hover {
          background: #5a6268;
        }

        .copy-btn {
          background: #007bff;
          color: white;
          border: none;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        }

        .copy-btn:hover {
          background: #0069d9;
        }

        .sync-info {
          background: #e3f2fd;
          padding: 12px;
          border-radius: 6px;
          text-align: center;
        }

        .sync-info small {
          color: #1565c0;
          line-height: 1.4;
        }

        .history-section {
          min-height: 300px;
        }

        .history-list {
          max-height: 400px;
          overflow-y: auto;
        }

        .history-item {
          padding: 16px;
          border: 1px solid #eee;
          border-radius: 8px;
          margin-bottom: 12px;
          background: white;
        }

        .history-item.latest {
          background: #f8f9fa;
          border-color: #007bff;
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .timestamp {
          font-size: 13px;
          color: #666;
          font-weight: 500;
        }

        .action-badge {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 12px;
          color: white;
          font-weight: bold;
        }

        .action-badge.created {
          background: #28a745;
        }

        .action-badge.updated {
          background: #007bff;
        }

        .action-badge.deleted {
          background: #dc3545;
        }

        .price-change {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
          font-size: 16px;
          font-weight: bold;
        }

        .old-price {
          color: #dc3545;
          text-decoration: line-through;
        }

        .arrow {
          color: #666;
        }

        .new-price {
          color: #28a745;
        }

        .history-details {
          background: #f8f9fa;
          padding: 12px;
          border-radius: 6px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          font-size: 13px;
        }

        .detail-row:last-child {
          margin-bottom: 0;
        }

        .detail-row .label {
          color: #666;
        }

        .detail-row .value {
          color: #333;
          font-weight: 500;
        }

        .no-history {
          text-align: center;
          padding: 60px 20px;
          color: #666;
        }

        .no-history-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .no-history-text {
          font-size: 18px;
          font-weight: 500;
          margin-bottom: 8px;
        }

        .no-history-subtext {
          font-size: 14px;
          color: #999;
        }
      `}</style>
    </div>
  );
};

export default AdminPriceEditor;
