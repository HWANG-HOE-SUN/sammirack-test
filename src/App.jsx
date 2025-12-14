import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';  // ✅ useLocation, useNavigate 추가
import './App.css';
import { useProducts } from './contexts/ProductContext';
import OptionSelector from './components/OptionSelector';
import CartDisplay from './components/CartDisplay';
import BOMDisplay from './components/BOMDisplay';
import MaterialPriceManager from './components/MaterialPriceManager';
import InventoryManager from './components/InventoryManager';
import PurchaseOrderForm from './components/PurchaseOrderForm';
import EstimateForm from './components/EstimateForm';
import HistoryPage from './components/HistoryPage';
import DeliveryNoteForm from './components/DeliveryNoteForm';
import PrintPage from './components/PrintPage';
import Login from './components/Login';
import PasswordChange from './components/PasswordChange';
import ShortageInventoryManager from './components/ShortageInventoryManager';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  const handleLogin = (status, userInfo = null) => {
    setIsLoggedIn(status);
    setCurrentUser(userInfo);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
  };

  const handlePasswordChange = () => {
    setShowPasswordChange(true);
  };

  const handlePasswordChangeClose = () => {
    setShowPasswordChange(false);
  };

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <nav className="main-nav">
        <div className="nav-logo"><h1>(주)삼미앵글</h1></div>
        <div className="nav-links">
          <Link to="/" className="nav-link">홈</Link>
          {currentUser?.role === 'admin' && (
            <Link to="/history" className="nav-link">문서 관리</Link>
          )}
          <Link to="/estimate/new" className="nav-link">견적서 작성</Link>
          <Link to="/purchase-order/new" className="nav-link">청구서 작성</Link>
          {currentUser?.role === 'admin' && (
            <Link to="/inventory" className="nav-link">재고관리</Link>
          )}
        </div>
        <div className="nav-user-section">
          <span className="user-info">
            {currentUser?.username} ({currentUser?.role === 'admin' ? '관리자' : '일반사용자'})
          </span>
          <button onClick={handlePasswordChange} className="nav-link">비밀번호 변경</button>
          <button onClick={handleLogout} className="nav-link">로그아웃</button>
        </div>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage currentUser={currentUser} />} />
          {currentUser?.role === 'admin' && (
            <Route path="/inventory" element={<InventoryPage currentUser={currentUser} />} />
          )}
          <Route path="/estimate/new" element={<EstimateForm />} />
          <Route path="/estimate/edit/:id" element={<EstimateForm />} />
          <Route path="/purchase-order/new" element={<PurchaseOrderForm />} />
          <Route path="/purchase-order/edit/:id" element={<PurchaseOrderForm />} />
          <Route path="/delivery-note/new" element={<DeliveryNoteForm />} />
          <Route path="/delivery-note/edit/:id" element={<DeliveryNoteForm />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/print" element={<PrintPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="app-footer"><p>© 2025 (주)삼미앵글. All rights reserved.</p></footer>
      
      {showPasswordChange && (
        <PasswordChange 
          currentUser={currentUser}
          onClose={handlePasswordChangeClose} 
        />
      )}
      
      <ShortageInventoryManager isAdmin={currentUser?.role === 'admin'} />
    </div>
  );
}

const HomePage = ({ currentUser }) => {
  const location = useLocation();  // ✅ 추가
  const navigate = useNavigate();  // ✅ 추가
  const { 
    currentPrice, currentBOM, addToCart, cart, cartBOM, cartBOMView, 
    selectedType, selectedOptions, setCart, handleExtraOptionChange  // ✅ handleExtraOptionChange 추가
  } = useProducts();
  const [showCurrentBOM, setShowCurrentBOM] = useState(true);
  const [showTotalBOM, setShowTotalBOM] = useState(true);
  const [adminPricesVersion, setAdminPricesVersion] = useState(0);
  
  // ✅ 편집 상태 확인
  const editingData = location.state || {};
  const isEditMode = !!editingData.editingDocumentId;
  
  // ✅ 편집 모드 시 cart 및 extraOptions 초기화
  useEffect(() => {
    if (isEditMode && editingData.cart) {
      setCart(editingData.cart);
      
      // ✅ cart에서 extraOptions 추출하여 복원
      const allExtraOptions = [];
      editingData.cart.forEach(item => {
        if (item.extraOptions && Array.isArray(item.extraOptions)) {
          allExtraOptions.push(...item.extraOptions);
        }
      });
      if (allExtraOptions.length > 0) {
        const uniqueExtraOptions = Array.from(new Set(allExtraOptions));
        handleExtraOptionChange(uniqueExtraOptions);
        console.log('✅ extraOptions 복원:', uniqueExtraOptions);
      }
    }
  }, [isEditMode, editingData.cart, setCart, handleExtraOptionChange]);

  const getFinalPrice = () => {
    if (!currentBOM || currentBOM.length === 0) {
      return currentPrice;
    }
    
    let hasAdminPrice = false;
    let totalPrice = 0;
    
    currentBOM.forEach(item => {
      const adminPrice = localStorage.getItem(`adminPrice_${item.id}`);
      if (adminPrice !== null && !isNaN(parseInt(adminPrice))) {
        hasAdminPrice = true;
        totalPrice += parseInt(adminPrice) * item.quantity;
      } else {
        totalPrice += (item.price || 0) * (item.quantity || 0);
      }
    });
    
    return (hasAdminPrice && totalPrice > 0) ? totalPrice : currentPrice;
  };

  useEffect(() => {
    const handleStorageChange = () => {
      setAdminPricesVersion(prev => prev + 1);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('adminPriceUpdate', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('adminPriceUpdate', handleStorageChange);
    };
  }, []);

  const finalPrice = getFinalPrice();
  const canAddItem = finalPrice > 0;
  const canProceed = cart.length > 0;

  const totalBomForDisplay = cartBOMView || [];

  const getCurrentRackOptionName = () => {
    if (!selectedType) return '';
    return [
      selectedType,
      selectedOptions.formType,
      selectedOptions.size,
      selectedOptions.height,
      selectedOptions.level,
      selectedOptions.color || ""
    ].filter(Boolean).join(" ");
  };

return (
    <div className="app-container">
      {/* ✅ 편집 모드 표시 */}
      {isEditMode && (
        <div style={{
          background: '#fff3cd',
          border: '1px solid #ffc107',
          padding: '12px 20px',
          marginBottom: '20px',
          borderRadius: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong>📝 문서 편집 모드</strong>
            <p style={{margin: '4px 0 0 0', fontSize: '14px'}}>
              거래번호: <strong>{editingData.editingDocumentData?.documentNumber}</strong> | 
              유형: {editingData.editingDocumentType === 'estimate' ? '견적서' : 
                     editingData.editingDocumentType === 'purchase' ? '청구서' : '거래명세서'}
            </p>
          </div>
          <button
            onClick={() => navigate('/history')}
            style={{
              padding: '8px 16px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            편집 취소
          </button>
        </div>
      )}
      
      <h2>랙 제품 견적</h2>
      
      <div className="main-layout">
        <div className="left-section" style={{ flex: '1', marginRight: '20px' }}>
          <div className="option-section">
            <OptionSelector />
          </div>
          
          <div className="price-section">
            <div className="price-display">
              <h3>현재 항목 예상 가격</h3>
              <p className="price">{(finalPrice > 0) ? finalPrice.toLocaleString() : currentPrice.toLocaleString()}원</p>
              {finalPrice !== currentPrice && finalPrice > 0 && (
                <p className="price-note" style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  (관리자 수정 단가 반영됨)
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="right-section" style={{ flex: '1' }}>
          <MaterialPriceManager currentUser={currentUser} cart={cart} />
        </div>
      </div>

      <div className="action-buttons" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
      </div>

      <CartDisplay />

      {canProceed && (
              <div className="action-buttons mt-4" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <Link 
                  to="/estimate/new"
                  state={{ 
                    cart, 
                    cartTotal: cart.reduce((sum, i) => sum + (i.price ?? 0), 0), 
                    totalBom: totalBomForDisplay,
                    // ✅ 편집 모드 데이터 전달
                    ...(isEditMode && editingData.editingDocumentType === 'estimate' ? {
                      customItems: editingData.customItems || [],
                      editingDocumentId: editingData.editingDocumentId,
                      editingDocumentData: editingData.editingDocumentData || {}
                    } : {})
                  }}
                  className={`create-estimate-button`}
                >
                  견적서 작성
                </Link>
                <Link 
                  to="/delivery-note/new"
                  state={{ 
                    cart, 
                    cartTotal: cart.reduce((sum, i) => sum + (i.price ?? 0), 0), 
                    totalBom: totalBomForDisplay,
                    // ✅ 편집 모드 데이터 전달
                    ...(isEditMode && editingData.editingDocumentType === 'delivery' ? {
                      customItems: editingData.customItems || [],
                      customMaterials: editingData.customMaterials || [],
                      editingDocumentId: editingData.editingDocumentId,
                      editingDocumentData: editingData.editingDocumentData || {}
                    } : {})
                  }}
                  className={`create-delivery-note-button`}
                >
                  거래명세서 작성
                </Link>
                <Link 
                  to="/purchase-order/new"
                  state={{ 
                    cart, 
                    cartTotal: cart.reduce((sum, i) => sum + (i.price ?? 0), 0), 
                    totalBom: totalBomForDisplay,
                    // ✅ 편집 모드 데이터 전달
                    ...(isEditMode && editingData.editingDocumentType === 'purchase' ? {
                      customItems: editingData.customItems || [],
                      customMaterials: editingData.customMaterials || [],
                      editingDocumentId: editingData.editingDocumentId,
                      editingDocumentData: editingData.editingDocumentData || {}
                    } : {})
                  }}
                  className={`create-order-button`}
                >
                  청구서 작성
                </Link>
              </div>
            )}
      {showTotalBOM && (
        <BOMDisplay 
          bom={totalBomForDisplay} 
          title="전체 부품 목록 (BOM)" 
          currentUser={currentUser}
          selectedRackOption={getCurrentRackOptionName()}
        />
      )}
    </div>
  );
};

const InventoryPage = ({ currentUser }) => {
  return (
    <div className="app-container">
      <h2>재고 관리</h2>
      <InventoryManager currentUser={currentUser} />
    </div>
  );
};

export default App;
