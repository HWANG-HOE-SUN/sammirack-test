import React, { useState, useEffect } from 'react';
import { 
  loadAdminPrices, 
  saveAdminPrice, 
  loadPriceHistory, 
  savePriceHistory, 
  generatePartId,
  getRackOptionsUsingPart 
} from '../utils/unifiedPriceManager';

const AdminPriceEditor = ({ item, onClose, onSave }) => {
  const [editPrice, setEditPrice] = useState(item.unitPrice || 0);
  const [originalPrice] = useState(item.unitPrice || 0);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('edit'); // 'edit' or 'history'
  const [loading, setLoading] = useState(false);
  const [usingOptions, setUsingOptions] = useState([]);

  const partId = item.partId || generatePartId(item);

  // 컴포넌트 마운트 시 히스토리 및 사용 옵션 로드
  useEffect(() => {
    loadPriceHistoryData();
    loadUsingOptions();
    loadCurrentAdminPrice();
  }, [partId]);

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

  // 현재 관리자 수정 단가 로드
  const loadCurrentAdminPrice = () => {
    try {
      const adminPrices = loadAdminPrices();
      const currentAdminPrice = adminPrices[partId];
      
      if (currentAdminPrice && currentAdminPrice.price > 0) {
        setEditPrice(currentAdminPrice.price);
      }
    } catch (error) {
      console.error('현재 관리자 단가 로드 실패:', error);
    }
  };

  // 이 부품을 사용하는 랙옵션들 로드
  const loadUsingOptions = () => {
    try {
      const options = getRackOptionsUsingPart(partId);
      setUsingOptions(options);
    } catch (error) {
      console.error('사용 옵션 로드 실패:', error);
      setUsingOptions([]);
    }
  };

  // 가격 저장 핸들러
  const handleSave = async () => {
    if (loading) return;
    
    setLoading(true);
    try {
      const newPrice = Number(editPrice) || 0;
      const oldPrice = originalPrice;
      
      // 관리자 단가 저장
      const success = saveAdminPrice(partId, newPrice, {
        rackType: item.rackType,
        name: item.name,
        specification: item.specification || '',
        displayName: item.displayName || `${item.rackType} ${item.name} ${item.specification || ''}`.trim()
      });
      
      if (success) {
        // 히스토리 저장
        savePriceHistory(
          partId, 
          oldPrice, 
          newPrice, 
          item.displayName || `${item.rackType} ${item.name} ${item.specification || ''}`.trim()
        );
        
        // 히스토리 재로드
        loadPriceHistoryData();
        
        // 상위 컴포넌트에 알림
        if (onSave) {
          onSave(partId, newPrice, oldPrice);
        }
        
        // 모달 닫기
        onClose();
      } else {
        alert('단가 저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('단가 저장 실패:', error);
      alert('단가 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 가격 삭제 (기본값으로 되돌리기)
  const handleDelete = async () => {
    if (loading) return;
    
    if (!confirm('관리자 수정 단가를 삭제하고 기본값으로 되돌리시겠습니까?')) {
      return;
    }
    
    setLoading(true);
    try {
      const oldPrice = editPrice;
      
      // 관리자 단가 삭제 (0으로 설정하면 삭제됨)
      const success = saveAdminPrice(partId, 0);
      
      if (success) {
        // 히스토리 저장
        savePriceHistory(
          partId, 
          oldPrice, 
          originalPrice, 
          `${item.displayName || `${item.rackType} ${item.name} ${item.specification || ''}`.trim()} (기본값으로 복원)`
        );
        
        // 기본값으로 되돌리기
        setEditPrice(originalPrice);
        
        // 히스토리 재로드
        loadPriceHistoryData();
        
        // 상위 컴포넌트에 알림
        if (onSave) {
          onSave(partId, originalPrice, oldPrice);
        }
        
        alert('기본값으로 복원되었습니다.');
      } else {
        alert('단가 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('단가 삭제 실패:', error);
      alert('단가 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: '#fff',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflow: 'auto'
      }}>
        {/* 헤더 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          marginBottom: '20px'
        }}>
          <div>
            <h3 style={{ margin: 0, color: '#333', fontSize: '20px' }}>
              부품 단가 수정
            </h3>
            <div style={{ 
              fontSize: '14px', 
              color: '#666', 
              marginTop: '4px',
              lineHeight: '1.4'
            }}>
              <strong>{item.rackType}</strong> - {item.name} {item.specification || ''}
            </div>
            <div style={{ 
              fontSize: '12px', 
              color: '#007bff', 
              marginTop: '2px'
            }}>
              부품 ID: {partId}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: '#666',
              padding: '0',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        {/* 탭 메뉴 */}
        <div style={{ 
          display: 'flex', 
          borderBottom: '1px solid #eee',
          marginBottom: '20px'
        }}>
          <button
            onClick={() => setActiveTab('edit')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: activeTab === 'edit' ? '#007bff' : 'transparent',
              color: activeTab === 'edit' ? 'white' : '#666',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              transition: 'all 0.2s'
            }}
          >
            단가 수정
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: activeTab === 'history' ? '#007bff' : 'transparent',
              color: activeTab === 'history' ? 'white' : '#666',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              transition: 'all 0.2s'
            }}
          >
            변경 이력 ({history.length})
          </button>
        </div>

        {/* 단가 수정 탭 */}
        {activeTab === 'edit' && (
          <div>
            {/* 현재 단가 정보 */}
            <div style={{ 
              backgroundColor: '#f8f9fa',
              padding: '16px',
              borderRadius: '6px',
              marginBottom: '20px'
            }}>
              <div style={{ 
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
              }}>
                <span style={{ fontWeight: 'bold', color: '#333' }}>
                  기본 단가:
                </span>
                <span style={{ fontSize: '16px', color: '#666' }}>
                  {originalPrice ? originalPrice.toLocaleString() : '0'}원
                </span>
              </div>
              <div style={{ 
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: 'bold', color: '#333' }}>
                  현재 적용 단가:
                </span>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#007bff' }}>
                  {editPrice ? Number(editPrice).toLocaleString() : '0'}원
                </span>
              </div>
            </div>

            {/* 단가 입력 */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '8px',
                fontWeight: 'bold',
                color: '#333'
              }}>
                새 단가 (원)
              </label>
              <input
                type="number"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                min="0"
                step="1"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '16px',
                  outline: 'none'
                }}
                placeholder="단가를 입력하세요"
              />
              <div style={{ 
                fontSize: '12px',
                color: '#666',
                marginTop: '4px'
              }}>
                0원 입력 시 기본값을 사용합니다.
              </div>
            </div>

            {/* 사용 랙옵션 정보 */}
            {usingOptions.length > 0 && (
              <div style={{ 
                backgroundColor: '#e7f3ff',
                padding: '16px',
                borderRadius: '6px',
                marginBottom: '20px',
                border: '1px solid #b8daff'
              }}>
                <div style={{ 
                  fontWeight: 'bold',
                  color: '#0c5aa6',
                  marginBottom: '8px'
                }}>
                  📋 이 부품을 사용하는 랙옵션 ({usingOptions.length}개)
                </div>
                <div style={{ 
                  maxHeight: '120px',
                  overflowY: 'auto',
                  fontSize: '13px'
                }}>
                  {usingOptions.map((option, index) => (
                    <div key={index} style={{ 
                      marginBottom: '4px',
                      color: '#0c5aa6'
                    }}>
                      • {option.displayName}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 액션 버튼 */}
            <div style={{ 
              display: 'flex', 
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={handleDelete}
                disabled={loading}
                style={{
                  backgroundColor: '#dc3545',
                  color: 'white',
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: loading ? 0.6 : 1,
                  transition: 'all 0.2s'
                }}
              >
                기본값 복원
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                style={{
                  backgroundColor: '#6c757d',
                  color: 'white',
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: loading ? 0.6 : 1,
                  transition: 'all 0.2s'
                }}
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                style={{
                  backgroundColor: '#28a745',
                  color: 'white',
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: loading ? 0.6 : 1,
                  transition: 'all 0.2s'
                }}
              >
                {loading ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        )}

        {/* 변경 이력 탭 */}
        {activeTab === 'history' && (
          <div>
            {history.length > 0 ? (
              <div style={{ 
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                {history.map((entry, index) => (
                  <div key={entry.id || index} style={{
                    padding: '12px',
                    border: '1px solid #eee',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    backgroundColor: index === 0 ? '#f8f9fa' : 'white'
                  }}>
                    <div style={{ 
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px'
                    }}>
                      <span style={{ 
                        fontSize: '12px',
                        color: '#666'
                      }}>
                        {new Date(entry.timestamp).toLocaleString('ko-KR')}
                      </span>
                      <span style={{ 
                        fontSize: '11px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '3px'
                      }}>
                        {entry.account}
                      </span>
                    </div>
                    <div style={{ 
                      fontSize: '14px',
                      color: '#333',
                      marginBottom: '4px'
                    }}>
                      <span style={{ 
                        textDecoration: 'line-through',
                        color: '#dc3545'
                      }}>
                        {entry.oldPrice.toLocaleString()}원
                      </span>
                      <span style={{ margin: '0 8px', color: '#666' }}>→</span>
                      <span style={{ 
                        fontWeight: 'bold',
                        color: '#28a745'
                      }}>
                        {entry.newPrice.toLocaleString()}원
                      </span>
                    </div>
                    {entry.rackOption && (
                      <div style={{ 
                        fontSize: '12px',
                        color: '#666'
                      }}>
                        적용 랙옵션: {entry.rackOption}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ 
                textAlign: 'center',
                padding: '40px 20px',
                color: '#666'
              }}>
                <div style={{ fontSize: '16px', marginBottom: '8px' }}>📝</div>
                <div>변경 이력이 없습니다.</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>
                  단가를 수정하면 이곳에 이력이 기록됩니다.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPriceEditor;
