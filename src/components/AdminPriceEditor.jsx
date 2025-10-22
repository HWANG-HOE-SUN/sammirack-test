// src/components/AdminPriceEditor.jsx (수정된 코드)
import React, { useState, useEffect } from 'react';
import { 
  saveAdminPriceSync, 
  loadAdminPrices, 
  generatePartId 
} from '../utils/realtimeAdminSync';

const AdminPriceEditor = ({ item, part, onClose, currentUser }) => {
  // ✅ item과 part 둘 다 받을 수 있도록 처리 (하위 호환성)
  const targetPart = part || item;
  
  const [newPrice, setNewPrice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentAdminPrice, setCurrentAdminPrice] = useState(0);
  const [message, setMessage] = useState('');

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

  useEffect(() => {
    loadCurrentPrice();
  }, [targetPart]);

  // 실시간 업데이트 감지
  useEffect(() => {
    const handlePriceUpdate = (event) => {
      console.log('실시간 단가 업데이트 감지:', event.detail);
      loadCurrentPrice();
      setMessage('다른 PC에서 단가가 업데이트되었습니다.');
      setTimeout(() => setMessage(''), 3000);
    };

    window.addEventListener('adminPricesUpdated', handlePriceUpdate);
    return () => window.removeEventListener('adminPricesUpdated', handlePriceUpdate);
  }, []);

  const loadCurrentPrice = () => {
    try {
      const adminPrices = loadAdminPrices();
      const partId = generatePartId(targetPart);
      const currentPrice = adminPrices[partId]?.price || 0;
      setCurrentAdminPrice(currentPrice);
      setNewPrice(currentPrice > 0 ? currentPrice.toString() : '');
    } catch (error) {
      console.error('현재 단가 로드 실패:', error);
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
      const partId = generatePartId(targetPart);
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

      // 실시간 동기화 저장
      const success = await saveAdminPriceSync(partId, price, partInfo, userInfo);
      
      if (success) {
        setMessage('✅ 모든 PC에 즉시 반영되었습니다!');
        setCurrentAdminPrice(price);
        
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
      const partId = generatePartId(targetPart);
      const partInfo = {
        rackType: targetPart.rackType || '',
        name: targetPart.name || '',
        specification: targetPart.specification || ''
      };

      const userInfo = {
        username: currentUser?.username || 'admin',
        role: currentUser?.role || 'admin'
      };

      // 실시간 동기화로 삭제 (price = 0으로 설정)
      const success = await saveAdminPriceSync(partId, 0, partInfo, userInfo);
      
      if (success) {
        setMessage('✅ 관리자 단가가 삭제되었습니다.');
        setCurrentAdminPrice(0);
        setNewPrice('');
        
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

  return (
    <div className="admin-price-editor-overlay">
      <div className="admin-price-editor">
        <div className="editor-header">
          <h3>관리자 단가 수정</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

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
          width: 500px;
          max-width: 90vw;
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
      `}</style>
    </div>
  );
};

export default AdminPriceEditor;
