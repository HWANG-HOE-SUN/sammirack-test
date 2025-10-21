// src/components/InventoryManager.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { sortBOMByMaterialRule } from '../utils/materialSort';
import { 
  loadAllMaterials, 
  generatePartId, 
  generateRackOptionId,
  loadAdminPrices,
  getEffectivePrice
} from '../utils/unifiedPriceManager';
import { 
  saveInventorySync, 
  loadInventory, 
  forceServerSync 
} from '../utils/realtimeAdminSync';
import AdminPriceEditor from './AdminPriceEditor';

// 무게명칭 변환
function kgLabelFix(str) {
  if (!str) return '';
  return String(str).replace(/200kg/g, '270kg').replace(/350kg/g, '450kg');
}

// 재고 감소 함수 (export 필요)
export const deductInventoryOnPrint = (cartItems, documentType = 'document', documentNumber = '') => {
  if (!cartItems || !Array.isArray(cartItems)) {
    console.warn('재고 감소: 유효하지 않은 카트 데이터');
    return { success: false, message: '유효하지 않은 데이터' };
  }
  
  console.log(`📋 프린트 재고 감소 시작: ${documentType} ${documentNumber}`);
  
  try {
    // 현재 재고 데이터 로드
    const stored = localStorage.getItem('inventory_data') || '{}';
    const inventory = JSON.parse(stored);
    
    const deductedParts = [];
    const warnings = [];
    
    // 모든 카트 아이템의 BOM 부품들을 추출하여 재고 감소
    cartItems.forEach((item, itemIndex) => {
      if (item.bom && Array.isArray(item.bom)) {
        item.bom.forEach((bomItem) => {
          const partId = generatePartId(bomItem);
          const requiredQty = Number(bomItem.quantity) || 0;
          const currentStock = inventory[partId] || 0;
          
          if (requiredQty > 0) {
            if (currentStock >= requiredQty) {
              // 충분한 재고가 있는 경우 감소
              inventory[partId] = currentStock - requiredQty;
              deductedParts.push({
                partId,
                name: bomItem.name,
                specification: bomItem.specification || '',
                deducted: requiredQty,
                remainingStock: inventory[partId]
              });
            } else {
              // 재고 부족 경고
              warnings.push({
                partId,
                name: bomItem.name,
                specification: bomItem.specification || '',
                required: requiredQty,
                available: currentStock,
                shortage: requiredQty - currentStock
              });
              
              // 가능한 만큼만 감소
              if (currentStock > 0) {
                inventory[partId] = 0;
                deductedParts.push({
                  partId,
                  name: bomItem.name,
                  specification: bomItem.specification || '',
                  deducted: currentStock,
                  remainingStock: 0
                });
              }
            }
          }
        });
      }
    });
    
    // 변경된 재고 저장
    localStorage.setItem('inventory_data', JSON.stringify(inventory));
    
    console.log(`✅ 재고 감소 완료: ${deductedParts.length}개 부품, ${warnings.length}개 경고`);
    
    return {
      success: true,
      deductedParts,
      warnings,
      message: `${deductedParts.length}개 부품 재고가 감소되었습니다.`
    };
    
  } catch (error) {
    console.error('❌ 재고 감소 처리 중 오류:', error);
    return {
      success: false,
      message: '재고 감소 처리 중 오류가 발생했습니다.',
      error: error.message
    };
  }
};

// 재고 감소 결과 사용자에게 표시
export const showInventoryResult = (result, documentType) => {
  if (!result) return;
  
  let message = `📄 ${documentType} 출력 완료\n`;
  
  if (result.success) {
    message += `📦 재고 감소: ${result.deductedParts.length}개 부품 처리`;
    
    if (result.warnings.length > 0) {
      message += `\n⚠️ 재고 부족 경고: ${result.warnings.length}개 부품`;
      
      // 재고 부족 부품 상세 (최대 3개)
      const warningDetails = result.warnings.slice(0, 3).map(w => 
        `• ${w.name}: 필요 ${w.required}개, 가용 ${w.available}개`
      ).join('\n');
      
      message += '\n' + warningDetails;
      
      if (result.warnings.length > 3) {
        message += `\n• 외 ${result.warnings.length - 3}개 부품...`;
      }
      
      // 재고 부족 시 추가 안내
      message += '\n\n재고 관리 탭에서 부족한 부품을 확인하고 보충하세요.';
    }
    
    // 결과 표시
    if (result.warnings.length > 0) {
      // 경고가 있으면 confirm으로 재고 탭 이동 제안
      if (window.confirm(message + '\n\n재고 관리 탭으로 이동하시겠습니까?')) {
        window.dispatchEvent(new CustomEvent('showInventoryTab'));
      }
    } else {
      // 정상 완료는 간단히 alert
      alert(message);
    }
    
  } else {
    message += `❌ 재고 감소 실패: ${result.message}`;
    alert(message);
  }
};

const InventoryManager = ({ currentUser }) => {
  const [allMaterials, setAllMaterials] = useState([]);
  const [inventory, setInventory] = useState({});
  const [adminPrices, setAdminPrices] = useState({});
  const [rackOptions, setRackOptions] = useState([]);
  const [filteredMaterials, setFilteredMaterials] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyInUse, setShowOnlyInUse] = useState(false);
  const [selectedRackType, setSelectedRackType] = useState('');
  const [editingPart, setEditingPart] = useState(null);
  const [sortConfig, setSortConfig] = useState({ field: '', direction: '' });
  const [showAdminPriceEditor, setShowAdminPriceEditor] = useState(false);
  const [editingPrice, setEditingPrice] = useState(null);
  
  // 실시간 동기화 관련
  const [syncStatus, setSyncStatus] = useState('✅ 동기화됨');
  const [lastSyncTime, setLastSyncTime] = useState(new Date());
  
  // 일괄 작업 관련
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(''); // 일괄 작업 종류
  const [bulkValue, setBulkValue] = useState(''); // 일괄 작업 값

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
    loadAllMaterialsData();
    loadInventoryData();
    loadAdminPricesData();
    loadRackOptions();
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

  // ✅ 개선된 전체 원자재 로드 (통합 함수 사용)
  const loadAllMaterialsData = async () => {
    setIsLoading(true);
    try {
      console.log('🔄 InventoryManager: 전체 원자재 로드 시작');
      const materials = await loadAllMaterials();
      setAllMaterials(materials);
      console.log(`✅ InventoryManager: ${materials.length}개 원자재 로드 완료`);
      
      // 앙카볼트 등 주요 부품들이 포함되었는지 확인
      const anchorBolts = materials.filter(m => m.name.includes('앙카볼트'));
      const bracings = materials.filter(m => m.name.includes('브레싱'));
      console.log(`🔧 앙카볼트: ${anchorBolts.length}개, 브레싱 관련: ${bracings.length}개`);
      
    } catch (error) {
      console.error('❌ 전체 원자재 로드 실패:', error);
      setAllMaterials([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 재고 데이터 로드
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

  // 관리자 단가 데이터 로드
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

  // 랙옵션 목록 로드
  const loadRackOptions = async () => {
    try {
      const bomResponse = await fetch('./bom_data.json');
      const bomData = await bomResponse.json();
      
      const options = [];
      
      Object.keys(bomData).forEach(rackType => {
        const rackData = bomData[rackType];
        Object.keys(rackData).forEach(size => {
          Object.keys(rackData[size]).forEach(height => {
            Object.keys(rackData[size][height]).forEach(level => {
              Object.keys(rackData[size][height][level]).forEach(formType => {
                const productData = rackData[size][height][level][formType];
                if (productData) {
                  const optionId = generateRackOptionId(rackType, size, height, level, formType);
                  const displayName = `${rackType} ${formType} ${size} ${height} ${level}`;
                  
                  options.push({
                    id: optionId,
                    rackType,
                    size,
                    height,
                    level,
                    formType,
                    displayName
                  });
                }
              });
            });
          });
        });
      });
      
      setRackOptions(options);
    } catch (error) {
      console.error('❌ 랙옵션 로드 실패:', error);
    }
  };

  // 전체 데이터 로드
  const loadAllData = async () => {
    setIsLoading(true);
    setSyncStatus('🔄 로딩 중...');
    
    try {
      await Promise.all([
        loadAllMaterialsData(),
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

  // 검색 및 필터링 로직
  useEffect(() => {
    let result = [...allMaterials];

    // 검색어 필터링
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(material => {
        const nameMatch = (material.name || '').toLowerCase().includes(searchLower);
        const specMatch = (material.specification || '').toLowerCase().includes(searchLower);
        const rackTypeMatch = (material.rackType || '').toLowerCase().includes(searchLower);
        const categoryMatch = material.categoryName && material.categoryName.toLowerCase().includes(searchLower);
        return nameMatch || specMatch || rackTypeMatch || categoryMatch;
      });
    }

    // 랙타입 필터링
    if (selectedRackType) {
      result = result.filter(material => material.rackType === selectedRackType);
    }

    // 사용 중인 재고만 보기
    if (showOnlyInUse) {
      result = result.filter(material => {
        const partId = material.partId || generatePartId(material);
        return (inventory[partId] || 0) > 0;
      });
    }

    // 정렬
    if (sortConfig.field) {
      result.sort((a, b) => {
        let aValue, bValue;
        
        switch (sortConfig.field) {
          case 'name':
            aValue = a.name || '';
            bValue = b.name || '';
            break;
          case 'rackType':
            aValue = a.rackType || '';
            bValue = b.rackType || '';
            break;
          case 'quantity':
            aValue = inventory[a.partId || generatePartId(a)] || 0;
            bValue = inventory[b.partId || generatePartId(b)] || 0;
            break;
          case 'price':
            aValue = getEffectivePrice(a);
            bValue = getEffectivePrice(b);
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredMaterials(result);
  }, [allMaterials, searchTerm, selectedRackType, showOnlyInUse, sortConfig, inventory]);

  // 정렬 처리
  const handleSort = (field) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // 체크박스 처리
  const handleSelectAll = (checked) => {
    if (checked) {
      const allIds = new Set(filteredMaterials.map(m => m.partId || generatePartId(m)));
      setSelectedItems(allIds);
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleSelectItem = (partId, checked) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(partId);
      } else {
        newSet.delete(partId);
      }
      return newSet;
    });
  };

  // 일괄 작업 처리
  const handleBulkAction = async () => {
    if (!bulkAction || selectedItems.size === 0) {
      alert('작업을 선택하고 항목을 체크해주세요.');
      return;
    }

    const selectedCount = selectedItems.size;
    
    if (!confirm(`선택된 ${selectedCount}개 항목에 ${bulkAction === 'inventory' ? '재고 설정' : '단가 설정'}을 적용하시겠습니까?`)) {
      return;
    }

    try {
      setIsLoading(true);
      
      for (const partId of selectedItems) {
        if (bulkAction === 'inventory') {
          const quantity = Math.max(0, Number(bulkValue) || 0);
          await handleInventoryChange({ partId }, quantity);
        }
        // 단가 일괄 설정은 별도 구현 필요시 추가
      }
      
      alert(`${selectedCount}개 항목의 ${bulkAction === 'inventory' ? '재고' : '단가'}가 업데이트되었습니다.`);
      setSelectedItems(new Set());
      setBulkAction('');
      setBulkValue('');
      
    } catch (error) {
      console.error('일괄 작업 실패:', error);
      alert('일괄 작업 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 재고 내보내기
  const exportInventory = () => {
    try {
      const inventoryData = filteredMaterials.map(material => {
        const partId = material.partId || generatePartId(material);
        const quantity = inventory[partId] || 0;
        const effectivePrice = getEffectivePrice(material);
        
        return {
          부품명: material.name,
          규격: material.specification || '',
          랙타입: material.rackType,
          재고수량: quantity,
          단가: effectivePrice,
          재고가치: quantity * effectivePrice,
          소스: material.source || '',
          카테고리: material.categoryName || ''
        };
      });

      const dataStr = JSON.stringify(inventoryData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileName = `inventory_${new Date().toISOString().split('T')[0]}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileName);
      linkElement.click();
      
      console.log(`✅ 재고 데이터 내보내기 완료: ${inventoryData.length}개 항목`);
      
    } catch (error) {
      console.error('재고 내보내기 실패:', error);
      alert('재고 내보내기에 실패했습니다.');
    }
  };

  // 재고 가치 계산
  const getTotalInventoryValue = () => {
    return filteredMaterials.reduce((total, material) => {
      const partId = material.partId || generatePartId(material);
      const quantity = inventory[partId] || 0;
      const effectivePrice = getEffectivePrice(material);
      return total + (quantity * effectivePrice);
    }, 0);
  };

  // 부족한 재고 알림
  const getLowStockItems = () => {
    return filteredMaterials.filter(material => {
      const partId = material.partId || generatePartId(material);
      const quantity = inventory[partId] || 0;
      return quantity <= 5; // 5개 이하를 부족한 재고로 간주
    });
  };

  // 랙타입 목록 생성
  const uniqueRackTypes = [...new Set(allMaterials.map(m => m.rackType).filter(Boolean))];

  // 재고 수량 가져오기
  const getInventoryQuantity = (material) => {
    const partId = material.partId || generatePartId(material);
    return inventory[partId] || 0;
  };

  // 표시 가격 정보 가져오기
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
          <button onClick={exportInventory} className="export-btn">
            📤 재고 내보내기
          </button>
        </div>
      </div>

      {/* 재고 통계 */}
      <div className="inventory-stats">
        <div className="stat-card">
          <div className="stat-label">전체 부품 수</div>
          <div className="stat-value">{allMaterials.length.toLocaleString()}개</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">필터링된 부품</div>
          <div className="stat-value">{filteredMaterials.length.toLocaleString()}개</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">총 재고 가치</div>
          <div className="stat-value">{getTotalInventoryValue().toLocaleString()}원</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">부족한 재고</div>
          <div className="stat-value">{getLowStockItems().length}개</div>
        </div>
      </div>

      {/* 검색 및 필터 */}
      <div className="search-section">
        <div className="search-row">
          <input
            type="text"
            placeholder="부품명, 규격, 랙타입으로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <select
            value={selectedRackType}
            onChange={(e) => setSelectedRackType(e.target.value)}
            className="filter-select"
          >
            <option value="">모든 랙타입</option>
            {uniqueRackTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-options">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showOnlyInUse}
              onChange={(e) => setShowOnlyInUse(e.target.checked)}
            />
            재고가 있는 부품만 보기
          </label>
          
          <div className="search-stats">
            {filteredMaterials.length}개 부품 표시 (전체 {allMaterials.length}개)
          </div>
        </div>
      </div>

      {/* 일괄 작업 */}
      <div className="bulk-actions">
        <div className="bulk-controls">
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            className="bulk-action-select"
          >
            <option value="">일괄 작업 선택</option>
            <option value="inventory">재고 수량 설정</option>
          </select>
          
          {bulkAction && (
            <input
              type="number"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              placeholder="설정할 값"
              className="bulk-value-input"
            />
          )}
          
          <button
            onClick={handleBulkAction}
            disabled={!bulkAction || selectedItems.size === 0 || !bulkValue}
            className="bulk-apply-btn"
          >
            선택된 {selectedItems.size}개에 적용
          </button>
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
                <th>
                  <input
                    type="checkbox"
                    checked={selectedItems.size === filteredMaterials.length && filteredMaterials.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th 
                  onClick={() => handleSort('name')}
                  className="sortable"
                >
                  부품명 {sortConfig.field === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th>규격</th>
                <th 
                  onClick={() => handleSort('rackType')}
                  className="sortable"
                >
                  랙타입 {sortConfig.field === 'rackType' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('quantity')}
                  className="sortable"
                >
                  현재 재고 {sortConfig.field === 'quantity' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('price')}
                  className="sortable"
                >
                  단가 {sortConfig.field === 'price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
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
                const isLowStock = quantity <= 5;

                return (
                  <tr key={partId || index} className={isLowStock ? 'low-stock' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedItems.has(partId)}
                        onChange={(e) => handleSelectItem(partId, e.target.checked)}
                      />
                    </td>
                    <td>
                      <div className="part-name">
                        {material.name}
                        {material.source && (
                          <span className="source-tag">{material.source}</span>
                        )}
                        {material.categoryName && (
                          <span className="category-tag">{material.categoryName}</span>
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
                        className={`quantity-input ${isLowStock ? 'low-stock-input' : ''}`}
                      />
                      {isLowStock && <span className="low-stock-badge">부족</span>}
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

      {/* 관리자 단가 편집기 */}
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

        .header-actions {
          display: flex;
          gap: 10px;
        }

        .sync-btn, .export-btn {
          padding: 10px 16px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
        }

        .export-btn {
          background: #28a745;
        }

        .sync-btn:hover:not(:disabled), .export-btn:hover {
          background: #0056b3;
        }

        .export-btn:hover {
          background: #218838;
        }

        .sync-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .inventory-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 20px;
        }

        .stat-card {
          background: white;
          padding: 15px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          border-left: 4px solid #007bff;
        }

        .stat-card.warning {
          border-left-color: #dc3545;
        }

        .stat-label {
          font-size: 14px;
          color: #666;
          margin-bottom: 5px;
        }

        .stat-value {
          font-size: 20px;
          font-weight: bold;
          color: #333;
        }

        .search-section {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .search-row {
          display: flex;
          gap: 15px;
          margin-bottom: 15px;
        }

        .search-input {
          flex: 1;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 16px;
        }

        .filter-select {
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 16px;
          min-width: 200px;
        }

        .filter-options {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #333;
        }

        .search-stats {
          color: #666;
          font-size: 14px;
        }

        .bulk-actions {
          background: #fff3cd;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 20px;
          border: 1px solid #ffeaa7;
        }

        .bulk-controls {
          display: flex;
          gap: 15px;
          align-items: center;
        }

        .bulk-action-select, .bulk-value-input {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .bulk-apply-btn {
          padding: 8px 16px;
          background: #ffc107;
          color: #212529;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
        }

        .bulk-apply-btn:disabled {
          background: #6c757d;
          color: white;
          cursor: not-allowed;
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

        .inventory-table th.sortable {
          cursor: pointer;
          user-select: none;
        }

        .inventory-table th.sortable:hover {
          background: #e9ecef;
        }

        .inventory-table td {
          padding: 12px;
          border-bottom: 1px solid #dee2e6;
        }

        .inventory-table tr:hover {
          background: #f8f9fa;
        }

        .inventory-table tr.low-stock {
          background: #fff5f5;
        }

        .part-name {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .source-tag, .category-tag {
          background: #e9ecef;
          color: #495057;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }

        .category-tag {
          background: #d1ecf1;
          color: #0c5460;
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

        .quantity-input.low-stock-input {
          border-color: #dc3545;
          background: #fff5f5;
        }

        .low-stock-badge {
          background: #dc3545;
          color: white;
          padding: 2px 4px;
          border-radius: 3px;
          font-size: 10px;
          margin-left: 5px;
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
