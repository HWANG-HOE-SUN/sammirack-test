import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/HistoryPage.css';
import {
  loadAllDocuments,
  loadDeletedDocuments,
  saveDocumentSync,
  deleteDocumentSync,
  restoreDocumentSync,
  permanentDeleteDocumentSync,
  forceServerSync
} from '../utils/realtimeAdminSync';
import { regenerateBOMFromDisplayName } from '../utils/bomRegeneration';
import { generatePartId } from '../utils/unifiedPriceManager';

/**
 * HistoryPage component for managing estimates, purchase orders, and delivery notes
 * Features:
 * - View history of estimates, purchase (orders), and delivery (notes)
 * - Filter by type, customer name, date range, etc.
 * - Convert estimates to orders
 * - Print documents including delivery notes
 * - Edit and delete documents including delivery notes
 * - ✅ 서버 동기화 (GitHub Gist)
 * - ✅ 삭제된 문서 목록 보기 및 복구
 * - ✅ 컬럼별 정렬 기능
 */
const HistoryPage = () => {
  const navigate = useNavigate();
  // State for history items (estimates, orders, delivery notes)
  const [historyItems, setHistoryItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  // State for filters
  const [filters, setFilters] = useState({
    documentType: 'all', // 'all', 'estimate', 'purchase', 'delivery'
    documentNumber: '',
    dateFrom: '',
    dateTo: '',
    status: 'all', // 'all', 'pending', 'completed', 'cancelled' (or Korean equivalents)
  });
  // State for selected item
  const [selectedItem, setSelectedItem] = useState(null);
  // State for view options
  const [view, setView] = useState('list'); // 'list', 'details', 'deleted'
  // ✅ 동기화 상태
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  // ✅ 삭제된 문서 목록
  const [deletedItems, setDeletedItems] = useState([]);
  // ✅ 정렬 상태
  const [sortColumn, setSortColumn] = useState('updatedAt'); // 기본: 최종수정일
  const [sortDirection, setSortDirection] = useState('desc'); // 기본: 내림차순

  // Load history on component mount
  useEffect(() => {
    loadHistory();
    
    // ✅ 문서 업데이트 이벤트 리스너
    const handleDocumentsUpdate = () => {
      console.log('📄 문서 업데이트 감지 - 목록 새로고침');
      loadHistory();
    };
    
    window.addEventListener('documentsupdated', handleDocumentsUpdate);
    
    return () => {
      window.removeEventListener('documentsupdated', handleDocumentsUpdate);
    };
  }, []);

  // Filter items whenever filters or history items change
  useEffect(() => {
    filterItems();
  }, [filters, historyItems]);

  /**
   * ✅ Load history data from synced documents
   */
  const loadHistory = useCallback(() => {
    try {
      // ✅ 서버 동기화된 문서에서 로드 (삭제되지 않은 것만)
      const syncedDocuments = loadAllDocuments(false);
      
      setHistoryItems(syncedDocuments);
      setLastSyncTime(new Date());
      
      console.log(`📄 문서 로드 완료: ${syncedDocuments.length}개`);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  }, []);

  /**
   * ✅ 삭제된 문서 로드
   */
  const loadDeletedHistory = useCallback(() => {
    try {
      const deleted = loadDeletedDocuments();
      deleted.sort((a, b) => {
        return new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0);
      });
      setDeletedItems(deleted);
      console.log(`🗑️ 삭제된 문서 로드: ${deleted.length}개`);
    } catch (error) {
      console.error('삭제된 문서 로드 실패:', error);
    }
  }, []);

  /**
   * ✅ 서버 강제 동기화
   */
  const handleForceSync = async () => {
    try {
      setIsSyncing(true);
      await forceServerSync();
      loadHistory();
      alert('서버 동기화가 완료되었습니다.');
    } catch (error) {
      console.error('동기화 실패:', error);
      alert('서버 동기화에 실패했습니다: ' + error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * ✅ 컬럼별 정렬 처리
   */
  const handleSort = (column) => {
    if (sortColumn === column) {
      // 같은 컬럼 클릭 시 방향 토글
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // 다른 컬럼 클릭 시 해당 컬럼으로 변경, 기본 내림차순
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  /**
   * ✅ 정렬된 아이템 반환
   */
  const getSortedItems = (items) => {
    const sorted = [...items].sort((a, b) => {
      let aValue, bValue;

      switch (sortColumn) {
        case 'documentType':
          aValue = a.type || '';
          bValue = b.type || '';
          break;
        case 'documentNumber':
          aValue = a.type === 'estimate' ? a.estimateNumber : 
                   a.type === 'purchase' ? a.purchaseNumber : 
                   a.documentNumber || '';
          bValue = b.type === 'estimate' ? b.estimateNumber : 
                   b.type === 'purchase' ? b.purchaseNumber : 
                   b.documentNumber || '';
          break;
        case 'date':
          aValue = new Date(a.date || 0).getTime();
          bValue = new Date(b.date || 0).getTime();
          break;
        case 'updatedAt':
          aValue = new Date(a.updatedAt || a.date || 0).getTime();
          bValue = new Date(b.updatedAt || b.date || 0).getTime();
          break;
        case 'product':
          aValue = a.productType || '';
          bValue = b.productType || '';
          break;
        case 'price':
          aValue = a.totalPrice || 0;
          bValue = b.totalPrice || 0;
          break;
        case 'status':
          aValue = a.status || '';
          bValue = b.status || '';
          break;
        default:
          aValue = new Date(a.updatedAt || a.date || 0).getTime();
          bValue = new Date(b.updatedAt || b.date || 0).getTime();
      }

      // 문자열 비교
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue, 'ko') 
          : bValue.localeCompare(aValue, 'ko');
      }

      // 숫자 비교
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return sorted;
  };

  /**
   * Apply filters to history items
   */
  const filterItems = () => {
    let filtered = [...historyItems];
    
    // Filter by document type
    if (filters.documentType !== 'all') {
      filtered = filtered.filter(item => item.type === filters.documentType);
    }
    
    // Filter by document number
    if (filters.documentNumber) {
      const searchTerm = filters.documentNumber.toLowerCase();
      filtered = filtered.filter(item => 
        (item.estimateNumber && item.estimateNumber.toLowerCase().includes(searchTerm)) ||
        (item.purchaseNumber && item.purchaseNumber.toLowerCase().includes(searchTerm)) ||
        (item.documentNumber && item.documentNumber.toLowerCase().includes(searchTerm))
      );
    }
    
    // ✅ Filter by date range (문자열 비교로 수정)
    if (filters.dateFrom) {
      filtered = filtered.filter(item => {
        if (!item.date) return false;
        const itemDateStr = item.date.split('T')[0]; // ISO 날짜에서 날짜 부분만 추출
        return itemDateStr >= filters.dateFrom;
      });
    }
    
    if (filters.dateTo) {
      filtered = filtered.filter(item => {
        if (!item.date) return false;
        const itemDateStr = item.date.split('T')[0]; // ISO 날짜에서 날짜 부분만 추출
        return itemDateStr <= filters.dateTo;
      });
    }
    
    // Filter by status
    if (filters.status !== 'all') {
      filtered = filtered.filter(item => item.status === filters.status);
    }
    
    setFilteredItems(filtered);
  };

  /**
   * Handle filter changes
   */
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  /**
   * Reset all filters
   */
  const resetFilters = () => {
    setFilters({
      documentType: 'all',
      documentNumber: '',
      dateFrom: '',
      dateTo: '',
      status: 'all'
    });
  };

  /**
   * ✅ Delete a history item (소프트 삭제)
   */
  const deleteItem = async (item) => {
    if (!item || !item.id || !item.type) return;
    
    const confirmDelete = window.confirm(
      `정말로 이 ${item.type === 'estimate' ? '견적서' : item.type === 'purchase' ? '청구서' : '거래명세서'}를 삭제하시겠습니까? 
      ${item.type === 'estimate' ? item.estimateNumber : item.type === 'purchase' ? item.purchaseNumber : item.documentNumber || ''}
      
※ 삭제된 문서는 '삭제된 문서 보기'에서 복구할 수 있습니다.`
    );
    
    if (confirmDelete) {
      try {
        // ✅ 소프트 삭제 (서버 동기화)
        const success = await deleteDocumentSync(item.id, item.type);
        
        if (success) {
          // Update state
          setHistoryItems(prev => prev.filter(i => !(i.id === item.id && i.type === item.type)));
          
          if (selectedItem && selectedItem.id === item.id && selectedItem.type === item.type) {
            setSelectedItem(null);
            setView('list');
          }
          
          console.log('✅ 문서 삭제 완료 (복구 가능)');
        } else {
          alert('문서 삭제에 실패했습니다.');
        }
      } catch (error) {
        console.error('Error deleting item:', error);
        alert('문서 삭제 중 오류가 발생했습니다.');
      }
    }
  };

  /**
   * ✅ 삭제된 문서 복구
   */
  const restoreItem = async (item) => {
    if (!item || !item.id || !item.type) return;
    
    const confirmRestore = window.confirm(
      `이 ${item.type === 'estimate' ? '견적서' : item.type === 'purchase' ? '청구서' : '거래명세서'}를 복구하시겠습니까?
      ${item.type === 'estimate' ? item.estimateNumber : item.type === 'purchase' ? item.purchaseNumber : item.documentNumber || ''}`
    );
    
    if (confirmRestore) {
      try {
        const success = await restoreDocumentSync(item.id, item.type);
        
        if (success) {
          // 삭제 목록에서 제거
          setDeletedItems(prev => prev.filter(i => !(i.id === item.id && i.type === item.type)));
          // 일반 목록 새로고침
          loadHistory();
          alert('문서가 복구되었습니다.');
        } else {
          alert('문서 복구에 실패했습니다.');
        }
      } catch (error) {
        console.error('Error restoring item:', error);
        alert('문서 복구 중 오류가 발생했습니다.');
      }
    }
  };

  /**
   * ✅ 문서 영구 삭제
   */
  const permanentDeleteItem = async (item) => {
    if (!item || !item.id || !item.type) return;
    
    const confirmDelete = window.confirm(
      `⚠️ 경고: 이 문서를 영구적으로 삭제하시겠습니까?
      
${item.type === 'estimate' ? item.estimateNumber : item.type === 'purchase' ? item.purchaseNumber : item.documentNumber || ''}

이 작업은 되돌릴 수 없습니다!`
    );
    
    if (confirmDelete) {
      try {
        const success = await permanentDeleteDocumentSync(item.id, item.type);
        
        if (success) {
          setDeletedItems(prev => prev.filter(i => !(i.id === item.id && i.type === item.type)));
          alert('문서가 영구 삭제되었습니다.');
        } else {
          alert('영구 삭제에 실패했습니다.');
        }
      } catch (error) {
        console.error('Error permanently deleting item:', error);
        alert('영구 삭제 중 오류가 발생했습니다.');
      }
    }
  };

  /**
   * Convert an estimate to an purchase
   */
  const convertToPurchase = (estimate) => {
    console.log('🔍 견적서 원본:', estimate);
    
    const cart = (estimate.items || []).map(item => ({
      name: item.name,
      displayName: item.name,
      quantity: item.quantity || 1,
      price: item.totalPrice || 0,
      unit: item.unit || '개'
    }));
    
    let totalBom = [];
    
    if (estimate.materials && estimate.materials.length > 0) {
      totalBom = estimate.materials.map(mat => ({
        name: mat.name,
        rackType: mat.rackType,
        specification: mat.specification || '',
        quantity: mat.quantity || 0,
        unitPrice: mat.unitPrice || 0,
        note: mat.note || ''
      }));
      console.log('✅ 저장된 materials 사용:', totalBom.length);
    } else {
      console.log('⚠️ materials 없음 - items에서 BOM 재생성');
      
      const allBoms = [];
      
      estimate.items.forEach(item => {
        console.log('  🔍 품목:', item.name, '수량:', item.quantity, '가격:', item.totalPrice);
        
        if (item.name) {
          const bom = regenerateBOMFromDisplayName(item.name, item.quantity || 1);
          
          if (bom.length === 0) {
            const qty = Number(item.quantity) || 1;
            const totalPrice = Number(item.totalPrice) || 0;
            const unitPrice = Number(item.unitPrice) || (totalPrice > 0 ? Math.round(totalPrice / qty) : 0);
            
            console.log('  📦 기타 품목:', item.name, '단가:', unitPrice);
            
            allBoms.push({
              rackType: '기타',
              name: item.name,
              specification: '',
              quantity: qty,
              unitPrice: unitPrice,
              totalPrice: totalPrice,
              note: '기타 품목'
            });
          } else {
            allBoms.push(...bom);
          }
        }
      });
      
      const bomMap = new Map();
      allBoms.forEach(item => {
        const key = generatePartId(item);
        
        if (bomMap.has(key)) {
          const existing = bomMap.get(key);
          bomMap.set(key, {
            ...existing,
            quantity: existing.quantity + (item.quantity || 0),
            totalPrice: existing.totalPrice + (item.totalPrice || 0)
          });
        } else {
          bomMap.set(key, { ...item });
        }
      });
      
      totalBom = Array.from(bomMap.values());
      console.log('✅ 중복 제거 후:', totalBom.length, '개');
    }
    
    // ✅ 메타정보 전달
    const estimateData = {
      estimateNumber: estimate.estimateNumber || estimate.documentNumber || '',
      companyName: estimate.customerName || estimate.companyName || '',
      bizNumber: estimate.bizNumber || '',
      contactInfo: estimate.contactInfo || '',
      notes: estimate.notes || '',
      topMemo: estimate.topMemo || ''
    };
    
    console.log('📋 청구서 생성:', { cart, totalBom, estimateData });
    
    navigate(`/purchase-order/new`, { state: { cart, totalBom, estimateData } });
  };
    
  /**
   * Edit an existing item - 홈 화면으로 이동하여 cart 기반 편집
   */
  const editItem = (item) => {
    if (!item || !item.type) return;
    
    console.log('📝 문서 편집 시작:', item);
    
    // items를 cart로 변환 + 시스템에 없는 항목 분리
    const cart = [];
    const customItems = [];
    
    (item.items || []).forEach(itemData => {
      if (!itemData.name) return;
      
      // BOM 재생성 시도
      const bom = regenerateBOMFromDisplayName(itemData.name, itemData.quantity || 1);
      
      if (bom.length > 0) {
        // 시스템 품목 -> cart에 추가
        const qty = Number(itemData.quantity) || 1;
        const totalPrice = Number(itemData.totalPrice) || 0;
        
        cart.push({
          id: `edit_${Date.now()}_${Math.random()}`,
          name: itemData.name,
          displayName: itemData.name,
          quantity: qty,
          price: totalPrice,
          unit: itemData.unit || '개',
          bom: bom,
          // ✅ 저장된 문서에서 extraOptions 복원 (item.cart에서 가져옴)
          extraOptions: [] // 기본값 (item.cart에서 복원)
        });
      } else {
        // 직접 추가 품목 -> customItems에 보관
        customItems.push({ ...itemData });
      }
    });
    
    // materials도 처리 (청구서용)
    const customMaterials = [];
    if (item.materials && Array.isArray(item.materials)) {
      item.materials.forEach(mat => {
        // materials는 대부분 시스템 자재이지만, 사용자가 직접 추가한 것도 있을 수 있음
        // Part ID 생성 불가능한 것들은 customMaterials로 보관
        try {
          const partId = generatePartId(mat);
          if (!partId || partId === 'unknown') {
            customMaterials.push({ ...mat });
          }
        } catch {
          customMaterials.push({ ...mat });
        }
      });
    }
    
    console.log('🛒 Cart 변환:', cart.length, '개');
    console.log('📦 Custom Items:', customItems.length, '개');
    console.log('🔧 Custom Materials:', customMaterials.length, '개');
    
    // ✅ 저장된 문서에서 cart 복원 (extraOptions 포함)
    // item.cart가 있으면 그대로 사용, 없으면 위에서 생성한 cart 사용
    let finalCart = cart;
    if (item.cart && Array.isArray(item.cart) && item.cart.length > 0) {
      // 저장된 cart 사용 (extraOptions 포함)
      finalCart = item.cart;
      console.log('✅ 저장된 cart 사용 (extraOptions 포함):', finalCart.length, '개');
    } else {
      console.log('⚠️ 저장된 cart 없음 - 재생성한 cart 사용:', finalCart.length, '개');
    }
    
    // 홈 화면으로 이동 (타입별로 다른 route)
    const editingData = {
      cart: finalCart, // ✅ 저장된 cart 또는 재생성한 cart 사용
      customItems,
      customMaterials,
      editingDocumentId: item.id,
      editingDocumentType: item.type,
      editingDocumentData: {
        documentNumber: item.type === 'estimate' ? item.estimateNumber : 
                        item.type === 'purchase' ? item.purchaseNumber : 
                        item.documentNumber,
        companyName: item.customerName || item.companyName,
        bizNumber: item.bizNumber,
        contactInfo: item.contactInfo,
        notes: item.notes,
        topMemo: item.topMemo,
        date: item.date,
        status: item.status
      }
    };
    
    // 홈 화면으로 이동
    navigate('/', { state: editingData });
  };

  /**
   * Print an item
   */
  const printItem = (item) => {
    if (!item || !item.type) return;

    // 현재 페이지에서 직접 인쇄하는 방식으로 변경
    const printWindow = window.open('', '_blank');
    const printData = item;
    let printHTML = '';

    if (item.type === 'estimate') {
      // 견적서 인쇄용 HTML
      printHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>견적서</title>
          <style>
            @media print {
              body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
              .print-header { text-align: center; margin-bottom: 30px; }
              .print-header h1 { font-size: 24px; margin: 0; }
              .info-table, .quote-table, .total-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              .info-table td, .quote-table th, .quote-table td, .total-table td { border: 1px solid #000; padding: 8px; }
              .quote-table th { background-color: #f0f0f0; text-align: center; }
              .right { text-align: right; }
              .label { background-color: #f8f9fa; font-weight: bold; }
              .notes-section { margin-top: 20px; }
              .form-company { text-align: center; margin-top: 30px; font-weight: bold; }
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1>견&nbsp;&nbsp;&nbsp;&nbsp;적&nbsp;&nbsp;&nbsp;&nbsp;서</h1>
            <div>거래번호: ${printData.estimateNumber || printData.documentNumber || ''}</div>
          </div>

          <table class="info-table">
            <tbody>
              <tr>
                <td class="label">견적일자</td>
                <td>${printData.date}</td>
                <td class="label">사업자등록번호</td>
                <td>232-81-01750</td>
              </tr>
              <tr>
                <td class="label">상호명</td>
                <td>${printData.customerName || printData.companyName || ''}</td>
                <td class="label">상호</td>
                <td>삼미앵글랙산업</td>
              </tr>
              <tr>
                <td colspan="2" rowspan="4" style="text-align: center; font-weight: bold; vertical-align: middle; padding: 16px 0; background: #f8f9fa;">
                  아래와 같이 견적합니다 (부가세, 운임비 별도)
                </td>
                <td class="label">대표자</td>
                <td>박이삭</td>
              </tr>
              <tr>
                <td class="label">소재지</td>
                <td>경기도 광명시 원노온사로 39, 철제 스틸하우스 1</td>
              </tr>
              <tr>
                <td class="label">TEL</td>
                <td>(02)2611-4597</td>
              </tr>
              <tr>
                <td class="label">FAX</td>
                <td>(02)2611-4595</td>
              </tr>
              <tr>
                <td class="label">홈페이지</td>
                <td>http://www.ssmake.com</td>
              </tr>
            </tbody>
          </table>

          <table class="quote-table">
            <thead>
              <tr>
                <th>NO</th>
                <th>품명</th>
                <th>단위</th>
                <th>수량</th>
                <th>단가</th>
                <th>공급가</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              ${(printData.items || []).map((item, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${item.name || ''}</td>
                  <td>${item.unit || ''}</td>
                  <td>${item.quantity || ''}</td>
                  <td>${parseInt(item.unitPrice || 0).toLocaleString()}</td>
                  <td class="right">${parseInt(item.totalPrice || 0).toLocaleString()}</td>
                  <td>${item.note || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <table class="total-table">
            <tbody>
              <tr>
                <td class="label">소계</td>
                <td class="right">${(printData.subtotal || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td class="label">부가세</td>
                <td class="right">${(printData.tax || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td class="label"><strong>합계</strong></td>
                <td class="right"><strong>${(printData.totalAmount || printData.totalPrice || 0).toLocaleString()}</strong></td>
              </tr>
            </tbody>
          </table>

          ${printData.notes ? `
            <div class="notes-section">
              <strong>비고:</strong><br>
              ${printData.notes.replace(/\n/g, '<br>')}
            </div>
          ` : ''}

          <div class="form-company">(주)삼미앵글랙산업</div>
        </body>
        </html>
      `;
    } else if (item.type === 'delivery') {
      // 거래명세서 인쇄용 HTML (견적서와 디자인 동일)
      printHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>거래명세서</title>
          <style>
            @media print {
              body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
              .print-header { text-align: center; margin-bottom: 30px; }
              .print-header h1 { font-size: 24px; margin: 0; }
              .info-table, .quote-table, .total-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              .info-table td, .quote-table th, .quote-table td, .total-table td { border: 1px solid #000; padding: 8px; }
              .quote-table th { background-color: #f0f0f0; text-align: center; }
              .right { text-align: right; }
              .label { background-color: #f8f9fa; font-weight: bold; }
              .notes-section { margin-top: 20px; }
              .form-company { text-align: center; margin-top: 30px; font-weight: bold; }
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1>거&nbsp;&nbsp;래&nbsp;&nbsp;명&nbsp;&nbsp;세&nbsp;&nbsp;서</h1>
            <div>거래번호: ${printData.estimateNumber || printData.documentNumber || ''}</div>
          </div>

          <table class="info-table">
            <tbody>
              <tr>
                <td class="label">견적일자</td>
                <td>${printData.date}</td>
                <td class="label">사업자등록번호</td>
                <td>232-81-01750</td>
              </tr>
              <tr>
                <td class="label">상호명</td>
                <td>${printData.customerName || printData.companyName || ''}</td>
                <td class="label">상호</td>
                <td>삼미앵글랙산업</td>
              </tr>
              <tr>
                <td colspan="2" rowspan="4" style="text-align: center; font-weight: bold; vertical-align: middle; padding: 16px 0; background: #f8f9fa;">
                  아래와 같이 견적합니다 (부가세, 운임비 별도)
                </td>
                <td class="label">대표자</td>
                <td>박이삭</td>
              </tr>
              <tr>
                <td class="label">소재지</td>
                <td>경기도 광명시 원노온사로 39, 철제 스틸하우스 1</td>
              </tr>
              <tr>
                <td class="label">TEL</td>
                <td>(02)2611-4597</td>
              </tr>
              <tr>
                <td class="label">FAX</td>
                <td>(02)2611-4595</td>
              </tr>
              <tr>
                <td class="label">홈페이지</td>
                <td>http://www.ssmake.com</td>
              </tr>
            </tbody>
          </table>

          <table class="quote-table">
            <thead>
              <tr>
                <th>NO</th>
                <th>품명</th>
                <th>단위</th>
                <th>수량</th>
                <th>단가</th>
                <th>공급가</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              ${(printData.items || []).map((item, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${item.name || ''}</td>
                  <td>${item.unit || ''}</td>
                  <td>${item.quantity || ''}</td>
                  <td>${parseInt(item.unitPrice || 0).toLocaleString()}</td>
                  <td class="right">${parseInt(item.totalPrice || 0).toLocaleString()}</td>
                  <td>${item.note || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <table class="total-table">
            <tbody>
              <tr>
                <td class="label">소계</td>
                <td class="right">${(printData.subtotal || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td class="label">부가세</td>
                <td class="right">${(printData.tax || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td class="label"><strong>합계</strong></td>
                <td class="right"><strong>${(printData.totalAmount || printData.totalPrice || 0).toLocaleString()}</strong></td>
              </tr>
            </tbody>
          </table>

          ${printData.notes ? `
            <div class="notes-section">
              <strong>비고:</strong><br>
              ${printData.notes.replace(/\n/g, '<br>')}
            </div>
          ` : ''}

          <div class="form-company">(주)삼미앵글랙산업</div>
        </body>
        </html>
      `;
    } else if (item.type === 'purchase') {
      // 청구서 인쇄용 HTML
      printHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>청구서</title>
          <style>
            @media print {
              body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
              .print-header { text-align: center; margin-bottom: 30px; }
              .print-header h1 { font-size: 24px; margin: 0; }
              .info-table, .order-table, .material-table, .total-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              .info-table td, .order-table th, .order-table td, .material-table th, .material-table td, .total-table td { border: 1px solid #000; padding: 8px; }
              .order-table th, .material-table th { background-color: #f0f0f0; text-align: center; }
              .right { text-align: right; }
              .label { background-color: #f8f9fa; font-weight: bold; }
              .section-title { margin-top: 30px; margin-bottom: 10px; font-size: 18px; font-weight: bold; }
              .notes-section { margin-top: 20px; }
              .form-company { text-align: center; margin-top: 30px; font-weight: bold; }
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1>청&nbsp;&nbsp;&nbsp;&nbsp;구&nbsp;&nbsp;&nbsp;&nbsp;서</h1>
            <div>거래번호: ${printData.purchaseNumber || ''}</div>
          </div>

          <table class="info-table">
            <tbody>
              <tr>
                <td class="label">거래일자</td>
                <td>${printData.date}</td>
                <td class="label">거래번호</td>
                <td>${printData.purchaseNumber || ''}</td>
              </tr>
              <tr>
                <td class="label">상호명</td>
                <td>${printData.customerName || printData.companyName || ''}</td>
                <td class="label">상호</td>
                <td>삼미앵글랙산업</td>
              </tr>
              <tr>
                <td colspan="2" rowspan="4" style="text-align: center; font-weight: bold; vertical-align: middle; padding: 18px 0; background: #f8f9fa;">
                  아래와 같이 청구합니다 (부가세, 운임비 별도)
                </td>
                <td class="label">대표자</td>
                <td>박이삭</td>
              </tr>
              <tr>
                <td class="label">소재지</td>
                <td>경기도 광명시 원노온사로 39, 철제 스틸하우스 1</td>
              </tr>
              <tr>
                <td class="label">TEL</td>
                <td>(02)2611-4597</td>
              </tr>
              <tr>
                <td class="label">FAX</td>
                <td>(02)2611-4595</td>
              </tr>
              <tr>
                <td class="label">홈페이지</td>
                <td>http://www.ssmake.com</td>
              </tr>
            </tbody>
          </table>

          <h3 class="section-title">청구 명세</h3>
          <table class="order-table">
            <thead>
              <tr>
                <th>NO</th>
                <th>품명</th>
                <th>단위</th>
                <th>수량</th>
                <th>단가</th>
                <th>공급가</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              ${(printData.items || []).map((item, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${item.name || ''}</td>
                  <td>${item.unit || ''}</td>
                  <td>${item.quantity || ''}</td>
                  <td>${parseInt(item.unitPrice || 0).toLocaleString()}</td>
                  <td class="right">${parseInt(item.totalPrice || 0).toLocaleString()}</td>
                  <td>${item.note || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${(printData.materials && printData.materials.length > 0) ? `
            <h3 class="section-title">원자재 명세서</h3>
            <table class="material-table">
              <thead>
                <tr>
                  <th>NO</th>
                  <th>부품명</th>
                  <th>규격/설명</th>
                  <th>수량</th>
                  <th>단가</th>
                  <th>금액</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                ${printData.materials.map((material, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${material.name || ''}</td>
                    <td>${material.specification || ''}</td>
                    <td>${material.quantity || ''}</td>
                    <td>${parseInt(material.unitPrice || 0).toLocaleString()}</td>
                    <td class="right">${parseInt(material.totalPrice || 0).toLocaleString()}</td>
                    <td>${material.note || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}

          <table class="total-table">
            <tbody>
              <tr>
                <td class="label">소계</td>
                <td class="right">${(printData.subtotal || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td class="label">부가세</td>
                <td class="right">${(printData.tax || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td class="label"><strong>합계</strong></td>
                <td class="right"><strong>${(printData.totalAmount || printData.totalPrice || 0).toLocaleString()}</strong></td>
              </tr>
            </tbody>
          </table>

          ${printData.notes ? `
            <div class="notes-section">
              <strong>비고:</strong><br>
              ${printData.notes.replace(/\n/g, '<br>')}
            </div>
          ` : ''}

          <div class="form-company">(주)삼미앵글랙산업</div>
        </body>
        </html>
      `;
    }

    printWindow.document.write(printHTML);

    printWindow.document.close();

    // 인쇄 실행
    printWindow.onload = function() {
      printWindow.print();
      printWindow.close();
    };
  };

  /**
   * Get status badge CSS class
   */
  const getStatusClass = (status) => {
    switch (status) {
      case '진행 중':
      case '처리 중':
        return 'status-processing';
      case '완료':
        return 'status-completed';
      case '취소':
        return 'status-cancelled';
      default:
        return 'status-pending';
    }
  };

  /**
   * ✅ Update item status (서버 동기화)
   */
  const updateStatus = async (item, newStatus) => {
    if (!item || !item.id || !item.type) return;
    
    try {
      // Update item
      const updatedItem = {
        ...item,
        status: newStatus,
        updatedAt: new Date().toISOString()
      };
      
      // ✅ 서버 동기화 저장
      const success = await saveDocumentSync(updatedItem);
      
      if (success) {
        // Update state
        setHistoryItems(prev => prev.map(i => {
          if (i.id === item.id && i.type === item.type) {
            return updatedItem;
          }
          return i;
        }));
        
        if (selectedItem && selectedItem.id === item.id && selectedItem.type === item.type) {
          setSelectedItem(updatedItem);
        }
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('상태 업데이트에 실패했습니다.');
    }
  };

  /**
   * Format date for display
   */
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    } catch {
      return dateString;
    }
  };

  /**
   * ✅ Format datetime for display
   */
  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    } catch {
      return dateString;
    }
  };

  /**
   * ✅ 정렬 아이콘 표시
   */
  const renderSortIcon = (column) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  /**
   * Render item details view
   */
  const renderItemDetails = () => {
    if (!selectedItem) return null;
    
    const isEstimate = selectedItem.type === 'estimate';
    
    return (
      <div className="item-details">
        <div className="details-header">
          <h2>
            {isEstimate ? '견적서' : selectedItem.type === 'purchase' ? '청구서' : '거래명세서'} 상세정보 
            <span className={`status-badge ${getStatusClass(selectedItem.status)}`}>
              {selectedItem.status || '진행 중'}
            </span>
          </h2>
          <button className="back-button" onClick={() => setView('list')}>목록으로</button>
        </div>
        
        <div className="details-content">
          <div className="details-section">
            <h3>기본 정보</h3>
            <div className="details-grid">
              <div className="details-item">
                <strong>
                  {isEstimate ? '거래번호' : selectedItem.type === 'purchase' ? '주문번호' : '거래명세서 번호'}:
                </strong>
                <span>
                  {isEstimate ? selectedItem.estimateNumber : selectedItem.type === 'purchase' ? selectedItem.purchaseNumber : selectedItem.documentNumber || ''}
                </span>
              </div>
              <div className="details-item">
                <strong>날짜:</strong>
                <span>{formatDate(selectedItem.date)}</span>
              </div>
              <div className="details-item">
                <strong>고객명:</strong>
                <span>{selectedItem.customerName}</span>
              </div>
              <div className="details-item">
                <strong>연락처:</strong>
                <span>{selectedItem.contactInfo}</span>
              </div>
              {/* ✅ 생성자 정보 표시 */}
              {selectedItem.createdBy && (
                <div className="details-item">
                  <strong>생성자:</strong>
                  <span className="creator-info">{selectedItem.createdBy}</span>
                </div>
              )}
              {/* ✅ 동기화 시간 표시 */}
              {selectedItem.syncedAt && (
                <div className="details-item">
                  <strong>마지막 동기화:</strong>
                  <span>{formatDateTime(selectedItem.syncedAt)}</span>
                </div>
              )}
              {!isEstimate && selectedItem.estimateNumber && selectedItem.type !== 'delivery' && (
                <div className="details-item">
                  <strong>관련 거래번호:</strong>
                  <span>{selectedItem.estimateNumber}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="details-section">
            <h3>제품 정보</h3>
            <div className="details-grid">
              <div className="details-item">
                <strong>제품 유형:</strong>
                <span>{selectedItem.productType}</span>
              </div>
              {selectedItem.selectedOptions && Object.entries(selectedItem.selectedOptions).map(([key, value]) => (
                <div className="details-item" key={key}>
                  <strong>
                    {key === 'size' ? '규격' : 
                    key === 'height' ? '높이' : 
                    key === 'level' ? '단수' : 
                    key === 'color' ? '색상' : key}:
                  </strong>
                  <span>{value}</span>
                </div>
              ))}
              <div className="details-item">
                <strong>수량:</strong>
                <span>{selectedItem.quantity}</span>
              </div>
              <div className="details-item">
                <strong>단가:</strong>
                <span>{selectedItem.unitPrice?.toLocaleString()}원</span>
              </div>
              <div className="details-item">
                <strong>총액:</strong>
                <span>{selectedItem.totalPrice?.toLocaleString()}원</span>
              </div>
            </div>
          </div>
          
          {selectedItem.type === 'purchase' && (
            <div className="details-section">
              <h3>배송 정보</h3>
              <div className="details-grid">
                <div className="details-item">
                  <strong>배송 예정일:</strong>
                  <span>{formatDate(selectedItem.deliveryDate) || '미정'}</span>
                </div>
                <div className="details-item full-width">
                  <strong>배송지:</strong>
                  <span>{selectedItem.deliveryAddress || ''}</span>
                </div>
                <div className="details-item full-width">
                  <strong>결제 조건:</strong>
                  <span>{selectedItem.paymentTerms || '계약금 50%, 잔금 50% (출고 전)'}</span>
                </div>
              </div>
            </div>
          )}
          
          <div className="details-section">
            <h3>상태 관리</h3>
            <div className="status-buttons">
              <button 
                className={`status-button ${selectedItem.status === '진행 중' ? 'active' : ''}`}
                onClick={() => updateStatus(selectedItem, '진행 중')}
              >
                진행 중
              </button>
              <button 
                className={`status-button ${selectedItem.status === '처리 중' ? 'active' : ''}`}
                onClick={() => updateStatus(selectedItem, '처리 중')}
              >
                처리 중
              </button>
              <button 
                className={`status-button ${selectedItem.status === '완료' ? 'active' : ''}`}
                onClick={() => updateStatus(selectedItem, '완료')}
              >
                완료
              </button>
              <button 
                className={`status-button ${selectedItem.status === '취소' ? 'active' : ''}`}
                onClick={() => updateStatus(selectedItem, '취소')}
              >
                취소
              </button>
            </div>
          </div>
          
          <div className="details-section">
            <h3>문서 작업</h3>
            <div className="action-buttons">
              <button onClick={() => editItem(selectedItem)}>
                편집
              </button>
              <button onClick={() => printItem(selectedItem)}>
                인쇄
              </button>
              {isEstimate && (
                <button onClick={() => convertToPurchase(selectedItem)}>
                  청구서 생성
                </button>
              )}
              <button className="delete-button" onClick={() => deleteItem(selectedItem)}>
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /**
   * ✅ Render deleted items list
   */
  const renderDeletedItemsList = () => (
    <div className="deleted-items-section">
      <div className="deleted-header">
        <h2>🗑️ 삭제된 문서 목록</h2>
        <button className="back-button" onClick={() => {
          setView('list');
          setDeletedItems([]);
        }}>
          ← 문서 목록으로
        </button>
      </div>
      
      {deletedItems.length === 0 ? (
        <div className="no-items">
          <p>삭제된 문서가 없습니다.</p>
        </div>
      ) : (
        <div className="history-list">
          <div className="list-header">
            <div className="header-cell document-type">유형</div>
            <div className="header-cell document-id">거래번호</div>
            <div className="header-cell date">삭제일</div>
            <div className="header-cell customer">삭제자</div>
            <div className="header-cell product">제품</div>
            <div className="header-cell price">금액</div>
            <div className="header-cell actions">작업</div>
          </div>
          
          {deletedItems.map((item) => (
            <div 
              key={`deleted_${item.type}_${item.id}`}
              className="list-item deleted-item"
            >
              <div className="item-cell document-type">
                {item.type === 'estimate' ? '견적서' : item.type === 'purchase' ? '청구서' : '거래명세서'}
              </div>
              <div className="item-cell document-id">
                {item.type === 'estimate' ? item.estimateNumber : item.type === 'purchase' ? item.purchaseNumber : item.documentNumber || ''}
              </div>
              <div className="item-cell date">
                {formatDateTime(item.deletedAt)}
              </div>
              <div className="item-cell customer">
                {item.deletedBy || '-'}
              </div>
              <div className="item-cell product">
                {item.productType}
              </div>
              <div className="item-cell price">
                {item.totalPrice?.toLocaleString()}원
              </div>
              <div className="item-cell actions">
                <button 
                  title="복구" 
                  className="restore-button"
                  onClick={() => restoreItem(item)}
                >
                  ♻️ 복구
                </button>
                <button 
                  title="영구 삭제" 
                  className="permanent-delete-button"
                  onClick={() => permanentDeleteItem(item)}
                >
                  🔥 영구삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /**
   * Render list of history items
   */
  const renderItemsList = () => {
    const sortedItems = getSortedItems(filteredItems);
    
    return (
      <div className="history-list">
        <div className="list-header">
          <div className="header-cell document-type sortable" onClick={() => handleSort('documentType')}>
            유형{renderSortIcon('documentType')}
          </div>
          <div className="header-cell document-id sortable" onClick={() => handleSort('documentNumber')}>
            거래번호{renderSortIcon('documentNumber')}
          </div>
          <div className="header-cell date sortable" onClick={() => handleSort('date')}>
            날짜{renderSortIcon('date')}
          </div>
          <div className="header-cell updated-date sortable" onClick={() => handleSort('updatedAt')}>
            최종 수정{renderSortIcon('updatedAt')}
          </div>
          <div className="header-cell product sortable" onClick={() => handleSort('product')}>
            제품{renderSortIcon('product')}
          </div>
          <div className="header-cell price sortable" onClick={() => handleSort('price')}>
            금액{renderSortIcon('price')}
          </div>
          <div className="header-cell status sortable" onClick={() => handleSort('status')}>
            상태{renderSortIcon('status')}
          </div>
          <div className="header-cell actions">작업</div>
        </div>
        
        {sortedItems.length === 0 ? (
          <div className="no-items">
            <p>표시할 항목이 없습니다.</p>
          </div>
        ) : (
          sortedItems.map((item) => (
            <div 
              key={`${item.type}_${item.id}`}
              className="list-item"
              onClick={() => {
                setSelectedItem(item);
                setView('details');
              }}
            >
              <div className="item-cell document-type">
                {item.type === 'estimate' ? '견적서' : item.type === 'purchase' ? '청구서' : '거래명세서'}
              </div>
              <div className="item-cell document-id">
                {item.type === 'estimate' ? item.estimateNumber : item.type === 'purchase' ? item.purchaseNumber : item.documentNumber || ''}
              </div>
              <div className="item-cell date">
                {formatDate(item.date)}
              </div>
              <div className="item-cell updated-date">
                {item.updatedAt ? formatDateTime(item.updatedAt) : '-'}
              </div>
              <div className="item-cell product">
                {item.productType}
              </div>
              <div className="item-cell price">
                {item.totalPrice?.toLocaleString()}원
              </div>
              <div className="item-cell status">
                <span className={`status-badge ${getStatusClass(item.status)}`}>
                  {item.status || '진행 중'}
                </span>
              </div>
              <div className="item-cell actions" onClick={(e) => e.stopPropagation()}>
                <button title="편집" onClick={(e) => { e.stopPropagation(); editItem(item); }}>
                  ✏️
                </button>
                <button title="인쇄" onClick={(e) => { e.stopPropagation(); printItem(item); }}>
                  🖨️
                </button>
                {item.type === 'estimate' && (
                  <button 
                    title="청구서 생성" 
                    onClick={(e) => { e.stopPropagation(); convertToPurchase(item); }}
                  >
                    📋
                  </button>
                )}
                <button 
                  title="삭제" 
                  className="delete-icon"
                  onClick={(e) => { e.stopPropagation(); deleteItem(item); }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div className="history-page" style={{ padding: '20px 5%' }}>
      {view === 'list' && (
        <>
          <div className="page-header">
            <h2>문서 관리</h2>
            {/* ✅ 동기화 상태 표시 */}
            <div className="sync-status">
              {lastSyncTime && (
                <span className="last-sync">
                  마지막 동기화: {formatDateTime(lastSyncTime)}
                </span>
              )}
              <button 
                className="sync-button"
                onClick={handleForceSync}
                disabled={isSyncing}
              >
                {isSyncing ? '동기화 중...' : '🔄 서버 동기화'}
              </button>
            </div>
          </div>
          
          <div className="filters-section">
            <div className="filters-container" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              alignItems: 'end'
            }}>
              <div className="filter-group">
                <label>문서 유형:</label>
                <select 
                  name="documentType" 
                  value={filters.documentType} 
                  onChange={handleFilterChange}
                  style={{width: '100%'}}
                >
                  <option value="all">전체</option>
                  <option value="estimate">견적서</option>
                  <option value="purchase">청구서</option>
                  <option value="delivery">거래명세서</option>
                </select>
              </div>
              
              <div className="filter-group">
                <label>거래번호:</label>
                <input
                  type="text"
                  name="documentNumber"
                  placeholder="거래번호 검색"
                  value={filters.documentNumber}
                  onChange={handleFilterChange}
                  className="filter-input"
                  style={{width: '100%'}}
                />
              </div>
              
              <div className="filter-group" style={{gridColumn: 'span 2'}}>
                <label>날짜 범위:</label>
                <div className="date-range" style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                  <input 
                    type="date"
                    name="dateFrom"
                    value={filters.dateFrom}
                    onChange={handleFilterChange}
                    style={{flex: 1}}
                  />
                  <span>~</span>
                  <input 
                    type="date"
                    name="dateTo"
                    value={filters.dateTo}
                    onChange={handleFilterChange}
                    style={{flex: 1}}
                  />
                </div>
              </div>
              
              <div className="filter-group">
                <label>상태:</label>
                <select 
                  name="status" 
                  value={filters.status} 
                  onChange={handleFilterChange}
                  style={{width: '100%'}}
                >
                  <option value="all">전체</option>
                  <option value="진행 중">진행 중</option>
                  <option value="처리 중">처리 중</option>
                  <option value="완료">완료</option>
                  <option value="취소">취소</option>
                </select>
              </div>
              
              <button 
                className="reset-filters" 
                onClick={resetFilters}
                style={{
                  padding: '8px 16px',
                  height: 'fit-content'
                }}
              >
                필터 초기화
              </button>
            </div>
          </div>
          
          <div className="action-buttons top-actions">
            <button onClick={() => navigate('/estimate/new')}>
              새 견적서 작성
            </button>
            <button onClick={() => navigate('/purchase-order/new')}>
              새 청구서 작성
            </button>
            {/* ✅ 삭제된 문서 보기 버튼 */}
            <button 
              className="deleted-docs-button"
              onClick={() => {
                loadDeletedHistory();
                setView('deleted');
              }}
            >
              🗑️ 삭제된 문서 보기
            </button>
          </div>
          
          {renderItemsList()}
        </>
      )}
      
      {view === 'details' && renderItemDetails()}
      
      {/* ✅ 삭제된 문서 목록 뷰 */}
      {view === 'deleted' && renderDeletedItemsList()}
    </div>
  );
};

export default HistoryPage;
