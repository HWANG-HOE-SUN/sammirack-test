// src/components/InventoryManager.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  saveInventorySync, 
  loadInventory, 
  loadAdminPrices,
  generatePartId,
  getEffectivePrice,
  forceServerSync
} from '../utils/realtimeAdminSync';
import { loadAllMaterials } from '../utils/unifiedPriceManager';
import AdminPriceEditor from './AdminPriceEditor';

const InventoryManager = ({ currentUser }) => {
  const [allMaterials, setAllMaterials] = useState([]);
  const [inventory, setInventory] = useState({});
  const [adminPrices, setAdminPrices] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPart, setEditingPart] = useState(null);
  const [syncStatus, setSyncStatus] = useState('✅ 동기화됨');
  const [lastSyncTime, setLastSyncTime] = useState(new Date());

  // 관리자가 아닌 경우 접근 차단
  if (currentUser?.role !== 'admin') {
    return (
      <div style={{ 
        padding: '40px 20px', 
        textAlign: 'center', 
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        color: '#6c757d'
      }}>
        <h3>접근 권한이 없습니다</h3>
        <p>재고관리는 관리자만 접근할 수 있습니다.</p>
      </div>
    );
  }

  useEffect(() => {
    loadAllData();
    setupRealtimeListeners();
  }, []);

  // 실시간 동기화 리스너 설정
  const setupRealtimeListeners = () => {
    const handleInventoryUpdate = (event) => {
      console.log('📦 실시간 재고 업데이트:', event.detail);
      setSyncStatus('🔄 동기화 중...');
      loadInventoryData();
      setLastSyncTime(new Date());
      
      setTimeout(() => {
        setSyncStatus('✅ 동기화됨');
      }, 1000);
    };

    const handlePriceUpdate = (event) => {
      console.log('💰 실시간 단가 업데이트:', event.detail);
      setSyncStatus('🔄 동기화 중...');
      loadAdminPricesData();
      setLastSyncTime(new Date());
      
      setTimeout(() => {
        setSyncStatus('✅ 동기화됨');
      }, 1000);
    };

    const handleForceReload = () => {
      console.log('🔄 전체 데이터 강제 새로고침');
      loadAllData();
    };

    window.addEventListener('inventoryUpdated', handleInventoryUpdate);
    window.addEventListener('adminPricesUpdated', handlePriceUpdate);
    window.addEventListener('forceDataReload', handleForceReload);

    return () => {
      window.removeEventListener('inventoryUpdated', handleInventoryUpdate);
      window.removeEventListener('adminPricesUpdated', handlePriceUpdate);
      window.removeEventListener('forceDataReload', handleForceReload);
    };
  };

  const loadAllData = async () => {
    setIsLoading(true);
    setSyncStatus('🔄 로딩 중...');
    
    try {
      await Promise.all([
        loadMaterialsData(),
        loadInventoryData(),
        loadAdminPricesData()
      ]);
      
      setSyncStatus('✅ 동기화됨');
      setLastSyncTime(new Date());
    } catch (error) {
      console.error('❌ 데이터 로드 실패:', error);
      setSyncStatus('❌ 오류');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMaterialsData = async () => {
    try {
      console.log('🔄 전체 원자재 로드 시작');
      const materials = await loadAllMaterials();
      setAllMaterials(materials);
      console.log(`✅ ${materials.length}개 원자재 로드 완료`);
    } catch (error) {
      console.error('❌ 원자재 로드 실패:', error);
      setAllMaterials([]);
    }
  };

  const loadInventoryData = () => {
    try {
      const data = loadInventory();
      setInventory(data);
      console.log(`📦 재고 데이터 로드: ${Object.keys(data).length}개 항목`);
    } catch (error) {
      console.error('❌ 재고 데이터 로드 실패:', error);
      setInventory({});
    }
  };

  const loadAdminPricesData = () => {
    try {
      const data = loadAdminPrices();
      setAdminPrices(data);
      console.log(`💰 관리자 단가 로드: ${Object.keys(data).length}개 항목`);
    } catch (error) {
      console.error('❌ 관리자 단가 로드 실패:', error);
      setAdminPrices({});
    }
  };

  // 재고 수량 변경 (실시간 동기화)
  const handleInventoryChange = async (material, newQuantity) => {
    const partId = material.partId || generatePartId(material);
    const quantity = Math.max(0, Number(newQuantity) || 0);
    
    setSyncStatus('📤 저장 중...');
    
    try {
      const userInfo = {
        username: currentUser?.username || 'admin',
        role: currentUser?.role || 'admin'
      };

      const success = await saveInventorySync(partId, quantity, userInfo);
      
      if (success) {
        // 즉시 로컬 상태 업데이트
        setInventory(prev => ({
          ...prev,
          [partId]: quantity
        }));
        
        setSyncStatus('✅ 전세계 동기화됨');
        setLastSyncTime(new Date());
      } else {
        setSyncStatus('❌ 저장 실패');
      }
    } catch (error) {
      console.error('재고 저장 실패:', error);
      setSyncStatus('❌ 오류');
    }
  };

  // 서버에서 강제 동기화
  const handleForceSync = async () => {
    setSyncStatus('🔄 서버 동기화 중...');
    
    try {
      await forceServerSync();
      await loadAllData();
      setSyncStatus('✅ 서버 동기화 완료');
    } catch (error) {
      console.error('서버 동기화 실패:', error);
      setSyncStatus('❌ 동기화 실패');
    }
  };

  // 필터링된 원자재 목록
  const filteredMaterials = useMemo(() => {
    if (!searchTerm.trim()) {
      return allMaterials;
    }

    const searchLower = searchTerm.toLowerCase();
    return allMaterials.filter(material => {
      const nameMatch = (material.name || '').toLowerCase().includes(searchLower);
      const specMatch = (material.specification || '').toLowerCase().includes(searchLower);
      const rackTypeMatch = (material.rackType || '').toLowerCase().includes(searchLower);
      return nameMatch || specMatch || rackTypeMatch;
    });
  }, [allMaterials, searchTerm]);

  const getInventoryQuantity = (material) => {
    const partId = material.partId || generatePartId(material);
    return inventory[partId] || 0;
  };

  const getDisplayPrice = (material) => {
    const effectivePrice = getEffectivePrice(material);
    const hasAdminPrice = adminPrices[material.partId || generatePartId(material)]?.price > 0;
    
    return {
      price: effectivePrice,
      isModified: hasAdminPrice
    };
  };

  return (
    <div className="inventory-manager">
      <div className="inventory-header">
        <div className="header-title">
          <h2>📦 재고관리 시스템</h2>
          <div className="sync-status">
            <span className="status">{syncStatus}</span>
            <small>마지막 동기화: {lastSyncTime.toLocaleTimeString()}</small>
          </div>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={handleForceSync} 
            className="sync-btn"
            disabled={isLoading}
          >
            🔄 서버 동기화
          </button>
        </div>
      </div>

      <div className="search-section">
        <input
          type="text"
          placeholder="부품명, 규격, 랙타입으로 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <div className="search-stats">
          {filteredMaterials.length}개 부품 (전체 {allMaterials.length}개)
        </div>
      </div>

      <div className="sync-info-banner">
        🌐 재고 및 단가 변경사항은 전 세계 모든 PC에서 실시간으로 동기화됩니다.
      </div>

      <div className="inventory-table-container">
        {isLoading ? (
          <div className="loading">데이터 로딩 중...</div>
        ) : (
          <table className="inventory-table">
            <thead>
              <tr>
                <th>부품명</th>
                <th>규격</th>
                <th>랙타입</th>
                <th>현재 재고</th>
                <th>단가</th>
                <th>재고 가치</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.map((material, index) => {
                const partId = material.partId || generatePartId(material);
                const quantity = getInventoryQuantity(material);
                const { price, isModified } = getDisplayPrice(material);
                const totalValue = quantity * price;

                return (
                  <tr key={partId || index}>
                    <td>
                      <div className="part-name">
                        {material.name}
                        {material.source && (
                          <span className="source-tag">{material.source}</span>
                        )}
                      </div>
                    </td>
                    <td>{material.specification || '-'}</td>
                    <td>
                      <span className="rack-type">{material.rackType}</span>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={quantity}
                        onChange={(e) => handleInventoryChange(material, e.target.value)}
                        min="0"
                        className="quantity-input"
                      />
                    </td>
                    <td>
                      <div className="price-display">
                        <span className={`price ${isModified ? 'modified' : ''}`}>
                          {price.toLocaleString()}원
                        </span>
                        {isModified && <span className="modified-tag">수정됨</span>}
                      </div>
                    </td>
                    <td>
                      <span className="total-value">
                        {totalValue.toLocaleString()}원
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => setEditingPart(material)}
                        className="edit-price-btn"
                        title="단가 수정"
                      >
                        💰 단가수정
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editingPart && (
        <AdminPriceEditor
          part={editingPart}
          onClose={() => setEditingPart(null)}
          currentUser={currentUser}
        />
      )}

      <style jsx>{`
        .inventory-manager {
          padding: 20px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .inventory-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid #e0e0e0;
        }

        .header-title h2 {
          margin: 0 0 5px 0;
          color: #333;
        }

        .sync-status {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .status {
          font-weight: bold;
          padding: 4px 8px;
          border-radius: 4px;
          background: #e8f5e8;
          color: #2d5a2d;
          font-size: 14px;
        }

        .sync-status small {
          color: #666;
          font-size: 12px;
          margin-top: 2px;
        }

        .sync-btn {
          padding: 10px 16px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
        }

        .sync-btn:hover:not(:disabled) {
          background: #0056b3;
        }

        .sync-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .search-section {
          margin-bottom: 20px;
        }

        .search-input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 16px;
          margin-bottom: 8px;
        }

        .search-stats {
          color: #666;
          font-size: 14px;
        }

        .sync-info-banner {
          background: #e3f2fd;
          padding: 12px;
          border-radius: 6px;
          text-align: center;
          margin-bottom: 20px;
          color: #1565c0;
          font-weight: bold;
        }

        .inventory-table-container {
          overflow-x: auto;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .inventory-table {
          width: 100%;
          border-collapse: collapse;
        }

        .inventory-table th {
          background: #f8f9fa;
          padding: 12px;
          text-align: left;
          font-weight: bold;
          border-bottom: 2px solid #dee2e6;
        }

        .inventory-table td {
          padding: 12px;
          border-bottom: 1px solid #dee2e6;
        }

        .inventory-table tr:hover {
          background: #f8f9fa;
        }

        .part-name {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .source-tag {
          background: #e9ecef;
          color: #495057;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }

        .rack-type {
          background: #007bff;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
        }

        .quantity-input {
          width: 80px;
          padding: 6px;
          border: 1px solid #ddd;
          border-radius: 4px;
          text-align: center;
        }

        .price-display {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .price.modified {
          color: #28a745;
          font-weight: bold;
        }

        .modified-tag {
          background: #28a745;
          color: white;
          padding: 2px 4px;
          border-radius: 3px;
          font-size: 10px;
          margin-top: 2px;
        }

        .total-value {
          font-weight: bold;
          color: #495057;
        }

        .edit-price-btn {
          background: #ffc107;
          color: #212529;
          border: none;
          padding: 6px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: bold;
        }

        .edit-price-btn:hover {
          background: #e0a800;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
          font-size: 18px;
        }
      `}</style>
    </div>
  );
};

export default InventoryManager;
