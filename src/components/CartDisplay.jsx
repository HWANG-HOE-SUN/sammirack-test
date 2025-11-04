import React, { useEffect, useState } from 'react';
import { useProducts } from '../contexts/ProductContext';

export default function CartDisplay() {
  const { cart, removeFromCart, cartTotal, updateCartItemQuantity, getEffectivePrice } = useProducts();
  const [refreshKey, setRefreshKey] = useState(0);
  
  const safePrice = v => typeof v === 'number' && !isNaN(v) ? v.toLocaleString() : '0';

  // 관리자 단가 변경 이벤트 리스너 추가
  useEffect(() => {
    const handlePriceChange = () => {
      setRefreshKey(prev => prev + 1);
    };

    const handleSystemRestore = () => {
      setRefreshKey(prev => prev + 1);
    };

    // ✅ 추가: 추가옵션 가격 변경 이벤트 리스너
    const handleExtraOptionsPriceChange = () => {
      console.log('ProductContext: 추가옵션 가격 변경 감지, 가격 재계산 트리거');
      setAdminPricesVersion(prev => prev + 1);
    };


    window.addEventListener('adminPriceChanged', handlePriceChange);
    window.addEventListener('systemDataRestored', handleSystemRestore);
    window.addEventListener('extraOptionsPriceChanged', handleExtraOptionsPriceChange); // ✅ 추가
    
    return () => {
      window.removeEventListener('adminPriceChanged', handlePriceChange);
      window.removeEventListener('systemDataRestored', handleSystemRestore);
      window.removeEventListener('extraOptionsPriceChanged', handleExtraOptionsPriceChange); // ✅ 추가
    };
  }, []);

  // ✅ 수정된 장바구니 아이템의 실제 가격 계산 (BOM 기반)
  const calculateItemPrice = (item) => {
    if (!item.bom || !Array.isArray(item.bom) || item.bom.length === 0) {
      return (item.price || 0) * (Number(item.quantity) || 1);
    }

    // BOM 기반으로 실제 가격 계산 - 이미 전체 수량이 적용된 가격
    const bomTotalPrice = item.bom.reduce((sum, bomItem) => {
      const effectivePrice = getEffectivePrice ? 
        getEffectivePrice(bomItem) : (Number(bomItem.unitPrice) || 0);
      const quantity = Number(bomItem.quantity) || 0;
      return sum + (effectivePrice * quantity);
    }, 0);

    // ✅ 수정: BOM 가격은 이미 전체 수량이 적용되어 있으므로 그대로 반환
    return bomTotalPrice;
  };

  // 전체 장바구니 총액 계산 (실시간 반영)
  const calculateCartTotal = () => {
    return cart.reduce((sum, item) => {
      return sum + calculateItemPrice(item);
    }, 0);
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
            <th className="border-b p-2 text-right">금액</th>
            <th className="border-b p-2"></th>
          </tr>
        </thead>
        <tbody>
          {cart.map(item => {
            const itemPrice = calculateItemPrice(item);
            
            return (
              <tr key={`${item.id}-${refreshKey}`}>
                <td className="border-b p-2">{item.displayName}</td>
                <td className="border-b p-2 text-center">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      min={0}
                      value={item.quantity}
                      onChange={(e) => updateCartItemQuantity(item.id, e.target.value)}
                      onBlur={(e) => {
                        if (e.target.value === '') updateCartItemQuantity(item.id, 0);
                      }}
                      style={{ width: 64, textAlign: 'right' }}
                    />
                    <span>개</span>
                  </div>
                </td>
                <td className="border-b p-2 text-right">{safePrice(itemPrice)}원</td>
                <td className="border-b p-2 text-center">
                  <button onClick={() => removeFromCart(item.id)} className="text-red-500">
                    삭제
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="p-2 font-bold">총 합계</td>
            <td className="p-2 text-right font-bold">{safePrice(realTimeCartTotal)}원</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
