import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { exportToExcel } from '../utils/excelExport';
import { loadAdminPricesDirect, resolveAdminPrice } from '../utils/adminPriceHelper';
import { deductInventoryOnPrint, showInventoryResult } from './InventoryManager';
import '../styles/PurchaseOrderForm.css';

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

const DeliveryNoteForm = () => {
  const { id } = useParams();
  const location = useLocation();
  const isEditMode = !!id;
  const documentNumberInputRef = useRef(null);

  const cartData = location.state || {};
  const { cart = [], totalBom = [] } = cartData;

  const adminPricesRef = useRef({});

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    documentNumber: '',
    orderNumber: '',
    companyName: '',
    bizNumber: '',
    items: [
      { name: '', unit: '', quantity: '', unitPrice: '', totalPrice: '', note: '' }
    ],
    materials: [],
    subtotal: 0,
    tax: 0,
    totalAmount: 0,
    notes: '',
    topMemo: ''
  });

  // 관리자 단가 로드
  useEffect(() => {
    adminPricesRef.current = loadAdminPricesDirect();
  }, []);

  // 기존 저장 데이터 로드
  useEffect(() => {
    if (isEditMode && id) {
      const storageKey = `delivery_note_${id}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try { setFormData(JSON.parse(saved)); } catch {}
      }
    }
  }, [id, isEditMode]);

  // 초기 cart / BOM 반영
  useEffect(() => {
    if (!isEditMode && cart.length) {
      adminPricesRef.current = loadAdminPricesDirect();
      const cartItems = cart.map(item => {
        const qty = item.quantity || 1;
        const unitPrice = Math.round((item.price || 0)/(qty || 1));
        return {
          name: item.displayName || item.name || '',
          unit: '개',
          quantity: qty,
          unitPrice,
          totalPrice: unitPrice * qty,
          note: ''
        };
      });
      const bomMaterials = (totalBom || []).map(m => {
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
      setFormData(prev => ({
        ...prev,
        items: cartItems.length ? cartItems : prev.items,
        materials: bomMaterials.length ? bomMaterials : prev.materials
      }));
    }
  }, [cart, totalBom, isEditMode]);

  // 합계 계산 (BOM이 있고 matSum>0 이면 BOM, 아니면 itemSum)
  useEffect(() => {
    const materialsRecalc = formData.materials.map(mat => {
      const adminPrice = resolveAdminPrice(adminPricesRef.current, mat);
      const quantity = Number(mat.quantity) || 0;
      const unitPrice = adminPrice && adminPrice > 0 ? adminPrice : (Number(mat.unitPrice) || 0);
      return {
        ...mat,
        unitPrice,
        totalPrice: unitPrice * quantity
      };
    });
    const itemSum = formData.items.reduce((s,it)=>s+(parseFloat(it.totalPrice)||0),0);
    const matSum = materialsRecalc.reduce((s,it)=>s+(parseFloat(it.totalPrice)||0),0);
    const subtotal = (materialsRecalc.length > 0 && matSum > 0) ? matSum : itemSum;
    const tax = Math.round(subtotal * 0.1);
    const totalAmount = subtotal + tax;
    if (JSON.stringify(materialsRecalc) !== JSON.stringify(formData.materials)) {
      setFormData(prev => ({ ...prev, materials: materialsRecalc, subtotal, tax, totalAmount }));
    } else {
      setFormData(prev => ({ ...prev, subtotal, tax, totalAmount }));
    }
  }, [formData.items, formData.materials]);

  const updateFormData = (f,v) => setFormData(prev => ({ ...prev, [f]: v }));

  const upItem = (idx,f,v)=>{
    const items=[...formData.items];
    items[idx][f]=v;
    if(f==='quantity'||f==='unitPrice'){
      const q=parseFloat(items[idx].quantity)||0;
      const u=parseFloat(items[idx].unitPrice)||0;
      items[idx].totalPrice=q*u;
    }
    setFormData(p=>({...p,items}));
  };
  const addItem=()=>setFormData(p=>({...p,items:[...p.items,{name:'',unit:'',quantity:'',unitPrice:'',totalPrice:'',note:''}]}));
  const rmItem=(idx)=>setFormData(p=>({...p,items:p.items.filter((_,i)=>i!==idx)}));

  const upMat=(idx,f,v)=>{
    const materials=[...formData.materials];
    materials[idx][f]=v;
    if(f==='quantity'||f==='unitPrice'){
      const q=parseFloat(materials[idx].quantity)||0;
      const u=parseFloat(materials[idx].unitPrice)||0;
      materials[idx].totalPrice=q*u;
    }
    setFormData(p=>({...p,materials}));
  };
  const addMat=()=>setFormData(p=>({...p,materials:[...p.materials,{name:'',specification:'',quantity:'',unitPrice:'',totalPrice:'',note:''}]}));
  const rmMat=(idx)=>setFormData(p=>({...p,materials:p.materials.filter((_,i)=>i!==idx)}));

  const handleSave=()=>{
    if(!formData.documentNumber.trim()){
      alert('거래번호(문서번호)를 입력하세요.');
      documentNumberInputRef.current?.focus();
      return;
    }
    const itemId=isEditMode?id:Date.now();
    const storageKey=`delivery_note_${itemId}`;
    const newDoc={
      ...formData,
      id:itemId,
      type:'delivery',
      status:formData.status||'진행 중',
      deliveryNumber:formData.documentNumber,
      customerName:formData.companyName,
      productType:formData.items[0]?.name||'',
      quantity:formData.items.reduce((s,it)=>s+(parseInt(it.quantity)||0),0),
      unitPrice:formData.items[0]?(parseInt(formData.items[0].unitPrice)||0):0,
      totalPrice:formData.totalAmount,
      updatedAt:new Date().toISOString(),
      ...(isEditMode?{}:{createdAt:new Date().toISOString()})
    };
    localStorage.setItem(storageKey,JSON.stringify(newDoc));
    alert(isEditMode?'문서가 수정되었습니다.':'문서가 저장되었습니다.');
  };

  const handleExport=()=>{
    if(!formData.documentNumber.trim()){
      alert('거래번호(문서번호)를 입력해주세요.');
      return;
    }
    exportToExcel(formData,'delivery')
      .then(()=>alert('엑셀 파일이 다운로드되었습니다.'))
      .catch(e=>{
        console.error(e);
        alert('엑셀 다운로드 오류');
      });
  };

  const handlePrint=()=>{
    if(!formData.documentNumber.trim()){
      alert('거래번호(문서번호)를 입력해주세요.');
      documentNumberInputRef.current?.focus();
      return;
    }

    // 재고 감소 처리
    if (cart && cart.length > 0) {
      const result = deductInventoryOnPrint(cart, '거래명세서', formData.documentNumber);
      showInventoryResult(result, '거래명세서');
    }

    window.print();
  };

  return (
    <div className="purchase-order-form-container">
      <div className="form-header">
        <h1>거&nbsp;래&nbsp;명&nbsp;세&nbsp;서</h1>
      </div>

      <div className="info-table-stamp-wrapper">
        <table className="form-table info-table compact">
          <tbody>
            <tr>
              <td className="label" style={{width:110}}>거래일자</td>
              <td>
                <div style={{display:'flex',gap:'8px',alignItems:'center',width:'100%'}}>
                  <div style={{flex:'0 0 60%'}}>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={e=>updateFormData('date',e.target.value)}
                      style={{fontSize:'14px',fontWeight:600,padding:'6px 8px',width:'100%'}}
                    />
                  </div>
                  <div style={{display:'flex',flexDirection:'column',flex:'0 0 40%'}}>
                    <label style={{fontSize:'11px',fontWeight:600,marginBottom:2}}>거래번호</label>
                    <input
                      ref={documentNumberInputRef}
                      type="text"
                      value={formData.documentNumber}
                      onChange={e=>{
                        documentNumberInputRef.current?.classList.remove('invalid');
                        updateFormData('documentNumber',e.target.value);
                        updateFormData('orderNumber',e.target.value);
                      }}
                      style={{padding:'6px 8px',fontSize:'13px',width:'100%'}}
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
                  onChange={e=>updateFormData('bizNumber',e.target.value)}
                />
              </td>
              <td className="label">회사명</td>
              <td>{PROVIDER.companyName}</td>
            </tr>
            <tr>
              <td className="label">회사명</td>
              <td>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={e=>updateFormData('companyName',e.target.value)}
                  placeholder="회사명 입력"
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
              <td rowSpan={4}>
                <textarea
                  className="estimate-memo memo-narrow"
                  value={formData.topMemo}
                  onChange={e=>updateFormData('topMemo',e.target.value)}
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
          {formData.items.map((it, idx)=>(
            <tr key={`item-${idx}`}>
              <td>{idx+1}</td>
              <td><input type="text" value={it.name} onChange={e=>upItem(idx,'name',e.target.value)} placeholder="품명" /></td>
              <td><input type="text" value={it.unit} onChange={e=>upItem(idx,'unit',e.target.value)} placeholder="단위" /></td>
              <td><input type="number" value={it.quantity} onChange={e=>upItem(idx,'quantity',e.target.value)} placeholder="수량" /></td>
              <td><input type="number" value={it.unitPrice} onChange={e=>upItem(idx,'unitPrice',e.target.value)} placeholder="단가" /></td>
              <td className="right">{it.totalPrice?parseInt(it.totalPrice).toLocaleString():'0'}</td>
              <td><input type="text" value={it.note} onChange={e=>upItem(idx,'note',e.target.value)} placeholder="비고" /></td>
              <td className="no-print">
                <button type="button" onClick={()=>rmItem(idx)} disabled={formData.items.length===1} className="remove-btn">삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="item-controls no-print" style={{marginBottom:18}}>
        <button type="button" onClick={addItem} className="add-item-btn">+ 품목 추가</button>
      </div>

      <h3 style={{margin:'14px 0 6px', fontSize:16}}>원자재 명세서</h3>
      <table className="form-table bom-table">
        <thead>
          <tr>
            <th style={{width:'50px'}}>NO</th>
            <th style={{width:'190px'}}>부품명</th>
            <th className="spec-col">규격</th>
            <th style={{width:'70px'}}>수량</th>
            <th style={{width:'70px'}}>단가</th>
            <th style={{width:'90px'}}>금액</th>
            <th style={{width:'90px'}}>비고</th>
            <th className="no-print" style={{width:'70px'}}>작업</th>
          </tr>
        </thead>
        <tbody>
          {formData.materials.map((m, idx)=>(
            <tr key={`mat-${idx}`}>
              <td>{idx+1}</td>
              <td><input type="text" value={m.name} onChange={e=>upMat(idx,'name',e.target.value)} placeholder="부품명" /></td>
              <td className="spec-cell">
                <input
                  type="text"
                  value={m.specification}
                  onChange={e=>upMat(idx,'specification',e.target.value)}
                  placeholder="규격"
                />
              </td>
              <td><input type="number" value={m.quantity} onChange={e=>upMat(idx,'quantity',e.target.value)} placeholder="수량" /></td>
              <td><input type="number" value={m.unitPrice} onChange={e=>upMat(idx,'unitPrice',e.target.value)} placeholder="단가" /></td>
              <td className="right">{m.totalPrice?parseInt(m.totalPrice).toLocaleString():'0'}</td>
              <td><input type="text" value={m.note} onChange={e=>upMat(idx,'note',e.target.value)} placeholder="비고" /></td>
              <td className="no-print">
                <button type="button" onClick={()=>rmMat(idx)} className="remove-btn">삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="item-controls no-print" style={{marginBottom:18}}>
        <button type="button" onClick={addMat} className="add-item-btn">+ 자재 추가</button>
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

      <div className="form-actions no-print">
        <button type="button" onClick={handleSave} className="save-btn">저장하기</button>
        <button type="button" onClick={handleExport} className="excel-btn">엑셀로 저장하기</button>
        <button type="button" onClick={handlePrint} className="print-btn">인쇄하기</button>
      </div>

      <div className="form-company">({PROVIDER.companyName})</div>
    </div>
  );
};

export default DeliveryNoteForm;
