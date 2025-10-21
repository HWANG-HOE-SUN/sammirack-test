// src/components/MaterialPriceManager.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useProducts } from '../contexts/ProductContext';
import { sortBOMByMaterialRule } from '../utils/materialSort';
import { 
  loadAllMaterials, 
  loadAdminPrices, 
  getEffectivePrice, 
  generatePartId,
  getRackOptionsUsingPart 
} from '../utils/unifiedPriceManager';
import AdminPriceEditor from './AdminPriceEditor';

function kgLabelFix(str) {
  if (!str) return '';
  return String(str).replace(/200kg/g, '270kg').replace(/350kg/g, '450kg');
}

export default function MaterialPriceManager({ currentUser, cart }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPart, setEditingPart] = useState(null);
  const [adminPrices, setAdminPrices] = useState({});
  const [allMaterials, setAllMaterials] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadAdminPricesData();
  }, [refreshKey]);

  useEffect(() => {
    loadAllMaterialsData();
  }, []);

  useEffect(() => {
    if (cart && cart.length > 0) {
      updateCurrentCartMaterials();
    }
  }, [cart]);

  useEffect(() => {
    const handlePriceChange = (event) => {
      console.log('MaterialPriceManager: 단가 변경 이벤트 수신', event.detail);
      loadAdminPricesData();
      setRefreshKey(prev => prev + 1);
    };

    const handleSystemRestore = (event) => {
      console.log('MaterialPriceManager: 시스템 데이터 복원 이벤트 수신');
      loadAdminPricesData();
      loadAllMaterialsData();
      setRefreshKey(prev => prev + 1);
    };

    window.addEventListener('adminPriceChanged', handlePriceChange);
    window.addEventListener('systemDataRestored', handleSystemRestore);
    
    return () => {
      window.removeEventListener('adminPriceChanged', handlePriceChange);
      window.removeEventListener('systemDataRestored', handleSystemRestore);
    };
  }, []);

  const loadAdminPricesData = () => {
    try {
      const priceData = loadAdminPrices();
      setAdminPrices(priceData);
    } catch (error) {
      console.error('관리자 단가 로드 실패:', error);
      setAdminPrices({});
    }
  };

  const loadAllMaterialsData = async () => {
    setIsLoading(true);
    try {
      console.log('🔄 MaterialPriceManager: 전체 원자재 로드 시작');
      const materials = await loadAllMaterials();
      setAllMaterials(materials);
      console.log(`✅ MaterialPriceManager: ${materials.length}개 원자재 로드 완료`);
      
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

  const [currentCartMaterials, setCurrentCartMaterials] = useState([]);
  
  const updateCurrentCartMaterials = () => {
    if (!cart || cart.length === 0) return;

    const bomMaterialMap = new Map();
    cart.forEach(item => {
      if (item.bom && Array.isArray(item.bom)) {
        item.bom.forEach(bomItem => {
          const partId = generatePartId(bomItem);
          if (!bomMaterialMap.has(partId)) {
            bomMaterialMap.set(partId, {
              partId,
              rackType: bomItem.rackType || '',
              name: bomItem.name || '',
              specification: bomItem.specification || '',
              unitPrice: Number(bomItem.unitPrice) || 0,
              usedInOptions: []
            });
          }
          
          const material = bomMaterialMap.get(partId);
          const optionName = `${item.selectedType} ${item.selectedOptions?.formType || ''} ${item.selectedOptions?.size || ''} ${item.selectedOptions?.height || ''} ${item.selectedOptions?.level || ''}`.trim();
          if (!material.usedInOptions.includes(optionName)) {
            material.usedInOptions.push(optionName);
          }
        });
      }
    });
    
    setCurrentCartMaterials(Array.from(bomMaterialMap.values()));
  };

  const filteredMaterials = useMemo(() => {
    let result = allMaterials;
    
    // ✅ 하이랙 안전핀 제외 (하이랙은 안전핀을 사용하지 않음)
    // ✅ 모든 랙타입의 베이스(안전좌) 제외 (더 이상 사용하지 않음)
    result = result.filter(material => {
      const materialName = material.name || '';
      
      // 하이랙 안전핀 제외
      if (material.rackType === '하이랙' && materialName.includes('안전핀')) {
        return false;
      }
      
      // 모든 베이스(안전좌) 제외
      if (materialName.includes('베이스(안전좌)')) {
        return false;
      }
      
      return true;
    });
    
    if (!searchTerm.trim()) {
      return result;
    }
  
    const searchLower = searchTerm.toLowerCase();
    return result.filter(material => {
      const nameMatch = (material.name || '').toLowerCase().includes(searchLower);
      const specMatch = (material.specification || '').toLowerCase().includes(searchLower);
      const rackTypeMatch = (material.rackType || '').toLowerCase().includes(searchLower);
      const categoryMatch = material.categoryName && material.categoryName.toLowerCase().includes(searchLower);
      return nameMatch || specMatch || rackTypeMatch || categoryMatch;
    });
  }, [allMaterials, searchTerm]);

  const getEffectiveUnitPrice = (material) => {
    const partId = material.partId || generatePartId(material);
    const adminPrice = adminPrices[partId];
    
    if (adminPrice && adminPrice.price > 0) {
      return adminPrice.price;
    }
    
    return Number(material.unitPrice) || 0;
  };
  
  // ✅ 부품명 표시 로직 - 추가옵션은 카테고리명 포함
  const getDisplayName = (material) => {
    // 디버깅 로그 추가
    if (material.source === 'extra_options') {
      console.log('추가옵션 발견:', material);
    }
    
    if (material.source === 'extra_options' && material.categoryName) {
      return `[추가옵션: ${material.categoryName}] ${material.name}`;
    }
    return material.name;
  };

  
  const handleEditPrice = (material) => {
    const usingOptions = getRackOptionsUsingPart(material.partId);
    const itemWithRackInfo = {
      ...material,
      currentPrice: getEffectiveUnitPrice(material),
      displayName: `${material.rackType} - ${material.name} ${material.specification || ''}`.trim(),
      usingOptions
    };
    setEditingPart(itemWithRackInfo);
  };

  const handlePriceSaved = (partId, newPrice, oldPrice) => {
    loadAdminPricesData();
    setRefreshKey(prev => prev + 1);
    
    console.log(`MaterialPriceManager: 부품 ${partId}의 단가가 ${oldPrice}원에서 ${newPrice}원으로 변경되었습니다.`);
    
    window.dispatchEvent(new CustomEvent('adminPriceChanged', { 
      detail: { partId, newPrice, oldPrice } 
    }));
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="material-price-manager-container" style={{ 
      marginTop: '20px',
      padding: '16px', 
      background: '#f8f9fa', 
      borderRadius: '8px',
      border: '1px solid #dee2e6',
      maxHeight: '500px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '16px',
        flexShrink: 0
      }}>
        <h3 style={{ margin: 0, color: '#495057' }}>
          💰 원자재 단가 관리
          {allMaterials.length > 0 && (
            <span style={{ fontSize: '14px', fontWeight: 'normal', marginLeft: '8px', color: '#6c757d' }}>
              (총 {allMaterials.length.toLocaleString()}개 원자재)
            </span>
          )}
        </h3>
        
        <button
          onClick={loadAllMaterialsData}
          disabled={isLoading}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            border: '1px solid #007bff',
            backgroundColor: isLoading ? '#f8f9fa' : '#007bff',
            color: isLoading ? '#6c757d' : 'white',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          {isLoading ? '🔄 로딩중...' : '🔄 새로고침'}
        </button>
      </div>

      <div style={{ marginBottom: '16px', flexShrink: 0 }}>
        <input
          type="text"
          placeholder="원자재명, 규격, 랙타입, 카테고리로 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
        {searchTerm && (
          <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>
            "{searchTerm}" 검색 결과: {filteredMaterials.length}개
          </div>
        )}
      </div>

      <div style={{ 
        flex: 1,
        overflowY: 'auto',
        overflowX: 'auto',
        border: '1px solid #dee2e6',
        borderRadius: '4px',
        backgroundColor: 'white'
      }}>
        {isLoading ? (
          <div style={{ 
            padding: '40px 20px', 
            textAlign: 'center', 
            color: '#6c757d' 
          }}>
            <div style={{ fontSize: '16px', marginBottom: '8px' }}>🔄</div>
            <div>원자재 데이터를 로드하고 있습니다...</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              BOM + Data + Extra Options 통합 처리 중
            </div>
          </div>
        ) : filteredMaterials.length > 0 ? (
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '13px'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', borderRight: '1px solid #dee2e6', width: '120px' }}>랙타입</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', borderRight: '1px solid #dee2e6', minWidth: '160px' }}>부품명</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', borderRight: '1px solid #dee2e6', width: '120px' }}>규격</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', borderRight: '1px solid #dee2e6', width: '80px' }}>기본단가</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', borderRight: '1px solid #dee2e6', width: '80px' }}>적용단가</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #dee2e6', width: '60px' }}>상태</th>
                {isAdmin && (
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '70px' }}>관리</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.map((material, index) => {
                const effectivePrice = getEffectiveUnitPrice(material);
                const isModified = adminPrices[material.partId];
                const basePrice = material.unitPrice || 0;
                
                return (
                  <tr key={material.partId || index} style={{ 
                    borderBottom: '1px solid #f1f3f4',
                    backgroundColor: index % 2 === 0 ? 'white' : '#fafbfc'
                  }}>
                    <td style={{ padding: '8px', borderRight: '1px solid #f1f3f4' }}>
                      {kgLabelFix(material.rackType)}
                    </td>
                    <td style={{ padding: '8px', borderRight: '1px solid #f1f3f4' }}>
                      {getDisplayName(material)}
                    </td>
                    <td style={{ padding: '8px', borderRight: '1px solid #f1f3f4', fontSize: '12px', color: '#666' }}>
                      {material.specification || '-'}
                    </td>
                    <td style={{ padding: '8px', borderRight: '1px solid #f1f3f4', textAlign: 'right' }}>
                      {basePrice > 0 ? (
                        <span style={{ color: '#6c757d' }}>
                          {basePrice.toLocaleString()}원
                        </span>
                      ) : (
                        <span style={{ color: '#999', fontSize: '11px' }}>미설정</span>
                      )}
                    </td>
                    <td style={{ padding: '8px', borderRight: '1px solid #f1f3f4', textAlign: 'right', fontWeight: '500' }}>
                      {effectivePrice > 0 ? (
                        <span style={{ color: isModified ? '#dc3545' : '#28a745' }}>
                          {effectivePrice.toLocaleString()}원
                        </span>
                      ) : (
                        <span style={{ color: '#6c757d' }}>미설정</span>
                      )}
                    </td>
                    <td style={{ padding: '8px', borderRight: '1px solid #f1f3f4', textAlign: 'center' }}>
                      {isModified ? (
                        <span style={{ 
                          fontSize: '11px', 
                          padding: '2px 6px', 
                          backgroundColor: '#dc3545', 
                          color: 'white', 
                          borderRadius: '3px' 
                        }}>
                          수정됨
                        </span>
                      ) : (
                        <span style={{ 
                          fontSize: '11px', 
                          color: '#6c757d' 
                        }}>
                          기본값
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleEditPrice(material)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            border: '1px solid #007bff',
                            backgroundColor: '#007bff',
                            color: 'white',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          수정
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ 
            padding: '40px 20px', 
            textAlign: 'center', 
            color: '#6c757d' 
          }}>
            {searchTerm.trim() ? (
              <>
                <div style={{ fontSize: '16px', marginBottom: '8px' }}>🔍</div>
                <div>"{searchTerm}" 검색 결과가 없습니다.</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>
                  다른 검색어를 입력해보세요.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '16px', marginBottom: '8px' }}>📦</div>
                <div>제품을 선택하면 해당 원자재 목록이 표시됩니다.</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>
                  또는 검색을 통해 전체 원자재를 확인할 수 있습니다.
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {isAdmin && filteredMaterials.length > 0 && (
        <div style={{ 
          marginTop: '16px', 
          padding: '12px', 
          backgroundColor: '#e7f3ff', 
          borderRadius: '6px',
          fontSize: '13px',
          color: '#0c5aa6',
          border: '1px solid #b8daff',
          flex: '0 0 auto'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            💡 원자재 단가 관리 안내
          </div>
          <div>• 이곳에서 수정한 단가는 전체 시스템에 적용됩니다.</div>
          <div>• "수정됨" 표시가 있는 부품은 관리자가 단가를 수정한 부품입니다.</div>
          <div>• <strong>[추가옵션: 카테고리명]</strong> 형태로 표시된 항목은 추가옵션 부품입니다.</div>
          <div>• 추가옵션 부품의 단가를 수정하면 선택 화면 가격에 즉시 반영됩니다.</div>
          <div>• 검색창에서 카테고리명으로도 검색 가능합니다.</div>
        </div>
      )}

      {editingPart && (
        <AdminPriceEditor
          item={editingPart}
          onClose={() => setEditingPart(null)}
          onSave={handlePriceSaved}
        />
      )}
    </div>
  );
}
