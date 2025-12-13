// src/components/CartDisplay.jsx
import React, { useEffect, useState } from 'react';
import { useProducts } from '../contexts/ProductContext';

export default function CartDisplay() {
  const { 
    cart, 
    removeFromCart, 
    updateCartItemQuantity, 
    updateCartItemPriceDirect,
    getEffectivePrice 
  } = useProducts();
  
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingPrices, setEditingPrices] = useState({});
  
  const safePrice = v => typeof v === 'number' && !isNaN(v) ? v.toLocaleString() : '0';

  // 관리자 단가 변경 이벤트 리스너
  useEffect(() => {
    const handleRefresh = () => {
      setRefreshKey(prev => prev + 1);
    };

    window.addEventListener('adminPriceChanged', handleRefresh);
    window.addEventListener('systemDataRestored', handleRefresh);
    window.addEventListener('extraOptionsPriceChanged', handleRefresh);
    
    return () => {
      window.removeEventListener('adminPriceChanged', handleRefresh);
      window.removeEventListener('systemDataRestored', handleRefresh);
      window.removeEventListener('extraOptionsPriceChanged', handleRefresh);
    };
  }, []);

  // ✅ 장바구니 아이템의 실제 가격 계산
  const calculateItemPrice = (item) => {
    // 1순위: customPrice
    if (item.customPrice && item.customPrice > 0) {
      return item.customPrice * (Number(item.quantity) || 1);
    }
    
    // 2순위: BOM이 없으면 item.price 사용
    if (!item.bom || !Array.isArray(item.bom) || item.bom.length === 0) {
      return (item.price || 0) * (Number(item.quantity) || 1);
    }

    // 3순위: BOM 기반 재계산
    const bomTotalPrice = item.bom.reduce((sum, bomItem) => {
      const effectivePrice = getEffectivePrice ? 
        getEffectivePrice(bomItem) : (Number(bomItem.unitPrice) || 0);
      const quantity = Number(bomItem.quantity) || 0;
      return sum + (effectivePrice * quantity);
    }, 0);

    return bomTotalPrice;
  };

  // 아이템의 단가 계산
// ✅ 수정 (1209): 아이템의 단가 계산 - 수량 변경 시 단가 유지
  const getItemUnitPrice = (item) => {
    // 1순위: customPrice가 있으면 그대로 사용
    if (item.customPrice && item.customPrice > 0) {
      return item.customPrice;
    }
    
    // 2순위: BOM이 없으면 item.price를 단가로 사용
    if (!item.bom || !Array.isArray(item.bom) || item.bom.length === 0) {
      return item.price || 0;
    }

    // 3순위: BOM 기반 단가 계산
    // ✅ BOM의 quantity는 이미 카트 아이템 수량이 반영되어 있으므로
    // 원래 수량(1개 기준)으로 나눈 단가를 구합니다
    const bomTotalPrice = item.bom.reduce((sum, bomItem) => {
      const effectivePrice = getEffectivePrice ? getEffectivePrice(bomItem) : (Number(bomItem.unitPrice) || 0);
      const quantity = Number(bomItem.quantity) || 0;
      return sum + (effectivePrice * quantity);
    }, 0);
    
    // ✅ BOM 총액을 카트 아이템 수량으로 나누어 1개당 단가 계산
    const cartQuantity = Number(item.quantity) || 1;
    return Math.round(bomTotalPrice / cartQuantity);
  };

  // 전체 장바구니 총액
  const calculateCartTotal = () => {
    return cart.reduce((sum, item) => sum + calculateItemPrice(item), 0);
  };

  // ✅ 금액 입력 시작
  const handlePriceFocus = (itemId) => {
    const item = cart.find(i => i.id === itemId);
    if (item) {
      const unitPrice = getItemUnitPrice(item);
      setEditingPrices(prev => ({
        ...prev,
        [itemId]: String(unitPrice)
      }));
    }
  };

  // ✅ 금액 입력 중
  const handlePriceInputChange = (itemId, value) => {
    setEditingPrices(prev => ({
      ...prev,
      [itemId]: value
    }));
  };

  // ✅ 금액 입력 완료
  const handlePriceBlur = (itemId) => {
    const inputValue = editingPrices[itemId];
    if (inputValue !== undefined) {
      const numPrice = Number(inputValue);
      if (!isNaN(numPrice) && numPrice >= 0) {
        updateCartItemPriceDirect(itemId, numPrice);
      }
      // 편집 상태 제거
      setEditingPrices(prev => {
        const newState = { ...prev };
        delete newState[itemId];
        return newState;
      });
    }
  };

  // Enter 키로도 완료 가능
  const handlePriceKeyDown = (e, itemId) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  if (!cart.length) {
    return (
      <div className="cart-section mt-6">
        <h3 className="text-xl font-semibold mb-2">견적 목록</h3>
        <div>목록이 비어 있습니다.</div>
      </div>
    );
  }

  const realTimeCartTotal = calculateCartTotal();

  return (
    <div className="cart-section mt-6">
      <h3 className="text-xl font-semibold mb-3">견적 목록</h3>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            <th className="border-b p-2">항목</th>
            <th className="border-b p-2 text-center">수량</th>
            <th className="border-b p-2 text-right">단가</th>
            <th className="border-b p-2 text-right">금액</th>
            <th className="border-b p-2"></th>
          </tr>
        </thead>
        <tbody>
          {cart.map(item => {
            const itemTotalPrice = calculateItemPrice(item);
            const itemUnitPrice = getItemUnitPrice(item);
            const hasCustomPrice = item.customPrice && item.customPrice > 0;
            const isEditing = editingPrices.hasOwnProperty(item.id);
            const displayValue = isEditing ? editingPrices[item.id] : itemUnitPrice;
            
            return (
              <tr key={`${item.id}-${refreshKey}`}>
                <td className="border-b p-2">
                  {item.displayName}
                  {hasCustomPrice && (
                    <span style={{ 
                      fontSize: '11px',
                      color: '#dc3545',
                      backgroundColor: '#f8d7da',
                      padding: '2px 4px',
                      borderRadius: '3px',
                      marginLeft: '6px',
                      fontWeight: 'bold'
                    }}>
                      직접입력
                    </span>
                  )}
                </td>
                <td className="border-b p-2 text-center">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateCartItemQuantity(item.id, e.target.value)}
                      onBlur={(e) => {
                        if (e.target.value === '' || Number(e.target.value) <= 0) {
                          updateCartItemQuantity(item.id, 1);
                        }
                      }}
                      style={{ 
                        width: 64, 
                        textAlign: 'right',
                        padding: '4px 6px',
                        border: '1px solid #ddd',
                        borderRadius: '3px'
                      }}
                    />
                    <span>개</span>
                  </div>
                </td>
                <td className="border-b p-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={displayValue}
                    onFocus={() => handlePriceFocus(item.id)}
                    onChange={(e) => handlePriceInputChange(item.id, e.target.value)}
                    onBlur={() => handlePriceBlur(item.id)}
                    onKeyDown={(e) => handlePriceKeyDown(e, item.id)}
                    style={{ 
                      width: 100, 
                      textAlign: 'right',
                      padding: '4px 6px',
                      border: '1px solid #ddd',
                      borderRadius: '3px',
                      fontWeight: hasCustomPrice ? 'bold' : 'normal',
                      backgroundColor: hasCustomPrice ? '#fff3cd' : 'transparent'
                    }}
                  />
                  <span style={{ marginLeft: '4px' }}>원</span>
                </td>
                <td className="border-b p-2 text-right" style={{ fontWeight: 'bold' }}>
                  {safePrice(itemTotalPrice)}원
                </td>
                <td className="border-b p-2 text-center">
                  <button 
                    onClick={() => removeFromCart(item.id)} 
                    style={{
                      background: '#dc3545',
                      color: '#fff',
                      border: 'none',
                      padding: '4px 12px',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="p-2 font-bold" style={{ fontSize: '16px' }}>총 합계</td>
            <td className="p-2 text-right font-bold" style={{ fontSize: '16px' }}>
              {safePrice(realTimeCartTotal)}원
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
