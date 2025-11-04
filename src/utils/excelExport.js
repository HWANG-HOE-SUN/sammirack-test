// src/utils/excelExport.js
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { deductInventoryOnPrint, showInventoryResult } from '../components/InventoryManager.jsx';

/** ---------------------------
 *  공통 유틸
 * --------------------------- */
export const generateFileName = (type = 'estimate') => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${type}_${y}${m}${day}.xlsx`;
};

// Vite + GitHub Pages 환경에서 public/ 경로 base 고려
const STAMP_URL = `${import.meta.env.BASE_URL}images/도장.png`;

/** 브라우저에서 이미지를 base64(pure)로 */
async function fetchAsBase64Pure(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const blob = await res.blob();
  const reader = new FileReader();
  const base64 = await new Promise((resolve) => {
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  // ExcelJS base64는 헤더 없이 순수 데이터만 필요
  const pure = String(base64).replace(/^data:image\/\w+;base64,/, '');
  return pure;
}

/** 엑셀 스타일 공통 */
const fontDefault = { name: '맑은 고딕', size: 10 };
const borderThin = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};
const alignCenter = { horizontal: 'center', vertical: 'middle', wrapText: true };
const alignLeftTop = { horizontal: 'left', vertical: 'top', wrapText: true };

// 색
const fillDocTitle = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } }; // 문서제목: 덜 어두운 회색
const fillHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };    // 15% 회색
const fillItemHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } }; // 25% 회색 (청구서 원자재 헤더 등)
const fillWhite = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

// 컬럼 너비(요청 반영: E,F 더 넓게)
const columnWidths = [
  { width: 5 },  // A: NO
  { width: 39 }, // B: 품명/부품명
  { width: 11 },  // C: 단위
  { width: 8 },  // D: 수량
  { width: 18 }, // E: 단가(3 정도 더 넓힘)
  { width: 18 }, // F: 공급가/금액(3 정도 더 넓힘)
  { width: 15 }, // G: 비고
  { width: 15 }, // H: 비고 확장
];

// 보더/정렬/폰트 일괄 적용
function styleRange(ws, r1, c1, r2, c2, { font, alignment, border, fill } = {}) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getRow(r).getCell(c);
      if (font) cell.font = { ...(cell.font || {}), ...font };
      if (alignment) cell.alignment = { ...(cell.alignment || {}), ...alignment };
      if (border) cell.border = { ...(cell.border || {}), ...border };
      if (fill) cell.fill = fill;
    }
  }
}
function colLetter(idx1) {
  // 1->A, 2->B...
  return String.fromCharCode(64 + idx1);
}

/** 숫자 서식 지정 */
function setNumFmt(ws, r1, c1, r2, c2, fmt = '#,##0') {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.numFmt = fmt;
    }
  }
}

/** 전체 테두리(문서 구간) */
function fullBorder(ws, r1, r2, c1 = 1, c2 = 8) {
  styleRange(ws, r1, c1, r2, c2, { border: borderThin });
}

/** 행 높이 */
function setRowHeights(ws, map) {
  Object.entries(map).forEach(([rowNo, height]) => {
    ws.getRow(Number(rowNo)).height = height;
  });
}

/** 공통 상단 정보(문서제목/회사/고객) */
function buildTop(ws, type, { date, companyName, contact } = {}) {
  // 문서 제목 A5:H5
  ws.mergeCells('A5:H5');
  const title = type === 'purchase' ? '청구서' : type === 'delivery' ? '거래명세서' : '견적서';
  const titleCell = ws.getCell('A5');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 20 };
  titleCell.fill = fillDocTitle;
  titleCell.alignment = alignCenter;
  setRowHeights(ws, { 5: 45 });

  // 고객 정보 라벨/값
  ws.mergeCells('A6:B6'); ws.getCell('A6').value = '거래일자';
  ws.mergeCells('A7:B7'); ws.getCell('A7').value = '상호명';
  ws.mergeCells('A8:B8'); ws.getCell('A8').value = '담당자';

  ws.getCell('C6').value = date || '';
  ws.getCell('C7').value = companyName || '';
  ws.getCell('C8').value = contact || '';

  // 아래 문구 A9:C10 병합
  ws.mergeCells('A9:C10');
  const bottomText = type === 'purchase' ? '아래와 같이 청구합니다' : type === 'delivery' ? '아래와 같이 거래합니다' : '아래와 같이 견적합니다';
  ws.getCell('A9').value = bottomText;
  ws.getCell('A9').alignment = alignCenter;
  setRowHeights(ws, { 9: 40 });

  // 공급자 D6:D10 병합
  ws.mergeCells('D6:D10');
  ws.getCell('D6').value = '공급자';
  ws.getCell('D6').alignment = alignCenter;

  // 공급자 상세
  ws.getCell('E6').value = '사업자등록번호';
  ws.mergeCells('F6:H6'); ws.getCell('F6').value = '232-81-01750'; ws.getCell('F6').alignment = alignCenter;

  ws.getCell('E7').value = '상호';
  ws.getCell('F7').value = '삼미앵글랙산업';
  ws.getCell('G7').value = '대표자';
  ws.getCell('H7').value = '박이삭';

  ws.getCell('E8').value = '소재지';
  ws.mergeCells('F8:H8'); ws.getCell('F8').value = '경기도 광명시 원노온사로 39, 철제 스틸하우스 1';
  ws.getCell('F8').alignment = alignCenter;

  ws.getCell('E9').value = 'TEL';
  ws.getCell('F9').value = '010-9548-9578  010-4311-7733';
  ws.getCell('G9').value = 'FAX';
  ws.getCell('H9').value = '(02)2611-4595';

  ws.getCell('E10').value = '홈페이지';
  ws.mergeCells('F10:H10'); ws.getCell('F10').value = 'http://www.ssmake.com';
  ws.getCell('F10').alignment = alignCenter;

  // 전체 상단구간 스타일(폰트/정렬/보더)
  styleRange(ws, 5, 1, 10, 8, { alignment: alignCenter, border: borderThin });
}

/** 견적서 전용 (기존 estimate 타입만) */
function buildEstimate(ws, items = [], totals, notes) {
  // 섹션 타이틀 A11:H11
  ws.mergeCells('A11:H11');
  ws.getCell('A11').value = '견적명세';
  ws.getCell('A11').fill = fillHeader;
  ws.getCell('A11').alignment = alignCenter;
  ws.getCell('A11').font = { bold: true, size: 16 };
  styleRange(ws, 11, 1, 11, 8, { font: fontDefault, border: borderThin });

  // 헤더 A12:H12 (G:H 비고 합치기)
  ws.getCell('A12').value = 'NO';
  ws.getCell('B12').value = '품명';
  ws.getCell('C12').value = '단위';
  ws.getCell('D12').value = '수량';
  ws.getCell('E12').value = '단가';
  ws.getCell('F12').value = '공급가';
  ws.mergeCells('G12:H12'); ws.getCell('G12').value = '비고';
  styleRange(ws, 12, 1, 12, 8, { font: { ...fontDefault, bold: true }, alignment: alignCenter, border: borderThin, fill: fillHeader });

  // 최소 13행 확보 (NO 1~13)
  const rowCount = Math.max(items?.length || 0, 13);
  for (let i = 0; i < rowCount; i++) {
    const r = 13 + i;
    const item = items[i] || {};
    ws.getCell(`A${r}`).value = i + 1;
    ws.getCell(`B${r}`).value = item.name || '';
    ws.getCell(`C${r}`).value = item.unit || '';
    ws.getCell(`D${r}`).value = item.quantity ?? '';
    ws.getCell(`E${r}`).value = item.unitPrice ?? '';
    ws.getCell(`F${r}`).value = item.totalPrice ?? '';
    ws.mergeCells(`G${r}:H${r}`);
    ws.getCell(`G${r}`).value = item.note || '';

    // 정렬/보더/폰트
    styleRange(ws, r, 1, r, 8, { font: fontDefault, alignment: alignCenter, border: borderThin });
  }
  // 숫자 서식 (E,F 열)
  setNumFmt(ws, 13, 5, 12 + rowCount, 6);

  // ✅ 수식으로 변경: 소계/부가세/합계 (A26:F28 / G26:H28)
  const totalStart = 26;
  const labels = ['소계', '부가가치세', '합계'];
  
  for (let i = 0; i < 3; i++) {
    const r = totalStart + i;
    ws.mergeCells(`A${r}:F${r}`);
    ws.getCell(`A${r}`).value = labels[i];
    ws.getCell(`A${r}`).alignment = alignCenter;
    ws.mergeCells(`G${r}:H${r}`);
    
    // ✅ 고정값 대신 엑셀 수식 적용
    if (i === 0) { // 소계
      ws.getCell(`G${r}`).value = { 
        formula: `SUM(F13:F${12 + rowCount})`, 
        result: totals?.subtotal || 0 
      };
    } else if (i === 1) { // 부가가치세
      ws.getCell(`G${r}`).value = { 
        formula: `G${totalStart}*0.1`, 
        result: totals?.tax || 0 
      };
    } else { // 합계
      ws.getCell(`G${r}`).value = { 
        formula: `G${totalStart}+G${totalStart + 1}`, 
        result: totals?.total || 0 
      };
    }
    
    styleRange(ws, r, 1, r, 8, { font: fontDefault, alignment: alignCenter, border: borderThin });
  }
  // 합계 숫자 서식
  setNumFmt(ws, totalStart, 7, totalStart + 2, 8);

  // 특기사항 A29:H31 (흰색 배경, 좌상단 정렬)
  ws.mergeCells('A29:H31');
  
  // 특기사항 제목
  ws.getCell('A29').value = "특기사항";
  ws.getCell('A29').font = { bold: true };
  ws.getCell('A29').alignment = { vertical: "top", horizontal: "left" };
  
  // notes 내용 (있으면)
  if (notes) {
    ws.getCell('A30').value = notes;
    ws.getCell('A30').alignment = { vertical: "top", horizontal: "left", wrapText: true };
  }
  
  styleRange(ws, 29, 1, 31, 8, { font: fontDefault, alignment: alignLeftTop, border: borderThin, fill: fillWhite });

  // 회사명 푸터 H32
  ws.getCell('H32').value = '(주)삼미앵글산업';
  ws.getCell('H32').font = { ...fontDefault, size: 10 };
  ws.getCell('H32').alignment = alignCenter;

  // 전체 테두리(5~32행)
  fullBorder(ws, 5, 32, 1, 8);
}

/** 청구서 & 거래명세서 공통 (아이템 8행 고정 최소, 21~23 합계, 24~ 원자재 명세) */
function buildPurchaseOrTransaction(ws, type, items = [], materials = [], totals, notes) {
  // 섹션 타이틀 A11:H11
  ws.mergeCells('A11:H11');
  const sectionTitle = type === 'purchase' ? '청구명세' : '거래명세';
  ws.getCell('A11').value = sectionTitle;
  ws.getCell('A11').fill = fillHeader;
  ws.getCell('A11').alignment = alignCenter;
  ws.getCell('A11').font = { bold: true, size: 16 };
  styleRange(ws, 11, 1, 11, 8, { font: fontDefault, border: borderThin });

  // 헤더 A12:H12 (G~H 비고 병합)
  ws.getCell('A12').value = 'NO';
  ws.getCell('B12').value = '품명';
  ws.getCell('C12').value = '단위';
  ws.getCell('D12').value = '수량';
  ws.getCell('E12').value = '단가';
  ws.getCell('F12').value = '공급가';
  ws.mergeCells('G12:H12'); ws.getCell('G12').value = '비고';
  styleRange(ws, 12, 1, 12, 8, { font: { ...fontDefault, bold: true }, alignment: alignCenter, border: borderThin, fill: fillHeader });

  // 상품 데이터 최소 8행 확보 (NO 1~8)
  const itemRows = Math.max(items?.length || 0, 8);
  for (let i = 0; i < itemRows; i++) {
    const r = 13 + i;
    const it = items[i] || {};
    ws.getCell(`A${r}`).value = i + 1;
    ws.getCell(`B${r}`).value = it.name || '';
    ws.getCell(`C${r}`).value = it.unit || '';
    ws.getCell(`D${r}`).value = it.quantity ?? '';
    ws.getCell(`E${r}`).value = it.unitPrice ?? '';
    ws.getCell(`F${r}`).value = it.totalPrice ?? '';
    ws.mergeCells(`G${r}:H${r}`);
    ws.getCell(`G${r}`).value = it.note || '';
    styleRange(ws, r, 1, r, 8, { font: fontDefault, alignment: alignCenter, border: borderThin });
  }
  // 숫자 서식
  setNumFmt(ws, 13, 5, 12 + itemRows, 6);

  // ✅ 수식으로 변경: 합계 A21:F23 / G21:H23
  const totalStart = 21;
  const labels = ['소계', '부가가치세', '합계'];
  
  // 원자재 데이터 범위 계산 (26행부터 최소 30행)
  const matRows = Math.max(materials?.length || 0, 30);
  const materialEndRow = 25 + matRows; // 26행부터 시작하므로
  
  for (let i = 0; i < 3; i++) {
    const r = totalStart + i;
    ws.mergeCells(`A${r}:F${r}`);
    ws.getCell(`A${r}`).value = labels[i];
    ws.getCell(`A${r}`).alignment = alignCenter;
    ws.mergeCells(`G${r}:H${r}`);
    
    // ✅ 고정값 대신 엑셀 수식 적용 (원자재 E열 기준)
    if (i === 0) { // 소계
      ws.getCell(`G${r}`).value = { 
        formula: `SUM(E26:E${materialEndRow})`, 
        result: totals?.subtotal || 0 
      };
    } else if (i === 1) { // 부가가치세
      ws.getCell(`G${r}`).value = { 
        formula: `G${totalStart}*0.1`, 
        result: totals?.tax || 0 
      };
    } else { // 합계
      ws.getCell(`G${r}`).value = { 
        formula: `G${totalStart}+G${totalStart + 1}`, 
        result: totals?.total || 0 
      };
    }
    
    styleRange(ws, r, 1, r, 8, { font: fontDefault, alignment: alignCenter, border: borderThin });
  }
  setNumFmt(ws, totalStart, 7, totalStart + 2, 8);

  // 원자재 명세서 A24:H24 (25% 회색)
  ws.mergeCells('A24:H24');
  ws.getCell('A24').value = '원자재 명세서';
  ws.getCell('A24').fill = fillItemHeader;
  ws.getCell('A24').alignment = alignCenter;
  ws.getCell('A24').font = { bold: true, size: 16 };
  styleRange(ws, 24, 1, 24, 8, { font: fontDefault, border: borderThin });

  // 원자재 헤더 A25:H25 — F~H 비고 병합
  ws.getCell('A25').value = 'NO';
  ws.getCell('B25').value = '부품명';
  ws.getCell('C25').value = '수량';
  ws.getCell('D25').value = '단가';
  ws.getCell('E25').value = '금액';
  ws.mergeCells('F25:H25'); ws.getCell('F25').value = '비고';
  styleRange(ws, 25, 1, 25, 8, { font: { ...fontDefault, bold: true }, alignment: alignCenter, border: borderThin, fill: fillHeader });

  // 원자재 데이터 최소 30행 (A26~A55)
  for (let i = 0; i < matRows; i++) {
    const r = 26 + i;
    const m = materials[i] || {};
    ws.getCell(`A${r}`).value = i + 1;
    ws.getCell(`B${r}`).value = m.name || '';
    ws.getCell(`C${r}`).value = m.quantity ?? '';
    ws.getCell(`D${r}`).value = m.unitPrice ?? '';
    ws.getCell(`E${r}`).value = m.totalPrice ?? '';
    ws.mergeCells(`F${r}:H${r}`);
    ws.getCell(`F${r}`).value = m.note || '';
    styleRange(ws, r, 1, r, 8, { font: fontDefault, alignment: alignCenter, border: borderThin });
  }
  // 숫자 서식 (D,E)
  setNumFmt(ws, 26, 4, 25 + matRows, 5);

  // 특기사항 A56:H58
  ws.mergeCells('A56:H58');
  // 특기사항 제목
  ws.getCell('A56').value = "특기사항";
  ws.getCell('A56').font = { bold: true };
  ws.getCell('A56').alignment = { vertical: "top", horizontal: "left" };
  
  // notes 내용 (있으면)
  if (notes) {
    ws.getCell('A57').value = notes;
    ws.getCell('A57').alignment = { vertical: "top", horizontal: "left", wrapText: true };
  }
  
  styleRange(ws, 56, 1, 58, 8, { font: fontDefault, alignment: alignLeftTop, border: borderThin, fill: fillWhite });

  // 회사명 H59
  ws.getCell('H59').value = '(주)삼미앵글산업';
  ws.getCell('H59').font = { ...fontDefault, size: 10 };
  ws.getCell('H59').alignment = alignCenter;

  // 전체 테두리(5~59행)
  fullBorder(ws, 5, 59, 1, 8);
}

/** 도장 이미지 배치(H7 근처) */
async function placeStamp(workbook, ws) {
  try {
    const base64 = await fetchAsBase64Pure(STAMP_URL);
    const imgId = workbook.addImage({ base64, extension: 'png' });
    // 적당히 보이도록 H7:I9 영역에 배치
    ws.addImage(imgId, {
      tl: { col: 7.9, row: 6.4 }, // H7 근처 (0-index 기반)
      ext: { width: 40, height: 40 },
      editAs: 'oneCell',
    });
  } catch (e) {
    // 이미지 못 불러와도 문서 저장은 계속
    // eslint-disable-next-line no-console
    console.warn('도장 이미지 로드 실패:', e);
  }
}

/** 메인: 브라우저에서 엑셀 생성 & 저장 */
export async function exportToExcel(rawData, type = 'estimate') {
  // rawData: { date, companyName, items, materials, subtotal, tax, totalAmount, notes, ... }
  const workbook = new ExcelJS.Workbook();
  const sheetName = type === 'purchase' ? '청구서' : (type === 'delivery' ? '거래명세서' : '견적서');
  const ws = workbook.addWorksheet(sheetName);

  // 컬럼 너비
  ws.columns = columnWidths;

  // 상단 공통 헤더
  buildTop(ws, type, {
    date: rawData?.date,
    companyName: rawData?.companyName,
    contact: rawData?.contact || rawData?.manager || '',
  });

  // 타입별 본문
  const items = Array.isArray(rawData?.items) ? rawData.items : [];
  const materials = Array.isArray(rawData?.materials) ? rawData.materials : [];
  const totals = {
    subtotal: Number(rawData?.subtotal || 0),
    tax: Number(rawData?.tax || 0),
    total: Number(rawData?.totalAmount || rawData?.total || 0),
  };
  const notes = rawData?.notes || '';

  if (type === 'purchase' || type === 'delivery') {
    // 청구서와 거래명세서는 동일한 레이아웃 (원자재 명세서 포함)
    buildPurchaseOrTransaction(ws, type, items, materials, totals, notes);
  } else {
    // 견적서는 기존 레이아웃 (원자재 명세서 없음)
    buildEstimate(ws, items, totals, notes);
  }

  // 셀 전체 가운데 정렬 유지 (특기사항 제외 이미 따로 처리)
  styleRange(ws, 5, 1, ws.rowCount, 8, { alignment: alignCenter });

  // 도장 이미지
  await placeStamp(workbook, ws);

  // 파일 쓰기 & 다운로드
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = generateFileName(
    type === 'delivery' ? 'delivery' : type === 'purchase' ? 'purchase' : 'estimate'
  );
  saveAs(blob, fileName);
}

/**
 * ✅ 견적서 출력 시 재고 감소 연동
 */
export const exportEstimateWithInventory = async (formData, cartData, fileName) => {
  try {
    // 1. 기존 Excel 출력
    await exportToExcel(formData, 'estimate');
    console.log('✅ 견적서 Excel 출력 완료');
    
    // 2. 재고 감소 (견적서는 선택적)
    if (cartData?.cart && window.confirm('견적서 출력과 함께 재고를 감소시키시겠습니까?')) {
      const result = deductInventoryOnPrint(
        cartData.cart, 
        'estimate', 
        formData.documentNumber || fileName || '견적서'
      );
      
      showInventoryResult(result, '견적서');
      return result;
    }
    
    return { success: true, message: '견적서 출력 완료 (재고 변경 없음)' };
    
  } catch (error) {
    console.error('견적서 출력 실패:', error);
    throw error;
  }
};

/**
 * ✅ 청구서 출력 시 재고 감소 연동
 */
export const exportPurchaseWithInventory = async (formData, cartData, fileName) => {
  try {
    // 1. 기존 Excel 출력
    await exportToExcel(formData, 'purchase');
    console.log('✅ 청구서 Excel 출력 완료');
    
    // 2. 재고 자동 감소 (청구서는 자동)
    if (cartData?.cart) {
      const result = deductInventoryOnPrint(
        cartData.cart, 
        'purchase', 
        formData.documentNumber || fileName || '청구서'
      );
      
      showInventoryResult(result, '청구서');
      return result;
    }
    
    return { success: true, message: '청구서 출력 완료 (재고 감소 대상 없음)' };
    
  } catch (error) {
    console.error('청구서 출력 실패:', error);
    throw error;
  }
};

/**
 * ✅ 거래명세서 출력 시 재고 감소 연동
 */
export const exportDeliveryWithInventory = async (formData, cartData, fileName) => {
  try {
    // 1. 기존 Excel 출력
    await exportToExcel(formData, 'delivery');
    console.log('✅ 거래명세서 Excel 출력 완료');
    
    // 2. 재고 자동 감소 (거래명세서는 자동)
    if (cartData?.cart) {
      const result = deductInventoryOnPrint(
        cartData.cart, 
        'delivery', 
        formData.documentNumber || fileName || '거래명세서'
      );
      
      showInventoryResult(result, '거래명세서');
      return result;
    }
    
    return { success: true, message: '거래명세서 출력 완료 (재고 감소 대상 없음)' };
    
  } catch (error) {
    console.error('거래명세서 출력 실패:', error);
    throw error;
  }
};

/**
 * ✅ 기존 컴포넌트들에서 사용할 통합 프린트 함수
 * 문서 타입에 따라 자동으로 적절한 함수 호출
 */
export const printDocumentWithInventory = async (documentType, formData, cartData, fileName) => {
  switch (documentType) {
    case 'estimate':
      return await exportEstimateWithInventory(formData, cartData, fileName);
    
    case 'purchase':
      return await exportPurchaseWithInventory(formData, cartData, fileName);
    
    case 'delivery':
      return await exportDeliveryWithInventory(formData, cartData, fileName);
    
    default:
      // 기본은 기존 방식 (재고 감소 없음)
      await exportToExcel(formData, documentType);
      console.log("재고 감소 없이 프린트 되었음")
      return { success: true, message: '문서 출력 완료' };
  }
};

// 호환용 default export 묶음 (원하면 import default로도 쓸 수 있게)
export default { exportToExcel, generateFileName };
