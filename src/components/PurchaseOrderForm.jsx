import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { exportToExcel, generateFileName } from '../utils/excelExport';
import { loadAdminPricesDirect, resolveAdminPrice } from '../utils/adminPriceHelper';
import { deductInventoryOnPrint, showInventoryResult } from './InventoryManager';
import '../styles/PurchaseOrderForm.css';
import { generatePartId, generateInventoryPartId } from '../utils/unifiedPriceManager';
import { saveDocumentSync } from '../utils/realtimeAdminSync';
import { getDocumentSettings } from '../utils/documentSettings';
import DocumentSettingsModal from './DocumentSettingsModal';
import { convertDOMToPDFBase64, base64ToBlobURL, sendFax } from '../utils/faxUtils'; // ✅ 추가
import FaxPreviewModal from './FaxPreviewModal'; // ✅ 추가

const PROVIDER = {
  bizNumber: '232-81-01750',
  companyName: '삼미앵글랙산업',
  ceo: '박이삭',
  address: '경기도 광명시 원노온사로 39, 철제 스틸하우스 1',
  homepage: 'http://www.ssmake.com',
  tel: '010-9548-9578  010-4311-7733',
  fax: '(02)2611-4595',
  stampImage: `${import.meta.env.BASE_URL}images/도장.png`
};

const PurchaseOrderForm = () => {
  const { id } = useParams();
  const location = useLocation();
  const isEditMode = !!id;

  const documentNumberInputRef = useRef(null);
  const adminPricesRef = useRef({}); // 최신 관리자 단가 캐시
  const cartInitializedRef = useRef(false);  // ← 추가
  
  // ✅ 관리자 체크
  const [isAdmin, setIsAdmin] = useState(false);
  // ✅ 설정 모달
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  // ✅ 현재 전역 설정
  const [currentGlobalSettings, setCurrentGlobalSettings] = useState(null);
  
  // ✅ FAX 관련 state 추가
  const [showFaxModal, setShowFaxModal] = useState(false);
  const [pdfBlobURL, setPdfBlobURL] = useState(null);
  const [pdfBase64, setPdfBase64] = useState(null);

  const cartData = location.state || {};
  const { 
    cart = [], 
    totalBom = [], 
    estimateData = {},
    customItems = [],          // ✅ 추가
    customMaterials = [],      // ✅ 추가
    editingDocumentId = null,  // ✅ 추가
    editingDocumentData = {}   // ✅ 추가
  } = cartData;

  const [formData, setFormData] = useState({
    date: editingDocumentData.date || estimateData.date || new Date().toISOString().split('T')[0],
    documentNumber: editingDocumentData.documentNumber || estimateData.estimateNumber || '',
    orderNumber: '',
    companyName: editingDocumentData.companyName || estimateData.companyName || '',
    bizNumber: editingDocumentData.bizNumber || estimateData.bizNumber || '',
    items: [
      { name: '', unit: '', quantity: '', unitPrice: '', totalPrice: '', note: '' }
    ],
    materials: [],
    subtotal: 0,
    tax: 0,
    totalAmount: 0,
    notes: editingDocumentData.notes || estimateData.notes || '',
    topMemo: editingDocumentData.topMemo || estimateData.topMemo || '',
    documentSettings: null  // ✅ 이 문서의 회사정보
  });

  // ✅ 관리자 체크 및 전역 설정 로드
  useEffect(() => {
    const userInfoStr = localStorage.getItem('currentUser');
    if (userInfoStr) {
      try {
        const userInfo = JSON.parse(userInfoStr);
        setIsAdmin(userInfo.role === 'admin' || userInfo.username === 'admin');
      } catch (e) {
        setIsAdmin(false);
      }
    }
    
    const globalSettings = getDocumentSettings();
    setCurrentGlobalSettings(globalSettings);
  }, []);
  
  // 기존 저장 문서 로드
  useEffect(() => {
    if (isEditMode && id) {
      const storageKey = `purchase_${id}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          
          // ✅ 원자재 검증: 비정상적인 수량 체크 (10000개 이상)
          const hasBadMaterials = (data.materials || []).some(mat => 
            Number(mat.quantity) > 10000
          );
          
          if (hasBadMaterials || !data.materials || data.materials.length === 0) {
            console.warn('⚠️ 원자재 데이터 손상 감지 - 재생성 시작');
            
            // ✅ items에서 BOM 재생성
            const allBoms = [];
            (data.items || []).forEach(item => {
              if (item.name) {
                const bom = regenerateBOMFromDisplayName(item.name, item.quantity || 1);
                
                if (bom.length === 0) {
                  // 기타 품목
                  const qty = Number(item.quantity) || 1;
                  const totalPrice = Number(item.totalPrice) || 0;
                  const unitPrice = totalPrice > 0 ? Math.round(totalPrice / qty) : 0;
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
            
            // ✅ 중복 제거 및 수량 합산
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
            
            data.materials = Array.from(bomMap.values());
            
            console.log('✅ 원자재 재생성 완료:', data.materials.length, '개');
            
            // ✅ 즉시 저장 (손상된 데이터 덮어쓰기)
            localStorage.setItem(storageKey, JSON.stringify(data));
          }
          setFormData({
              ...data,
              documentSettings: data.documentSettings || null  // ✅ 원본 설정 유지
            });
          } catch(e) {
            console.error('청구서 로드 실패:', e);
          }
      }
    }
  }, [id, isEditMode]);

  // 초기 cart / BOM 반영 (관리자 단가 재적용)
  useEffect(() => {
    if (!isEditMode && cart.length > 0 && !cartInitializedRef.current) {
      cartInitializedRef.current = true;  // ← 추가
      adminPricesRef.current = loadAdminPricesDirect();
      const cartItems = cart.map(item => {
        const qty = item.quantity || 1;
        const unitPrice = Math.round((item.price || 0) / (qty || 1));
        return {
          name: item.displayName || item.name || '',
          unit: '개',
          quantity: qty,
          unitPrice,
          totalPrice: unitPrice * qty,
          note: ''
        };
      });
  
      const allItems = [...cartItems, ...customItems];
  
      // ✅ BOM 추출: totalBom 확인 후 없으면 cart에서 직접 추출
      let bomMaterials = [];
      
      if (totalBom && totalBom.length > 0) {
        bomMaterials = totalBom.map(m => {
          const adminPrice = resolveAdminPrice(adminPricesRef.current, m);
          const appliedUnitPrice = adminPrice && adminPrice > 0
            ? adminPrice
            : (Number(m.unitPrice) || 0);
          const quantity = Number(m.quantity) || 0;
          return {
            name: m.name,
            rackType: m.rackType,
            specification: m.specification || '',
            quantity,
            unitPrice: appliedUnitPrice,
            totalPrice: appliedUnitPrice * quantity,
            note: m.note || ''
          };
        });
      } else {
        // ✅ totalBom이 없으면 cart에서 직접 BOM 추출
        cart.forEach(item => {
          if (item.bom && Array.isArray(item.bom) && item.bom.length > 0) {
            item.bom.forEach(bomItem => {
              const adminPrice = resolveAdminPrice(adminPricesRef.current, bomItem);
              const appliedUnitPrice = adminPrice && adminPrice > 0 ? adminPrice : (Number(bomItem.unitPrice) || 0);
              const quantity = Number(bomItem.quantity) || 0;
              
              bomMaterials.push({
                name: bomItem.name,
                rackType: bomItem.rackType,
                specification: bomItem.specification || '',
                quantity,
                unitPrice: appliedUnitPrice,
                totalPrice: appliedUnitPrice * quantity,
                note: bomItem.note || ''
              });
            });
          }
        });
      }

      const allMaterials = [...bomMaterials, ...customMaterials];
  
      // ✅ 수정: 강제 설정
      setFormData(prev => ({
        ...prev,
        items: allItems.length ? allItems : [{ name: '', unit: '', quantity: '', unitPrice: '', totalPrice: '', note: '' }],
        materials: allMaterials.length ? allMaterials : []
      }));
    }
  }, [cart, totalBom, customItems, customMaterials, isEditMode]);

  // ✅ 합계 계산: 무조건 품목 목록(items) 기준 (1126_1621수정)
  useEffect(() => {
    // ✅ materials가 비어있으면 실행하지 않음
    if (formData.materials.length === 0) {
      return;
    }
    
    const materialsWithAdmin = formData.materials.map(mat => {
      const adminPrice = resolveAdminPrice(adminPricesRef.current, mat);
      const quantity = Number(mat.quantity) || 0;
      const unitPrice = adminPrice && adminPrice > 0 ? adminPrice : (Number(mat.unitPrice) || 0);
      return {
        ...mat,
        unitPrice,
        totalPrice: unitPrice * quantity
      };
    });
  
    const itemSum = formData.items.reduce((s, it) => s + (parseFloat(it.totalPrice) || 0), 0);
    const subtotal = itemSum;
    const tax = Math.round(subtotal * 0.1);
    const totalAmount = subtotal + tax;
  
    setFormData(prev => {
      // ✅ 변경 없으면 같은 객체 반환
      const materialsChanged = JSON.stringify(materialsWithAdmin) !== JSON.stringify(prev.materials);
      const totalsChanged = prev.subtotal !== subtotal || prev.tax !== tax || prev.totalAmount !== totalAmount;
  
      if (!materialsChanged && !totalsChanged) {
        return prev;
      }
      return {
        ...prev,
        materials: materialsWithAdmin,
        subtotal,
        tax,
        totalAmount
      };
    });
  }, [formData.items, formData.materials]);


  // ✅ 표시용 설정
  const displaySettings = formData.documentSettings || currentGlobalSettings || PROVIDER;
  const updateFormData = (f, v) => setFormData(prev => ({ ...prev, [f]: v }));

  // 품목 편집
  const updateItem = (idx, f, v) => {
    const items = [...formData.items];
    items[idx][f] = v;
    if (f === 'quantity' || f === 'unitPrice') {
      const q = parseFloat(items[idx].quantity) || 0;
      const u = parseFloat(items[idx].unitPrice) || 0;
      items[idx].totalPrice = q * u;
    }
    setFormData(prev => ({ ...prev, items }));
  };
  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { name:'', unit:'', quantity:'', unitPrice:'', totalPrice:'', note:'' }]
    }));
  };
  const removeItem = (idx) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }));
  };

  // BOM 자재 편집 (관리자 단가 적용 유지: 사용자가 단가 직접 바꾸면 수동 단가로 덮어씀)
  const updateMaterial = (idx, f, v) => {
    const materials = [...formData.materials];
    materials[idx][f] = v;
    if (f === 'quantity' || f === 'unitPrice') {
      const q = parseFloat(materials[idx].quantity) || 0;
      const u = parseFloat(materials[idx].unitPrice) || 0;
      materials[idx].totalPrice = q * u;
    }
    setFormData(prev => ({ ...prev, materials }));
  };
  const addMaterial = () => {
    setFormData(prev => ({
      ...prev,
      materials: [...prev.materials, { name:'', specification:'', quantity:'', unitPrice:'', totalPrice:'', note:'' }]
    }));
  };
  const removeMaterial = (idx) => {
    setFormData(prev => ({
      ...prev,
      materials: prev.materials.filter((_, i) => i !== idx)
    }));
  };

  const handleSave = async () => {
    if (!formData.documentNumber.trim()) {
      alert('거래번호(문서번호)를 입력해주세요.');
      documentNumberInputRef.current?.focus();
      return;
    }
    
    // ✅ 동일 거래번호 찾기
    let itemId;
    let existingDoc = null;
    
    if (editingDocumentId) {
      // 편집 모드: 기존 ID 재사용
      itemId = editingDocumentId;
    } else if (isEditMode) {
      // 기존 편집 모드 (URL 기반)
      itemId = id;
    } else {
      // ✅ 신규 작성: 동일 거래번호 검색
      existingDoc = findDocumentByNumber(formData.documentNumber, 'purchase');
      if (existingDoc) {
        // 동일 거래번호 발견 -> 덮어쓰기 확인
        const confirmOverwrite = window.confirm(
          `거래번호 "${formData.documentNumber}"가 이미 존재합니다.\n덮어쓰시겠습니까?`
        );
        if (confirmOverwrite) {
          itemId = existingDoc.id;
        } else {
          return; // 취소
        }
      } else {
        // 새 문서
        itemId = Date.now();
      }
    }
    
    const storageKey = `purchase_${itemId}`;
    const newOrder = {
      ...formData,
      id: itemId,
      type: 'purchase',
      status: formData.status || '진행 중',
      purchaseNumber: formData.documentNumber,
      // ✅ 문서 설정: 편집=기존유지, 신규=현재전역설정
      documentSettings: (existingDoc || isEditMode || editingDocumentId) 
        ? (formData.documentSettings || currentGlobalSettings)
        : currentGlobalSettings,
      customerName: formData.companyName,
      productType: formData.items[0]?.name || '',
      quantity: formData.items.reduce((s, it) => s + (parseInt(it.quantity) || 0), 0),
      unitPrice: formData.items[0] ? (parseInt(formData.items[0].unitPrice) || 0) : 0,
      totalPrice: formData.totalAmount,
      updatedAt: new Date().toISOString(),
      ...(isEditMode ? {} : { createdAt: new Date().toISOString() })
    };
    
    // ✅ 레거시 키 저장 (하위 호환)
    localStorage.setItem(storageKey, JSON.stringify(newOrder));
    
    // ✅ 서버 동기화 저장 (필수!)
    const success = await saveDocumentSync(newOrder);
    
    if (success) {
      alert(isEditMode ? '청구서가 수정되었습니다.' : '청구서가 저장되었습니다.');
      
      // ✅ 문서 업데이트 이벤트 발생
      window.dispatchEvent(new Event('documentsupdated'));
    } else {
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleExportToExcel = () => {
    if (!formData.documentNumber.trim()) {
      alert('거래번호(문서번호)를 입력해주세요.');
      return;
    }
    exportToExcel(formData, 'purchase')
      .then(()=>alert('엑셀 파일이 다운로드되었습니다.'))
      .catch(e=>{
        console.error(e);
        alert('엑셀 다운로드 오류');
      });
  };

const handlePrint = async () => {
  if (!formData.documentNumber.trim()) {
    alert('거래번호(문서번호)를 입력해주세요.');
    documentNumberInputRef.current?.focus();
    return;
  }

  // ✅ 1단계: 재고 부족 여부 체크
  if (cart && cart.length > 0) {
    const checkResult = await checkInventoryAvailability(cart);
    
    if (checkResult.warnings && checkResult.warnings.length > 0) {
      // ✅ 재고 부족 패널 표시 (confirm 창 제거)
      window.dispatchEvent(new CustomEvent('showShortageInventoryPanel', {
        detail: {
          shortageItems: checkResult.warnings.map(w => ({
            partId: w.partId,
            name: w.name,
            specification: w.specification,
            rackType: w.rackType,
            quantity: w.required,
            requiredQuantity: w.required,
            serverInventory: w.available,
            shortage: w.shortage,
            isShortage: true
          })),
          documentType: '청구서 (인쇄)',
          timestamp: Date.now(),
          // ✅ 콜백 함수 추가
          onConfirm: () => {
            // "무시하고 인쇄" 클릭 시 실행
            proceedWithPrint();
          },
          onCancel: () => {
            alert('인쇄가 취소되었습니다.\n재고는 감소되지 않았습니다.');
          }
        }
      }));
      
      return;  // ✅ 여기서 리턴 (패널에서 선택하도록)
    }
  }

  // 재고 부족 없으면 바로 인쇄
  await proceedWithPrint();
};

// ✅ 실제 인쇄 로직 분리
const proceedWithPrint = async () => {
  // ✅ 1. 브라우저 인쇄 다이얼로그 표시
  window.print();

  // ✅ 2. 인쇄 다이얼로그가 닫힌 후 재고 감소 여부 확인
  setTimeout(async () => {
    const confirmDeduct = window.confirm(
      '인쇄가 완료되었습니까?\n\n' +
      '✅ 확인: 재고 감소 (부족한 부품은 0으로 처리)\n' +
      '❌ 취소: 재고 유지'
    );
    
    if (confirmDeduct && cart && cart.length > 0) {
      // ✅ 재고 감소 실행
      const result = await deductInventoryOnPrint(cart, '청구서', formData.documentNumber);
      
      if (result.success) {
        let message = '✅ 재고가 감소되었습니다.\n\n';
        
        // ✅ 정상 감소된 부품
        const normalParts = result.deductedParts.filter(p => !p.wasShortage);
        const shortageParts = result.deductedParts.filter(p => p.wasShortage);
        
        if (normalParts.length > 0) {
          message += `📦 정상 감소: ${normalParts.length}개 부품\n`;
        }
        
        // ✅ 부족하여 0으로 처리된 부품
        if (shortageParts.length > 0) {
          message += `⚠️ 재고 부족 (0으로 처리): ${shortageParts.length}개 부품\n\n`;
          
          // 최대 3개만 표시
          const displayParts = shortageParts.slice(0, 3);
          displayParts.forEach(p => {
            message += `  • ${p.name}: ${p.deducted}개 감소 → 재고 0\n`;
          });
          
          if (shortageParts.length > 3) {
            message += `  • 외 ${shortageParts.length - 3}개 부품...\n`;
          }
          
          message += '\n재고 관리 탭에서 부족한 부품을 확인하세요.';
        }
        
        alert(message);
      } else {
        alert(`❌ 재고 감소 실패: ${result.message}`);
      }
    } else {
      alert('재고가 감소되지 않았습니다.');
    }
  }, 500);
};

// ✅ FAX 전송 버튼 클릭 시 - 재고부터 체크 후 PDF 생성
const handleFaxPreview = async () => {
  if (!formData.documentNumber.trim()) {
    alert('거래번호(문서번호)를 입력해주세요.');
    documentNumberInputRef.current?.focus();
    return;
  }

  // ✅ 1단계: 재고 체크
  if (cart && cart.length > 0) {
    const checkResult = await checkInventoryAvailability(cart);
    
    // ✅ 전체 BOM 목록 추출 (부족 여부 상관없이 모든 BOM)
    const allBomItems = [];
    cart.forEach((item) => {
      if (item.bom && Array.isArray(item.bom) && item.bom.length > 0) {
        allBomItems.push(...item.bom);
      }
    });
    
    // ✅ 재고 부족이 있든 없든 패널 표시 (전체 BOM 현황 보여주기 위해)
    if (checkResult.warnings && checkResult.warnings.length > 0) {
      window.dispatchEvent(new CustomEvent('showShortageInventoryPanel', {
        detail: {
          shortageItems: checkResult.warnings.map(w => ({
            partId: w.partId,
            name: w.name,
            specification: w.specification,
            rackType: w.rackType,
            quantity: w.required,
            requiredQuantity: w.required,
            serverInventory: w.available,
            shortage: w.shortage,
            isShortage: true,
            colorWeight: w.colorWeight || ''
          })),
          allBomItems: allBomItems,  // ✅ 전체 BOM 추가
          documentType: '청구서 (FAX)',
          timestamp: Date.now(),
          onConfirm: () => {
            // "무시하고 진행" 클릭 시
            proceedWithFaxPreview();
          },
          onCancel: () => {
            alert('FAX 전송이 취소되었습니다.');
          }
        }
      }));
      
      return;  // ✅ 패널에서 사용자 선택 대기
    }
  }

  // 재고 부족 없으면 바로 PDF 생성
  await proceedWithFaxPreview();
};

// ✅ 실제 PDF 생성 및 FAX 모달 표시
const proceedWithFaxPreview = async () => {
  try {
    const docElement = document.querySelector('.purchase-order-form-container');
    if (!docElement) {
      alert('문서 영역을 찾을 수 없습니다.');
      return;
    }

    alert('PDF 생성 중입니다. 잠시만 기다려주세요...');

    const base64 = await convertDOMToPDFBase64(docElement);
    setPdfBase64(base64);

    const blobURL = base64ToBlobURL(base64);
    setPdfBlobURL(blobURL);

    setShowFaxModal(true);
  } catch (error) {
    console.error('❌ PDF 생성 오류:', error);
    alert(`PDF 생성에 실패했습니다.\n오류: ${error.message}`);
  }
};
 
// ✅ handleSendFax는 이제 재고 체크 없이 바로 전송만 수행
const handleSendFax = async (faxNumber) => {
  if (!pdfBase64) {
    alert('PDF가 생성되지 않았습니다.');
    return;
  }

  try {
    const result = await sendFax(
      pdfBase64,
      faxNumber,
      formData.companyName,
      ''
    );

    if (result.success) {
      alert(
        `✅ 팩스 전송이 완료되었습니다!\n\n` +
        `📄 발송번호: ${result.jobNo}\n` +
        `📑 페이지 수: ${result.pages}장\n` +
        `💰 남은 잔액: ${(result.cash || 0).toLocaleString()}원`
      );
      setShowFaxModal(false);
      
      // ✅ FAX 전송 성공 후 재고 감소
      if (cart && cart.length > 0) {
        const deductResult = await deductInventoryOnPrint(cart, '청구서(FAX)', formData.documentNumber);
        
        if (deductResult.success) {
          if (deductResult.warnings && deductResult.warnings.length > 0) {
            console.warn(`⚠️ ${deductResult.warnings.length}개 부품 재고 부족`);
          } else {
            console.log('✅ 재고가 정상적으로 감소되었습니다.');
          }
        } else {
          console.error(`❌ 재고 감소 실패: ${deductResult.message}`);
        }
      }
    } else {
      throw new Error(result.error || '알 수 없는 오류');
    }
  } catch (error) {
    console.error('❌ 팩스 전송 오류:', error);
    
    let errorMessage = '팩스 전송에 실패했습니다.\n\n';
    
    if (error.message.includes('잔액')) {
      errorMessage += `❌ ${error.message}\n\n발송닷컴 사이트에서 충전해주세요.`;
    } else if (error.message.includes('타임아웃')) {
      errorMessage += '❌ 서버 응답 시간 초과\n잠시 후 다시 시도해주세요.';
    } else if (error.message.includes('네트워크')) {
      errorMessage += '❌ 네트워크 연결 오류\n인터넷 연결을 확인해주세요.';
    } else {
      errorMessage += `오류: ${error.message}`;
    }
    
    alert(errorMessage);
  }
};

// ✅ 실제 FAX 전송 로직 분리
const proceedWithFax = async (faxNumber) => {
  try {
    const result = await sendFax(
      pdfBase64,
      faxNumber,
      formData.companyName,
      ''
    );

    if (result.success) {
      alert(
        `✅ 팩스 전송이 완료되었습니다!\n\n` +
        `📄 발송번호: ${result.jobNo}\n` +
        `📑 페이지 수: ${result.pages}장\n` +
        `💰 남은 잔액: ${(result.cash || 0).toLocaleString()}원`
      );
      setShowFaxModal(false);
      
      // ✅ FAX 전송 성공 후 재고 감소
      if (cart && cart.length > 0) {
        const deductResult = await deductInventoryOnPrint(cart, '청구서(FAX)', formData.documentNumber);
        
        if (deductResult.success) {
          if (deductResult.warnings && deductResult.warnings.length > 0) {
            console.warn(`⚠️ ${deductResult.warnings.length}개 부품 재고 부족`);
          } else {
            console.log('✅ 재고가 정상적으로 감소되었습니다.');
          }
        } else {
          console.error(`❌ 재고 감소 실패: ${deductResult.message}`);
        }
      }
    } else {
      throw new Error(result.error || '알 수 없는 오류');
    }
  } catch (error) {
    console.error('❌ 팩스 전송 오류:', error);
    
    let errorMessage = '팩스 전송에 실패했습니다.\n\n';
    
    if (error.message.includes('잔액')) {
      errorMessage += `❌ ${error.message}\n\n발송닷컴 사이트에서 충전해주세요.`;
    } else if (error.message.includes('타임아웃')) {
      errorMessage += '❌ 서버 응답 시간 초과\n잠시 후 다시 시도해주세요.';
    } else if (error.message.includes('네트워크')) {
      errorMessage += '❌ 네트워크 연결 오류\n인터넷 연결을 확인해주세요.';
    } else {
      errorMessage += `오류: ${error.message}`;
    }
    
    alert(errorMessage);
  }
};

  const handleCloseFaxModal = () => {
    setShowFaxModal(false);
    if (pdfBlobURL) {
      URL.revokeObjectURL(pdfBlobURL);
      setPdfBlobURL(null);
    }
    setPdfBase64(null);
  };

// ✅ 추가: 재고 체크만 수행하는 함수 (감소는 안 함)
const checkInventoryAvailability = async (cartItems) => {
  if (!cartItems || !Array.isArray(cartItems)) {
    return { success: true, warnings: [] };
  }
  
  try {
    const { inventoryService } = await import('../services/InventoryService');
    const serverInventory = await inventoryService.getInventory();
    
    const warnings = [];
    
    cartItems.forEach((item) => {
      if (!item.bom || !Array.isArray(item.bom) || item.bom.length === 0) {
        return;
      }
      
      item.bom.forEach((bomItem) => {
        const inventoryPartId = generateInventoryPartId({
          rackType: bomItem.rackType || '',
          name: bomItem.name || '',
          specification: bomItem.specification || '',
          colorWeight: bomItem.colorWeight || ''
        });
        
        const requiredQty = Number(bomItem.quantity) || 0;
        const currentStock = Number(serverInventory[inventoryPartId]) || 0;
        
        if (requiredQty > 0 && currentStock < requiredQty) {
          warnings.push({
            partId: inventoryPartId,
            name: bomItem.name,
            specification: bomItem.specification || '',
            rackType: bomItem.rackType || '',
            required: requiredQty,
            available: currentStock,
            shortage: requiredQty - currentStock
          });
        }
      });
    });
    
    return {
      success: true,
      warnings
    };
    
  } catch (error) {
    console.error('❌ 재고 체크 실패:', error);
    return {
      success: false,
      warnings: [],
      message: error.message
    };
  }
};

  return (
    <div className="purchase-order-form-container">
      {/* ✅ 문서 양식 수정 버튼 (관리자만) */}
      {isAdmin && (
        <button
          className="document-settings-btn no-print"
          onClick={() => setShowSettingsModal(true)}
          style={{
            position: 'fixed',
            top: '10px',
            left: '10px',
            padding: '10px 18px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            zIndex: 9999,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          ⚙️ 문서 양식 수정
        </button>
      )}
      <div className="form-header">
        <h1>청&nbsp;구&nbsp;서</h1>
      </div>

      <div className="info-table-stamp-wrapper">
        <table className="form-table info-table compact">
          <tbody>
            <tr>
              <td className="label" style={{width:110}}>거래일자</td>
              <td>
                <div style={{display:'flex', gap:'8px', alignItems:'center', width:'100%'}}>
                  <div style={{flex:'0 0 60%'}}>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={e=>updateFormData('date', e.target.value)}
                      style={{fontSize:'14px', fontWeight:600, padding:'6px 8px', width:'100%'}}
                    />
                  </div>
                  <div style={{display:'flex', flexDirection:'column', flex:'0 0 40%'}}>
                    <label style={{fontSize:'11px', fontWeight:600, marginBottom:2}}>거래번호</label>
                    <input
                      ref={documentNumberInputRef}
                      type="text"
                      value={formData.documentNumber}
                      onChange={e=>{
                        documentNumberInputRef.current?.classList.remove('invalid');
                        updateFormData('documentNumber', e.target.value);
                        updateFormData('purchaseNumber', e.target.value);
                      }}
                      placeholder=""
                      style={{padding:'6px 8px', fontSize:'18px', fontWeight:'bold', color:'#ff6600', width:'100%'}}
                    />
                  </div>
                </div>
              </td>
              <td className="label">사업자등록번호</td>
              <td>{displaySettings.bizNumber}</td>
            </tr>
            <tr>
              <td className="label">사업자등록번호</td>
              <td>
                <input
                  type="text"
                  value={formData.bizNumber}
                  onChange={e=>updateFormData('bizNumber', e.target.value)}
                  placeholder=""
                />
              </td>
              <td className="label">상호명</td>
              <td>{displaySettings.companyName}</td>
            </tr>
            <tr>
              <td className="label">상호명</td>
              <td>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={e=>updateFormData('companyName', e.target.value)}
                  placeholder="상호명 입력"
                />
              </td>
              <td className="label">대표자</td>
              <td className="rep-cell" style={{whiteSpace:'nowrap'}}>
                <span className="ceo-inline">
                  <span className="ceo-name">{displaySettings.ceo}</span>
                  {PROVIDER.stampImage && (
                    <img
                      src={PROVIDER.stampImage}
                      alt="도장"
                      className="stamp-inline"
                    />
                  )}
                </span>
              </td>
            </tr>
            <tr>
              <td className="label" rowSpan={4}>메모</td>
              <td rowSpan={4}>
                <textarea
                  className="estimate-memo memo-narrow"
                  value={formData.topMemo}
                  onChange={e=>updateFormData('topMemo', e.target.value)}
                  placeholder=""
                />
              </td>
              <td className="label">소재지</td>
              <td>{displaySettings.address}</td>
            </tr>
            <tr>
              <td className="label">TEL</td>
              <td>{displaySettings.tel}</td>
            </tr>
            <tr>
              <td className="label">홈페이지</td>
              <td>{displaySettings.website}</td>
            </tr>
            <tr>
              <td className="label">FAX</td>
              <td>{displaySettings.fax}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 품목 목록 */}
      <h3 style={{margin:'14px 0 6px', fontSize:16}}>품목 목록</h3>
      <table className="form-table order-table">
        <thead>
          <tr>
            <th style={{width:'50px'}}>NO</th>
            <th>품명</th>
            <th style={{width:'70px'}}>단위</th>
            <th style={{width:'90px'}}>수량</th>
            <th style={{width:'110px'}}>단가</th>
            <th style={{width:'120px'}}>공급가</th>
            <th style={{width:'120px'}}>비고</th>
            <th className="no-print" style={{width:'70px'}}>작업</th>
          </tr>
        </thead>
        <tbody>
          {formData.items.map((it, idx) => (
            <tr key={`item-${idx}`}>
              <td>{idx+1}</td>
              <td><input type="text" value={it.name} onChange={e=>updateItem(idx,'name',e.target.value)} placeholder="품명" /></td>
              <td><input type="text" value={it.unit} onChange={e=>updateItem(idx,'unit',e.target.value)} placeholder="단위" /></td>
              <td><input type="number" value={it.quantity} onChange={e=>updateItem(idx,'quantity',e.target.value)} placeholder="수량" /></td>
              <td><input type="number" value={it.unitPrice} onChange={e=>updateItem(idx,'unitPrice',e.target.value)} placeholder="단가" /></td>
              <td className="right">{it.totalPrice?parseInt(it.totalPrice).toLocaleString():'0'}</td>
              <td><input type="text" value={it.note} onChange={e=>updateItem(idx,'note',e.target.value)} placeholder="" /></td>
              <td className="no-print">
                <button type="button" onClick={()=>removeItem(idx)} disabled={formData.items.length===1} className="remove-btn">삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!(showFaxModal || showSettingsModal) && (
        <div className="item-controls no-print" style={{marginBottom:18}}>
          <button type="button" onClick={addMaterial} className="add-item-btn">+ 자재 추가</button>
        </div>
      )}

      {/* BOM */}
      <h3 style={{margin:'14px 0 6px', fontSize:16}}>원자재 명세서</h3>
      <table className="form-table bom-table">
        <thead>
          <tr>
            <th style={{width:'50px'}}>NO</th>
            <th style={{width:'190px'}}>부품명</th>
            <th className="spec-col">규격</th>
            <th style={{width:'70px'}}>수량</th>
            <th style={{width:'70px', display:'none'}}>단가</th>
            <th style={{width:'90px', display:'none'}}>금액</th>
            <th style={{width:'90px'}}>비고</th>
            <th className="no-print" style={{width:'70px'}}>작업</th>
          </tr>
        </thead>
        <tbody>
          {formData.materials.map((m, idx) => (
            <tr key={`mat-${idx}`}>
              <td>{idx+1}</td>
              <td><input type="text" value={m.name} onChange={e=>updateMaterial(idx,'name',e.target.value)} placeholder="부품명" /></td>
              <td className="spec-cell">
                <input
                  type="text"
                  value={m.specification}
                  onChange={e=>updateMaterial(idx,'specification',e.target.value)}
                  placeholder="규격"
                />
              </td>
              <td><input type="number" value={m.quantity} onChange={e=>updateMaterial(idx,'quantity',e.target.value)} placeholder="수량" /></td>
              <td style={{display:'none'}}><input type="number" value={m.unitPrice} onChange={e=>updateMaterial(idx,'unitPrice',e.target.value)} placeholder="단가" /></td>
              <td style={{display:'none'}} className="right">{m.totalPrice?parseInt(m.totalPrice).toLocaleString():'0'}</td>
              <td><input type="text" value={m.note} onChange={e=>updateMaterial(idx,'note',e.target.value)} placeholder="비고" /></td>
              <td className="no-print">
                <button type="button" onClick={()=>removeMaterial(idx)} className="remove-btn">삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="item-controls no-print" style={{ marginBottom: 18, display: (showFaxModal || showSettingsModal) ? 'none' : 'block' }}>
        <button type="button" onClick={addMaterial} className="add-item-btn">+ 자재 추가</button>
      </div>

      <table className="form-table total-table">
        <tbody>
          <tr><td className="label">소계</td><td className="right">{formData.subtotal.toLocaleString()}</td></tr>
          <tr><td className="label">부가세</td><td className="right">{formData.tax.toLocaleString()}</td></tr>
          <tr><td className="label"><strong>합계</strong></td><td className="right"><strong>{formData.totalAmount.toLocaleString()}</strong></td></tr>
        </tbody>
      </table>

      <div className="notes-section">
        <label>비고:</label>
        <textarea
          value={formData.notes}
          onChange={e=>updateFormData('notes', e.target.value)}
          placeholder="기타 사항을 입력하세요"
          rows={4}
        />
      </div>

      <div className="form-actions no-print" style={{ display: (showFaxModal || showSettingsModal) ? 'none' : 'flex' }}>
        <button type="button" onClick={handleSave} className="save-btn">저장하기</button>
        <button type="button" onClick={handleExportToExcel} className="excel-btn">엑셀로 저장하기</button>
        <button type="button" onClick={handlePrint} className="print-btn">인쇄하기</button>
        <button type="button" onClick={handleFaxPreview} className="fax-btn">📠 FAX 전송</button>
      </div>

      <div className="form-company">({PROVIDER.companyName})</div>
      {/* ✅ FAX 미리보기 모달 추가 */}
      {showFaxModal && (
        <FaxPreviewModal
          pdfBlobURL={pdfBlobURL}
          onClose={handleCloseFaxModal}
          onSendFax={handleSendFax}
        />
      )}
      
      {/* ✅ 문서 양식 설정 모달 */}
      <DocumentSettingsModal
        isOpen={showSettingsModal}
        onClose={() => {
          setShowSettingsModal(false);
          const globalSettings = getDocumentSettings();
          setCurrentGlobalSettings(globalSettings);
        }}
      />
    </div>
  );
};

// ✅ 파일 맨 아래, export default 바로 위에 추가
function findDocumentByNumber(docNumber, docType) {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(`${docType}_`)) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        const checkNumber = docType === 'estimate' ? data.estimateNumber :
                           docType === 'purchase' ? data.purchaseNumber :
                           data.documentNumber;
        if (checkNumber === docNumber) {
          return data;
        }
      } catch {}
    }
  }
  return null;
}

export default PurchaseOrderForm;
