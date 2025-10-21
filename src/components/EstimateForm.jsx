import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { exportToExcel, generateFileName } from '../utils/excelExport';
import { deductInventoryOnPrint, showInventoryResult } from './InventoryManager';
import '../styles/EstimateForm.css';

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

const EstimateForm = () => {
  const { id } = useParams();
  const location = useLocation();
  const isEditMode = !!id;

  const documentNumberInputRef = useRef(null);
  const cartData = location.state || {};
  const { cart = [] } = cartData;

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    documentNumber: '',
    companyName: '',
    bizNumber: '',
    items: [
      { name: '', unit: '', quantity: '', unitPrice: '', totalPrice: '', note: '' }
    ],
    subtotal: 0,
    tax: 0,
    totalAmount: 0,
    notes: '',
    topMemo: ''
  });

  useEffect(() => {
    if (isEditMode) {
      const storageKey = `estimate_${id}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try { setFormData(JSON.parse(saved)); } catch {}
      }
    }
  }, [id, isEditMode]);

  useEffect(() => {
    if (!isEditMode && cart.length > 0) {
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
      setFormData(prev => ({ ...prev, items: cartItems.length ? cartItems : prev.items }));
    }
  }, [cart, isEditMode]);

  useEffect(() => {
    const subtotal = formData.items.reduce((s, it) => s + (parseFloat(it.totalPrice) || 0), 0);
    const tax = Math.round(subtotal * 0.1);
    const totalAmount = subtotal + tax;
    setFormData(prev => ({ ...prev, subtotal, tax, totalAmount }));
  }, [formData.items]);

  const updateFormData = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateItem = (idx, field, value) => {
    const items = [...formData.items];
    items[idx][field] = value;
    if (field === 'quantity' || field === 'unitPrice') {
      const q = parseFloat(items[idx].quantity) || 0;
      const u = parseFloat(items[idx].unitPrice) || 0;
      items[idx].totalPrice = q * u;
    }
    setFormData(prev => ({ ...prev, items }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { name: '', unit: '', quantity: '', unitPrice: '', totalPrice: '', note: '' }]
    }));
  };

  const removeItem = (idx) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }));
  };

  const handleSave = () => {
    if (!formData.documentNumber.trim()) {
      alert('거래번호(문서번호)를 입력하세요.');
      documentNumberInputRef.current?.focus();
      return;
    }
    const itemId = isEditMode ? id : Date.now();
    const storageKey = `estimate_${itemId}`;
    const newEstimate = {
      ...formData,
      id: itemId,
      type: 'estimate',
      status: formData.status || '진행 중',
      estimateNumber: formData.documentNumber,
      customerName: formData.companyName,
      productType: formData.items[0]?.name || '',
      quantity: formData.items.reduce((s, it) => s + (parseInt(it.quantity) || 0), 0),
      unitPrice: formData.items[0] ? (parseInt(formData.items[0].unitPrice) || 0) : 0,
      totalPrice: formData.totalAmount,
      updatedAt: new Date().toISOString(),
      ...(isEditMode ? {} : { createdAt: new Date().toISOString() })
    };
    localStorage.setItem(storageKey, JSON.stringify(newEstimate));
    alert(isEditMode ? '견적서가 수정되었습니다.' : '견적서가 저장되었습니다.');
  };

  const handleExportToExcel = () => {
    if (!formData.documentNumber.trim()) {
      alert('거래번호(문서번호)를 입력해주세요.');
      return;
    }
    exportToExcel(formData, 'estimate')
      .then(() => alert('엑셀 파일이 다운로드되었습니다.'))
      .catch(e => {
        console.error(e);
        alert('엑셀 다운로드 오류');
      });
  };

  const handlePrint = () => {
    if (!formData.documentNumber.trim()) {
      alert('거래번호(문서번호)를 입력해주세요.');
      documentNumberInputRef.current?.focus();
      return;
    }

    // 재고 감소 처리
    if (cart && cart.length > 0) {
      const result = deductInventoryOnPrint(cart, '견적서', formData.documentNumber);
      showInventoryResult(result, '견적서');
    }

    window.print();
  };

  return (
    <div className="estimate-form-container">
      <div className="form-header">
        <h1>견&nbsp;&nbsp;&nbsp;&nbsp;적&nbsp;&nbsp;&nbsp;&nbsp;서</h1>
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
                      }}
                      placeholder=""
                      style={{padding:'6px 8px', fontSize:'13px', width:'100%'}}
                    />
                  </div>
                </div>
              </td>
              <td className="label">사업자등록번호</td>
              <td>{PROVIDER.bizNumber}</td>
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
              <td>{PROVIDER.companyName}</td>
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
                  <span className="ceo-name">{PROVIDER.ceo}</span>
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
              <td className="memo-cell" rowSpan={4}>
                <textarea
                  className="estimate-memo memo-narrow"
                  value={formData.topMemo}
                  onChange={e=>updateFormData('topMemo', e.target.value)}
                  placeholder=""
                />
              </td>
              <td className="label">소재지</td>
              <td>{PROVIDER.address}</td>
            </tr>
            <tr>
              <td className="label">TEL</td>
              <td>{PROVIDER.tel}</td>
            </tr>
            <tr>
              <td className="label">홈페이지</td>
              <td>{PROVIDER.homepage}</td>
            </tr>
            <tr>
              <td className="label">FAX</td>
              <td>{PROVIDER.fax}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <table className="form-table quote-table">
        <thead>
          <tr>
            <th>NO</th>
            <th>품명</th>
            <th>단위</th>
            <th>수량</th>
            <th>단가</th>
            <th>공급가</th>
            <th>비고</th>
            <th className="no-print">작업</th>
          </tr>
        </thead>
        <tbody>
          {formData.items.map((it, idx) => (
            <tr key={idx}>
              <td>{idx + 1}</td>
              <td><input type="text" value={it.name} onChange={e=>updateItem(idx,'name',e.target.value)} placeholder="품명" /></td>
              <td><input type="text" value={it.unit} onChange={e=>updateItem(idx,'unit',e.target.value)} placeholder="단위" /></td>
              <td><input type="number" value={it.quantity} onChange={e=>updateItem(idx,'quantity',e.target.value)} placeholder="수량" /></td>
              <td><input type="number" value={it.unitPrice} onChange={e=>updateItem(idx,'unitPrice',e.target.value)} placeholder="단가" /></td>
              <td className="right">{it.totalPrice?parseInt(it.totalPrice).toLocaleString():'0'}</td>
              <td><input type="text" value={it.note} onChange={e=>updateItem(idx,'note',e.target.value)} placeholder="비고" /></td>
              <td className="no-print">
                <button
                  type="button"
                  onClick={()=>removeItem(idx)}
                  disabled={formData.items.length===1}
                  className="remove-btn"
                >삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="item-controls no-print">
        <button type="button" onClick={addItem} className="add-item-btn">+ 품목 추가</button>
      </div>

      <table className="form-table total-table">
        <tbody>
          <tr>
            <td className="label">소계</td>
            <td className="right">{formData.subtotal.toLocaleString()}</td>
          </tr>
            <tr>
              <td className="label">부가세</td>
              <td className="right">{formData.tax.toLocaleString()}</td>
            </tr>
            <tr>
              <td className="label"><strong>합계</strong></td>
              <td className="right"><strong>{formData.totalAmount.toLocaleString()}</strong></td>
            </tr>
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

      <div className="form-actions no-print">
        <button type="button" onClick={handleSave} className="save-btn">저장하기</button>
        <button type="button" onClick={handleExportToExcel} className="excel-btn">엑셀로 저장하기</button>
        <button type="button" onClick={handlePrint} className="print-btn">인쇄하기</button>
      </div>

      <div className="form-company">({PROVIDER.companyName})</div>
    </div>
  );
};

export default EstimateForm;
