// src/components/InventoryManager.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { sortBOMByMaterialRule } from '../utils/materialSort';
import { loadAllMaterials, generatePartId, generateRackOptionId } from '../utils/unifiedPriceManager';

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


// 부품명에서 주요 타입 추출 (필터링용)
const extractPartType = (name) => {
  if (!name) return '기타';
  const cleanName = name.toLowerCase();
  
  if (cleanName.includes('기둥')) return '기둥';
  if (cleanName.includes('로드빔')) return '로드빔';  
  if (cleanName.includes('타이빔')) return '타이빔';
  if (cleanName.includes('철판')) return '철판';
  if (cleanName.includes('선반')) return '선반';
  if (cleanName.includes('브레싱')) return '브레싱';
  if (cleanName.includes('앙카볼트')) return '앙카볼트';
  if (cleanName.includes('안전핀')) return '안전핀';
  if (cleanName.includes('볼트')) return '볼트';
  if (cleanName.includes('고무')) return '고무';
  if (cleanName.includes('합판')) return '합판';
  if (cleanName.includes('바퀴')) return '바퀴';
  
  return '기타';
};

// 규격에서 주요 치수 추출 (필터링용)
const extractSizeCategory = (specification) => {
  if (!specification) return '기타';
  const cleanSpec = specification.toLowerCase();
  
  // 높이 기준 (H로 시작하는 숫자)
  const heightMatch = cleanSpec.match(/h?(\d{3,4})/);
  if (heightMatch) {
    const height = parseInt(heightMatch[1]);
    if (height >= 2000) return 'H2000+';
    if (height >= 1500) return 'H1500+';
    if (height >= 1000) return 'H1000+';
    if (height >= 500) return 'H500+';
    return `H${height}`;
  }
  
  // WxD 규격
  const wdMatch = cleanSpec.match(/(\d{3,4})[x×](\d{3,4})/);
  if (wdMatch) {
    const w = parseInt(wdMatch[1]);
    const d = parseInt(wdMatch[2]);
    if (w >= 2000) return 'W2000+';
    if (w >= 1500) return 'W1500+';
    if (w >= 1000) return 'W1000+';
    return `W${w}급`;
  }
  
  // 단순 숫자 (로드빔 길이 등)
  const numMatch = cleanSpec.match(/(\d{3,4})/);
  if (numMatch) {
    const num = parseInt(numMatch[1]);
    if (num >= 2000) return '2000+';
    if (num >= 1500) return '1500+';
    if (num >= 1000) return '1000+';
    return `${num}급`;
  }
  
  return '기타';
};

export default function InventoryManager({ currentUser }) {
  const [allMaterials, setAllMaterials] = useState([]);
  const [inventory, setInventory] = useState({});
  const [selectedRackType, setSelectedRackType] = useState('');
  const [selectedPartType, setSelectedPartType] = useState('');
  const [selectedSizeCategory, setSelectedSizeCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPart, setEditingPart] = useState(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [rackOptions, setRackOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [undoStack, setUndoStack] = useState([]); // 실행 취소용 스택
  const [selectedItems, setSelectedItems] = useState([]); // 체크박스 선택된 항목들
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
    loadInventory();
    loadRackOptions();
  }, []);

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

  // 재고 데이터 로드
  const loadInventory = () => {
    try {
      const stored = localStorage.getItem('inventory_data') || '{}';
      const data = JSON.parse(stored);
      setInventory(data);
      console.log(`📦 재고 데이터 로드: ${Object.keys(data).length}개 항목`);
    } catch (error) {
      console.error('❌ 재고 데이터 로드 실패:', error);
      setInventory({});
    }
  };

  // 재고 수량 변경 저장
  const saveInventory = (newInventory) => {
    try {
      localStorage.setItem('inventory_data', JSON.stringify(newInventory));
      setInventory(newInventory);
      console.log('✅ 재고 데이터 저장 완료');
    } catch (error) {
      console.error('❌ 재고 데이터 저장 실패:', error);
    }
  };

  // 실행취소 스택에 변경사항 추가
  const addToUndoStack = (action, partId, oldValue, newValue) => {
    const undoAction = {
      timestamp: Date.now(),
      action,
      partId,
      oldValue,
      newValue
    };
    
    setUndoStack(prev => {
      const newStack = [undoAction, ...prev];
      return newStack.slice(0, 10); // 최근 10개만 유지
    });
  };

  // 실행취소 실행
  const undoLastAction = () => {
    if (undoStack.length === 0) return;
    
    const lastAction = undoStack[0];
    const newInventory = { ...inventory };
    
    if (lastAction.action === 'quantity_change') {
      newInventory[lastAction.partId] = lastAction.oldValue;
    } else if (lastAction.action === 'bulk_change') {
      // 일괄 변경의 경우 이전 값들로 복원
      Object.keys(lastAction.oldValue).forEach(partId => {
        newInventory[partId] = lastAction.oldValue[partId];
      });
    }
    
    saveInventory(newInventory);
    setUndoStack(prev => prev.slice(1));
    
    console.log('↶ 실행취소 완료:', lastAction.action);
  };

  // 재고 수량 변경
  const updateInventory = (partId, newQuantity) => {
    const oldQuantity = inventory[partId] || 0;
    const newInv = { ...inventory, [partId]: Number(newQuantity) };
    
    addToUndoStack('quantity_change', partId, oldQuantity, Number(newQuantity));
    saveInventory(newInv);
  };

  // 재고 증감 조정
  const adjustInventory = (partId, adjustment) => {
    const currentQty = inventory[partId] || 0;
    const newQty = Math.max(0, currentQty + adjustment);
    updateInventory(partId, newQty);
  };

  // 모든 재고 삭제
  const clearAllInventory = () => {
    if (confirm('정말로 모든 재고를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      const oldInventory = { ...inventory };
      addToUndoStack('bulk_change', 'all', oldInventory, {});
      saveInventory({});
      setSelectedItems([]);
    }
  };

  // 체크박스 전체 선택/해제
  const toggleSelectAll = () => {
    if (selectedItems.length === filteredMaterials.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredMaterials.map(m => m.partId));
    }
  };

  // 개별 체크박스 토글
  const toggleSelectItem = (partId) => {
    if (selectedItems.includes(partId)) {
      setSelectedItems(prev => prev.filter(id => id !== partId));
    } else {
      setSelectedItems(prev => [...prev, partId]);
    }
  };

  // 일괄 작업 실행
  const executeBulkAction = () => {
    if (selectedItems.length === 0) {
      alert('선택된 항목이 없습니다.');
      return;
    }

    if (!bulkAction || bulkValue === '') {
      alert('작업 종류와 값을 선택해주세요.');
      return;
    }

    const oldInventory = { ...inventory };
    const newInventory = { ...inventory };
    const value = parseInt(bulkValue);

    selectedItems.forEach(partId => {
      const currentQty = inventory[partId] || 0;
      let newQty;

      switch (bulkAction) {
        case 'set':
          newQty = value;
          break;
        case 'add':
          newQty = currentQty + value;
          break;
        case 'subtract':
          newQty = Math.max(0, currentQty - value);
          break;
        default:
          return;
      }

      newInventory[partId] = newQty;
    });

    addToUndoStack('bulk_change', 'multiple', oldInventory, newInventory);
    saveInventory(newInventory);
    setSelectedItems([]);
    setBulkAction('');
    setBulkValue('');

    alert(`${selectedItems.length}개 항목에 일괄 작업이 적용되었습니다.`);
  };

  // 필터링된 원자재 목록
  const filteredMaterials = useMemo(() => {
    let filtered = allMaterials;

    // 랙타입 필터
    if (selectedRackType) {
      filtered = filtered.filter(m => m.rackType === selectedRackType);
    }

    // 부품타입 필터
    if (selectedPartType) {
      filtered = filtered.filter(m => extractPartType(m.name) === selectedPartType);
    }

    // 규격 카테고리 필터
    if (selectedSizeCategory) {
      filtered = filtered.filter(m => extractSizeCategory(m.specification) === selectedSizeCategory);
    }

    // 검색어 필터
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(material => {
        const name = kgLabelFix(material.name || '').toLowerCase();
        const spec = kgLabelFix(material.specification || '').toLowerCase();
        const rackType = (material.rackType || '').toLowerCase();
        return name.includes(term) || spec.includes(term) || rackType.includes(term);
      });
    }

    return filtered.sort((a, b) => {
      // 랙타입 -> 부품명 -> 규격 순으로 정렬
      if (a.rackType !== b.rackType) {
        return (a.rackType || '').localeCompare(b.rackType || '');
      }
      if (a.name !== b.name) {
        return (a.name || '').localeCompare(b.name || '');
      }
      return (a.specification || '').localeCompare(b.specification || '');
    });
  }, [allMaterials, selectedRackType, selectedPartType, selectedSizeCategory, searchTerm]);

  // 필터 옵션 생성
  const filterOptions = useMemo(() => {
    const rackTypes = [...new Set(allMaterials.map(m => m.rackType).filter(Boolean))].sort();
    const partTypes = [...new Set(allMaterials.map(m => extractPartType(m.name)).filter(Boolean))].sort();
    const sizeCategories = [...new Set(allMaterials.map(m => extractSizeCategory(m.specification)).filter(Boolean))].sort();
    
    return { rackTypes, partTypes, sizeCategories };
  }, [allMaterials]);

  // 재고 통계
  const inventoryStats = useMemo(() => {
    const stats = {};
    
    filteredMaterials.forEach(material => {
      const rackType = material.rackType || '기타';
      if (!stats[rackType]) {
        stats[rackType] = { count: 0, totalQty: 0 };
      }
      stats[rackType].count++;
      stats[rackType].totalQty += inventory[material.partId] || 0;
    });
    
    return stats;
  }, [filteredMaterials, inventory]);

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ 
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ margin: 0, color: '#495057' }}>📦 재고 관리</h2>
          <p style={{ margin: '4px 0 0 0', color: '#6c757d', fontSize: '14px' }}>
            총 {allMaterials.length}개 원자재 | 필터링됨 {filteredMaterials.length}개
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={loadAllMaterialsData}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              border: '1px solid #007bff',
              backgroundColor: isLoading ? '#f8f9fa' : '#007bff',
              color: isLoading ? '#6c757d' : 'white',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? '🔄 로딩중...' : '🔄 새로고침'}
          </button>
          
          <button
            onClick={undoLastAction}
            disabled={undoStack.length === 0}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              border: '1px solid #28a745',
              backgroundColor: undoStack.length === 0 ? '#f8f9fa' : '#28a745',
              color: undoStack.length === 0 ? '#6c757d' : 'white',
              borderRadius: '4px',
              cursor: undoStack.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            ↶ 실행취소
          </button>
          
          <button
            onClick={clearAllInventory}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              border: '1px solid #dc3545',
              backgroundColor: '#dc3545',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            🗑️ 모두삭제
          </button>
        </div>
      </div>

      {/* 재고 통계 */}
      {Object.keys(inventoryStats).length > 0 && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '16px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#495057' }}>📊 재고 현황</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {Object.entries(inventoryStats).map(([rackType, stats]) => (
              <div key={rackType} style={{
                padding: '8px 12px',
                backgroundColor: 'white',
                borderRadius: '6px',
                border: '1px solid #dee2e6',
                minWidth: '120px'
              }}>
                <div style={{ fontSize: '12px', color: '#6c757d' }}>{rackType}</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '2px' }}>
                  {stats.count}종 / {stats.totalQty.toLocaleString()}개
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 필터 영역 */}
      <div style={{ 
        marginBottom: '20px', 
        padding: '16px', 
        backgroundColor: '#ffffff', 
        borderRadius: '8px',
        border: '1px solid #dee2e6'
      }}>
        {/* 첫 번째 줄: 랙타입 필터 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#495057' }}>
            🏷️ 랙종류:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              onClick={() => setSelectedRackType('')}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                border: '1px solid #dee2e6',
                backgroundColor: selectedRackType === '' ? '#007bff' : '#f8f9fa',
                color: selectedRackType === '' ? 'white' : '#495057',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              전체 ({allMaterials.length})
            </button>
            {filterOptions.rackTypes.map(rackType => {
              const count = allMaterials.filter(m => m.rackType === rackType).length;
              return (
                <button
                  key={rackType}
                  onClick={() => setSelectedRackType(rackType)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    border: '1px solid #dee2e6',
                    backgroundColor: selectedRackType === rackType ? '#007bff' : '#f8f9fa',
                    color: selectedRackType === rackType ? 'white' : '#495057',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {rackType} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* 두 번째 줄: 부품타입 필터 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#495057' }}>
            🔧 부품명:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              onClick={() => setSelectedPartType('')}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                border: '1px solid #dee2e6',
                backgroundColor: selectedPartType === '' ? '#28a745' : '#f8f9fa',
                color: selectedPartType === '' ? 'white' : '#495057',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              전체
            </button>
            {filterOptions.partTypes.map(partType => {
              const count = (selectedRackType ? 
                allMaterials.filter(m => m.rackType === selectedRackType && extractPartType(m.name) === partType) :
                allMaterials.filter(m => extractPartType(m.name) === partType)
              ).length;
              
              if (count === 0) return null;
              
              return (
                <button
                  key={partType}
                  onClick={() => setSelectedPartType(partType)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    border: '1px solid #dee2e6',
                    backgroundColor: selectedPartType === partType ? '#28a745' : '#f8f9fa',
                    color: selectedPartType === partType ? 'white' : '#495057',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {partType} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* 세 번째 줄: 규격 카테고리 필터 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#495057' }}>
            📏 규격:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              onClick={() => setSelectedSizeCategory('')}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                border: '1px solid #dee2e6',
                backgroundColor: selectedSizeCategory === '' ? '#ffc107' : '#f8f9fa',
                color: selectedSizeCategory === '' ? 'white' : '#495057',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              전체
            </button>
            {filterOptions.sizeCategories.map(sizeCategory => {
              let baseFilter = allMaterials;
              if (selectedRackType) {
                baseFilter = baseFilter.filter(m => m.rackType === selectedRackType);
              }
              if (selectedPartType) {
                baseFilter = baseFilter.filter(m => extractPartType(m.name) === selectedPartType);
              }
              
              const count = baseFilter.filter(m => extractSizeCategory(m.specification) === sizeCategory).length;
              if (count === 0) return null;
              
              return (
                <button
                  key={sizeCategory}
                  onClick={() => setSelectedSizeCategory(sizeCategory)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    border: '1px solid #dee2e6',
                    backgroundColor: selectedSizeCategory === sizeCategory ? '#ffc107' : '#f8f9fa',
                    color: selectedSizeCategory === sizeCategory ? 'white' : '#495057',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {sizeCategory} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* 네 번째 줄: 검색창 */}
        <div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#495057' }}>
            🔍 검색:
          </div>
          <input
            type="text"
            placeholder="부품명, 규격으로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '300px',
              padding: '8px 12px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
        </div>
      </div>

      {/* 일괄 작업 영역 */}
      {selectedItems.length > 0 && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '16px', 
          backgroundColor: '#e7f3ff', 
          borderRadius: '8px',
          border: '1px solid #b8daff'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#0c5aa6' }}>
            ✅ {selectedItems.length}개 항목 선택됨 - 일괄 작업
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #ced4da' }}
            >
              <option value="">작업 선택</option>
              <option value="set">설정 (값으로 설정)</option>
              <option value="add">증가 (+값)</option>
              <option value="subtract">감소 (-값)</option>
            </select>
            
            <input
              type="number"
              min="0"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              placeholder="값 입력"
              style={{ 
                padding: '6px 8px', 
                width: '100px', 
                borderRadius: '4px', 
                border: '1px solid #ced4da' 
              }}
            />
            
            <button
              onClick={executeBulkAction}
              disabled={!bulkAction || bulkValue === ''}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: '1px solid #0c5aa6',
                backgroundColor: (!bulkAction || bulkValue === '') ? '#f8f9fa' : '#0c5aa6',
                color: (!bulkAction || bulkValue === '') ? '#6c757d' : 'white',
                borderRadius: '4px',
                cursor: (!bulkAction || bulkValue === '') ? 'not-allowed' : 'pointer'
              }}
            >
              실행
            </button>

            <button
              onClick={() => setSelectedItems([])}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: '1px solid #6c757d',
                backgroundColor: '#6c757d',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              선택해제
            </button>
          </div>
        </div>
      )}

      {/* 재고 테이블 */}
      <div style={{ 
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #dee2e6',
        overflow: 'hidden'
      }}>
        {isLoading ? (
          <div style={{ 
            padding: '60px 20px', 
            textAlign: 'center', 
            color: '#6c757d' 
          }}>
            <div style={{ fontSize: '20px', marginBottom: '12px' }}>🔄</div>
            <div style={{ fontSize: '16px', marginBottom: '8px' }}>원자재 데이터를 로드하고 있습니다...</div>
            <div style={{ fontSize: '14px' }}>
              BOM + Data + Extra Options 통합 처리 중
            </div>
          </div>
        ) : filteredMaterials.length > 0 ? (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '600px' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontSize: '14px'
            }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 10 }}>
                <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                  <th style={{ padding: '12px 8px', textAlign: 'center', borderRight: '1px solid #dee2e6', width: '50px' }}>
                    <input
                      type="checkbox"
                      checked={selectedItems.length === filteredMaterials.length && filteredMaterials.length > 0}
                      onChange={toggleSelectAll}
                      style={{ transform: 'scale(1.2)' }}
                    />
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', borderRight: '1px solid #dee2e6', width: '100px' }}>랙종류</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', borderRight: '1px solid #dee2e6', width: '200px' }}>부품명</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', borderRight: '1px solid #dee2e6', width: '120px' }}>규격</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', borderRight: '1px solid #dee2e6', width: '120px' }}>현재재고</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', borderRight: '1px solid #dee2e6', width: '200px' }}>빠른조정</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', width: '100px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map((material, index) => {
                  const currentStock = inventory[material.partId] || 0;
                  const isEditing = editingPart === material.partId;
                  const isSelected = selectedItems.includes(material.partId);
                  
                  return (
                    <tr key={material.partId || index} style={{ 
                      borderBottom: '1px solid #f1f3f4',
                      backgroundColor: isSelected ? '#fff3cd' : (index % 2 === 0 ? '#ffffff' : '#f8f9fa')
                    }}>
                      {/* 체크박스 */}
                      <td style={{ padding: '8px', textAlign: 'center', borderRight: '1px solid #f1f3f4' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectItem(material.partId)}
                          style={{ transform: 'scale(1.1)' }}
                        />
                      </td>
                      
                      {/* 랙타입 */}
                      <td style={{ 
                        padding: '8px', 
                        borderRight: '1px solid #f1f3f4',
                        fontSize: '12px',
                        color: '#6c757d'
                      }}>
                        {material.rackType || '미분류'}
                      </td>
                      
                      {/* 부품명 */}
                      <td style={{ 
                        padding: '8px', 
                        borderRight: '1px solid #f1f3f4',
                        fontWeight: '500',
                        color: '#495057'
                      }}>
                        {kgLabelFix(material.name) || '이름없음'}
                      </td>
                      
                      {/* 규격 */}
                      <td style={{ 
                        padding: '8px', 
                        borderRight: '1px solid #f1f3f4',
                        fontSize: '13px',
                        color: '#6c757d'
                      }}>
                        {material.specification || '-'}
                      </td>
                      
                      {/* 현재재고 */}
                      <td style={{ 
                        padding: '8px', 
                        textAlign: 'center', 
                        borderRight: '1px solid #f1f3f4'
                      }}>
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editQuantity}
                            onChange={(e) => setEditQuantity(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateInventory(material.partId, editQuantity);
                                setEditingPart(null);
                              } else if (e.key === 'Escape') {
                                setEditingPart(null);
                              }
                            }}
                            style={{
                              width: '80px',
                              padding: '4px 6px',
                              fontSize: '14px',
                              border: '2px solid #007bff',
                              borderRadius: '4px',
                              textAlign: 'center'
                            }}
                            autoFocus
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditingPart(material.partId);
                              setEditQuantity(currentStock.toString());
                            }}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: 'bold',
                              backgroundColor: currentStock === 0 ? '#dc3545' : 
                                             currentStock < 100 ? '#ffc107' : '#28a745',
                              color: 'white',
                              display: 'inline-block',
                              minWidth: '50px'
                            }}
                          >
                            {currentStock.toLocaleString()}개
                          </span>
                        )}
                      </td>
                      
                      {/* 빠른조정 */}
                      <td style={{ 
                        padding: '8px', 
                        textAlign: 'center', 
                        borderRight: '1px solid #f1f3f4'
                      }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button
                            onClick={() => adjustInventory(material.partId, -100)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              border: '1px solid #dc3545',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              borderRadius: '3px',
                              cursor: 'pointer'
                            }}
                          >
                            -100
                          </button>
                          <button
                            onClick={() => adjustInventory(material.partId, -50)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              border: '1px solid #ffc107',
                              backgroundColor: '#ffc107',
                              color: 'white',
                              borderRadius: '3px',
                              cursor: 'pointer'
                            }}
                          >
                            -50
                          </button>
                          <button
                            onClick={() => adjustInventory(material.partId, 50)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              border: '1px solid #28a745',
                              backgroundColor: '#28a745',
                              color: 'white',
                              borderRadius: '3px',
                              cursor: 'pointer'
                            }}
                          >
                            +50
                          </button>
                          <button
                            onClick={() => adjustInventory(material.partId, 100)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              border: '1px solid #17a2b8',
                              backgroundColor: '#17a2b8',
                              color: 'white',
                              borderRadius: '3px',
                              cursor: 'pointer'
                            }}
                          >
                            +100
                          </button>
                        </div>
                      </td>
                      
                      {/* 관리 */}
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button
                          onClick={() => updateInventory(material.partId, 0)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            border: '1px solid #6c757d',
                            backgroundColor: '#6c757d',
                            color: 'white',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          초기화
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ 
            padding: '60px 20px', 
            textAlign: 'center', 
            color: '#6c757d' 
          }}>
            <div style={{ fontSize: '20px', marginBottom: '12px' }}>📋</div>
            <div style={{ fontSize: '16px', marginBottom: '8px' }}>
              {allMaterials.length === 0 ? '원자재 데이터가 없습니다.' : '조건에 맞는 원자재가 없습니다.'}
            </div>
            <div style={{ fontSize: '14px' }}>
              {searchTerm || selectedRackType || selectedPartType || selectedSizeCategory ? 
                '필터 조건을 확인해주세요.' : 
                '새로고침 버튼을 눌러 데이터를 다시 로드해보세요.'}
            </div>
          </div>
        )}
      </div>

      {/* 하단 안내 정보 */}
      {filteredMaterials.length > 0 && (
        <div style={{ 
          marginTop: '20px', 
          padding: '16px', 
          backgroundColor: '#e7f3ff', 
          borderRadius: '8px',
          border: '1px solid #b8daff',
          fontSize: '14px',
          color: '#0c5aa6'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
            💡 재고 관리 사용법
          </div>
          <div>• <strong>필터 버튼</strong>으로 랙종류, 부품명, 규격별로 원자재를 분류할 수 있습니다</div>
          <div>• <strong>체크박스</strong>로 여러 항목을 선택한 후 일괄 재고 설정이 가능합니다</div>
          <div>• <strong>현재재고 클릭</strong>하여 직접 수량을 입력할 수 있습니다</div>
          <div>• <strong>빠른조정 버튼</strong>으로 재고를 쉽게 증감할 수 있습니다 (+50, +100, -50, -100)</div>
          <div>• <strong>실행취소</strong> 버튼으로 최근 작업을 되돌릴 수 있습니다</div>
          <div>• 재고 현황: <span style={{color: '#28a745'}}>충분(100개 이상)</span>, <span style={{color: '#ffc107'}}>부족(1-99개)</span>, <span style={{color: '#dc3545'}}>없음(0개)</span></div>
        </div>
      )}
    </div>
  );
}
