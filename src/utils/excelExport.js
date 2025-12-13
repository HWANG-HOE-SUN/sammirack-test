// src/utils/excelExport.js
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { deductInventoryOnPrint, showInventoryResult } from '../components/InventoryManager.jsx';

/** ---------------------------
 *  공통 유틸
 * --------------------------- */
export const generateFileName = (type = 'estimate', documentNumber = '') => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  const typeMap = {
    estimate: '견적서',
    delivery: '거래명세서',
    purchase: '청구서'
  };
  
  const koreanType = typeMap[type] || '견적서';
  const dateStr = `${y}${m}${day}`;
  
  if (documentNumber) {
    return `${koreanType}_${documentNumber}_${dateStr}.xlsx`;
  } else {
    return `${koreanType}_${dateStr}.xlsx`;
  }
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
  { width: 20 }, // B: 품명/부품명 (축소)
  { width: 11 }, // C: 단위
  { width: 9 },  // D: 거래번호 라벨 (신규)
  { width: 12 }, // E: 거래번호 값 (신규)
  { width: 8 },  // F: 수량 (기존 D)
  { width: 18 }, // G: 단가 (기존 E)
  { width: 18 }, // H: 공급가/금액 (기존 F)
  { width: 15 }, // I: 비고 (기존 G)
  { width: 15 }, // J: 비고 확장 (기존 H)
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
function fullBorder(ws, r1, r2, c1 = 1, c2 = 10) {
  styleRange(ws, r1, c1, r2, c2, { border: borderThin });
}

/** 행 높이 */
function setRowHeights(ws, map) {
  Object.entries(map).forEach(([rowNo, height]) => {
    ws.getRow(Number(rowNo)).height = height;
  });
}

/** 공통 상단 정보(문서제목/회사/고객) */
function buildTop(ws, type, { date, companyName, contact, documentNumber } = {}) {
  // 문서 제목 A5:J5
  ws.mergeCells('A5:J5');
  const title = type === 'purchase' ? '청구서' : type === 'delivery' ? '거래명세서' : '견적서';
  const titleCell = ws.getCell('A5');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 20 };
  titleCell.fill = fillDocTitle;
  titleCell.alignment = alignCenter;
  setRowHeights(ws, { 5: 45 });

  // 6행: 거래일자 + 거래번호
  ws.mergeCells('A6:B6'); 
  ws.getCell('A6').value = '거래일자';
  ws.getCell('A6').alignment = alignCenter;

  ws.getCell('C6').value = date || '';
  ws.getCell('C6').alignment = alignCenter;

  ws.getCell('D6').value = '거래번호';
  ws.getCell('D6').alignment = alignCenter;

  ws.getCell('E6').value = documentNumber || '';
  ws.getCell('E6').alignment = alignCenter;
  ws.getCell('E6').font = { name: '맑은 고딕', size: 14, bold: true, color: { argb: 'FFFF6600' } }; // 주황색 굵게 크게

  // 7행: 상호명
  ws.mergeCells('A7:C7');
  ws.getCell('A7').value = '상호명';
  ws.getCell('A7').alignment = alignCenter;

  ws.mergeCells('D7:E7');
  ws.getCell('D7').value = companyName || '';
  ws.getCell('D7').alignment = alignCenter;

  // 8행: 담당자
  ws.mergeCells('A8:C8');
  ws.getCell('A8').value = '담당자';
  ws.getCell('A8').alignment = alignCenter;

  ws.mergeCells('D8:E8');
  ws.getCell('D8').value = contact || '';
  ws.getCell('D8').alignment = alignCenter;

  // 하단 문구 A9:E10 병합
  ws.mergeCells('A9:E10');
  const bottomText = type === 'purchase' ? '아래와 같이 청구합니다' : type === 'delivery' ? '아래와 같이 거래합니다' : '아래와 같이 견적합니다';
  ws.getCell('A9').value = bottomText;
  ws.getCell('A9').alignment = alignCenter;
  setRowHeights(ws, { 9: 40 });

  // 공급자 F6:F10 병합
  ws.mergeCells('F6:F10');
  ws.getCell('F6').value = '공급자';
  ws.getCell('F6').alignment = alignCenter;

  // 공급자 상세 정보
  ws.getCell('G6').value = '사업자등록번호';
  ws.getCell('G6').alignment = alignCenter;
  
  ws.mergeCells('H6:J6'); 
  ws.getCell('H6').value = '232-81-01750'; 
  ws.getCell('H6').alignment = alignCenter;

  ws.getCell('G7').value = '상호';
  ws.getCell('G7').alignment = alignCenter;
  
  ws.getCell('H7').value = '삼미앵글랙산업';
  ws.getCell('H7').alignment = alignCenter;
  
  ws.getCell('I7').value = '대표자';
  ws.getCell('I7').alignment = alignCenter;
  
  ws.getCell('J7').value = '박이삭';
  ws.getCell('J7').alignment = alignCenter;

  ws.getCell('G8').value = '소재지';
  ws.getCell('G8').alignment = alignCenter;
  
  ws.mergeCells('H8:J8'); 
  ws.getCell('H8').value = '경기도 광명시 철도공원로 39, 킴스 스틸하우스 1';
  ws.getCell('H8').alignment = alignCenter;

  ws.getCell('G9').value = 'TEL';
  ws.getCell('G9').alignment = alignCenter;
  
  ws.getCell('H9').value = '010-9548-9578  010-4311-7733';
  ws.getCell('H9').alignment = alignCenter;
  
  ws.getCell('I9').value = 'FAX';
  ws.getCell('I9').alignment = alignCenter;
  
  ws.getCell('J9').value = '(02)2611-4595';
  ws.getCell('J9').alignment = alignCenter;

  ws.getCell('G10').value = '홈페이지';
  ws.getCell('G10').alignment = alignCenter;
  
  ws.mergeCells('H10:J10'); 
  ws.getCell('H10').value = 'http://www.ssmake.com';
  ws.getCell('H10').alignment = alignCenter;

  // 전체 상단구간 스타일(폰트/정렬/보더)
  styleRange(ws, 5, 1, 10, 10, { alignment: alignCenter, border: borderThin });
}

/** 견적서 전용 (기존 estimate 타입만) */
function buildEstimate(ws, items = [], totals, notes) {
  // 섹션 타이틀 A11:J11
  ws.mergeCells('A11:J11');
  ws.getCell('A11').value = '견적명세';
  ws.getCell('A11').fill = fillHeader;
  ws.getCell('A11').alignment = alignCenter;
  ws.getCell('A11').font = { bold: true, size: 16 };
  styleRange(ws, 11, 1, 11, 10, { font: fontDefault, border: borderThin });

  // 헤더 A12:J12
  ws.getCell('A12').value = 'NO';
  ws.mergeCells('B12:D12'); ws.getCell('B12').value = '품명';
  ws.getCell('E12').value = '단위';
  ws.getCell('F12').value = '수량';
  ws.getCell('G12').value = '단가';
  ws.getCell('H12').value = '공급가';
  ws.mergeCells('I12:J12'); ws.getCell('I12').value = '비고';
  styleRange(ws, 12, 1, 12, 10, { font: { ...fontDefault, bold: true }, alignment: alignCenter, border: borderThin, fill: fillHeader });

  // 최소 13행 확보 (NO 1~13)
  const rowCount = Math.max(items?.length || 0, 13);
  for (let i = 0; i < rowCount; i++) {
    const r = 13 + i;
    const item = items[i] || {};
    ws.getCell(`A${r}`).value = i + 1;
    ws.mergeCells(`B${r}:D${r}`);
    ws.getCell(`B${r}`).value = item.name || '';
    ws.getCell(`E${r}`).value = item.unit || '';
    ws.getCell(`F${r}`).value = item.quantity ?? '';
    ws.getCell(`G${r}`).value = item.unitPrice ?? '';
    ws.getCell(`H${r}`).value = item.totalPrice ?? '';
    ws.mergeCells(`I${r}:J${r}`);
    ws.getCell(`I${r}`).value = item.note || '';
    styleRange(ws, r, 1, r, 10, { font: fontDefault, alignment: alignCenter, border: borderThin });
  }
  setNumFmt(ws, 13, 7, 12 + rowCount, 8); // G, H열 숫자 서식

  // ✅ 수식으로 변경: 소계/부가세/합계 (A26:F28 / G26:H28)
  const totalStart = 26;
  const labels = ['소계', '부가가치세', '합계'];
  
  for (let i = 0; i < 3; i++) {
    const r = totalStart + i;
    ws.mergeCells(`A${r}:F${r}`);
    ws.getCell(`A${r}`).value = labels[i];
    ws.getCell(`A${r}`).alignment = alignCenter;
    ws.mergeCells(`G${r}:J${r}`);
    
    // ✅ 고정값 대신 엑셀 수식 적용
    if (i === 0) { // 소계
      ws.getCell(`G${r}`).value = { 
        formula: `SUM(H13:H${12 + rowCount})`,
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
    
    styleRange(ws, r, 1, r, 10, { font: fontDefault, alignment: alignCenter, border: borderThin });
  }
  // 합계 숫자 서식
  setNumFmt(ws, totalStart, 7, totalStart + 2, 10);

  // 특기사항 A29:J31 (흰색 배경, 좌상단 정렬)
  ws.mergeCells('A29:J31');
  
  // 특기사항 제목
  ws.getCell('A29').value = "특기사항";
  ws.getCell('A29').font = { bold: true };
  ws.getCell('A29').alignment = { vertical: "top", horizontal: "left" };
  
  // notes 내용 (있으면)
  if (notes) {
    ws.getCell('A30').value = notes;
    ws.getCell('A30').alignment = { vertical: "top", horizontal: "left", wrapText: true };
  }
  
  styleRange(ws, 29, 1, 31, 10, { font: fontDefault, alignment: alignLeftTop, border: borderThin, fill: fillWhite });

  // 회사명 푸터 J32
  ws.getCell('J32').value = '(주)삼미앵글산업';
  ws.getCell('J32').font = { ...fontDefault, size: 10 };
  ws.getCell('J32').alignment = alignCenter;

  // 전체 테두리(5~32행)
  fullBorder(ws, 5, 32, 1, 10);
}

/** 청구서 & 거래명세서 공통 (아이템 8행 고정 최소, 21~23 합계, 24~ 원자재 명세) */
function buildPurchaseOrTransaction(ws, type, items = [], materials = [], totals, notes) {
  // 섹션 타이틀 A11:J11
  ws.mergeCells('A11:J11');
  const sectionTitle = type === 'purchase' ? '청구명세' : '거래명세';
  ws.getCell('A11').value = sectionTitle;
  ws.getCell('A11').fill = fillHeader;
  ws.getCell('A11').alignment = alignCenter;
  ws.getCell('A11').font = { bold: true, size: 16 };
  styleRange(ws, 11, 1, 11, 10, { font: fontDefault, border: borderThin });

  // 헤더 A12:J12
  ws.getCell('A12').value = 'NO';
  ws.mergeCells('B12:D12'); ws.getCell('B12').value = '품명';
  ws.getCell('E12').value = '단위';
  ws.getCell('F12').value = '수량';
  ws.getCell('G12').value = '단가';
  ws.getCell('H12').value = '공급가';
  ws.mergeCells('I12:J12'); ws.getCell('I12').value = '비고';
  styleRange(ws, 12, 1, 12, 10, { font: { ...fontDefault, bold: true }, alignment: alignCenter, border: borderThin, fill: fillHeader });

  // 상품 데이터 최소 8행 확보
  const itemRows = Math.max(items?.length || 0, 8);
  for (let i = 0; i < itemRows; i++) {
    const r = 13 + i;
    const it = items[i] || {};
    ws.getCell(`A${r}`).value = i + 1;
    ws.mergeCells(`B${r}:D${r}`);
    ws.getCell(`B${r}`).value = it.name || '';
    ws.getCell(`E${r}`).value = it.unit || '';
    ws.getCell(`F${r}`).value = it.quantity ?? '';
    ws.getCell(`G${r}`).value = it.unitPrice ?? '';
    ws.getCell(`H${r}`).value = it.totalPrice ?? '';
    ws.mergeCells(`I${r}:J${r}`);
    ws.getCell(`I${r}`).value = it.note || '';
    styleRange(ws, r, 1, r, 10, { font: fontDefault, alignment: alignCenter, border: borderThin });
  }
  setNumFmt(ws, 13, 7, 12 + itemRows, 8);

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
    ws.mergeCells(`G${r}:J${r}`);
    
    // ✅ 고정값 대신 엑셀 수식 적용 (위의 청구 명세 기준)
    if (i === 0) { // 소계
      ws.getCell(`G${r}`).value = { 
        formula: `SUM(H13:H${12 + itemRows})`,
    // ✅ 고정값 대신 엑셀 수식 적용 (원자재 E열 기준, 아래의 코드 절대 지우지말것(언제가 쓸수도있음 원자재 가격 기준))
    // if (i === 0) { // 소계
    //   ws.getCell(`G${r}`).value = { 
    //     formula: `SUM(E26:E${materialEndRow})`, 
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
    
    styleRange(ws, r, 1, r, 10, { font: fontDefault, alignment: alignCenter, border: borderThin });
  }
  setNumFmt(ws, totalStart, 7, totalStart + 2, 10);

  // 원자재 명세서 A24:J24 (25% 회색)
  ws.mergeCells('A24:J24');
  ws.getCell('A24').value = '원자재 명세서';
  ws.getCell('A24').fill = fillItemHeader;
  ws.getCell('A24').alignment = alignCenter;
  ws.getCell('A24').font = { bold: true, size: 16 };
  styleRange(ws, 24, 1, 24, 10, { font: fontDefault, border: borderThin });

  // 원자재 헤더 A25:J25
  // 원자재 헤더 A25:J25 (단가/금액 제거, 부품명 확대)
  ws.getCell('A25').value = 'NO';
  ws.mergeCells('B25:E25'); ws.getCell('B25').value = '부품명';
  ws.getCell('F25').value = '수량';
  ws.mergeCells('G25:J25'); ws.getCell('G25').value = '비고';

  // 아래 주석 절대 지우지 말것 (단가,금액 다시 쓰고 싶어지면 주석풀기)
  // ws.mergeCells('B25:D25'); ws.getCell('B25').value = '부품명';
  // ws.getCell('E25').value = '수량';
  // ws.getCell('F25').value = '단가';
  // ws.getCell('G25').value = '금액';
  // ws.mergeCells('H25:J25'); ws.getCell('H25').value = '비고';
  styleRange(ws, 25, 1, 25, 10, { font: { ...fontDefault, bold: true }, alignment: alignCenter, border: borderThin, fill: fillHeader });

  // 원자재 데이터 (단가/금액 제거)
  for (let i = 0; i < matRows; i++) {
    const r = 26 + i;
    const m = materials[i] || {};
    ws.getCell(`A${r}`).value = i + 1;
    ws.mergeCells(`B${r}:E${r}`);
    ws.getCell(`B${r}`).value = m.name || '';
    ws.getCell(`F${r}`).value = m.quantity ?? '';
    ws.mergeCells(`G${r}:J${r}`);
    ws.getCell(`G${r}`).value = m.note || '';
    styleRange(ws, r, 1, r, 10, { font: fontDefault, alignment: alignCenter, border: borderThin });
  }
  // setNumFmt(ws, 26, 6, 25 + matRows, 7);
  
  // 특기사항 A56:J58
  ws.mergeCells('A56:J58');
  // 특기사항 제목
  ws.getCell('A56').value = "특기사항";
  ws.getCell('A56').font = { bold: true };
  ws.getCell('A56').alignment = { vertical: "top", horizontal: "left" };
  
  // notes 내용 (있으면)
  if (notes) {
    ws.getCell('A57').value = notes;
    ws.getCell('A57').alignment = { vertical: "top", horizontal: "left", wrapText: true };
  }
  
  styleRange(ws, 56, 1, 58, 10, { font: fontDefault, alignment: alignLeftTop, border: borderThin, fill: fillWhite });

  // 회사명 J59
  ws.getCell('J59').value = '(주)삼미앵글산업';
  ws.getCell('J59').font = { ...fontDefault, size: 10 };
  ws.getCell('J59').alignment = alignCenter;

  // 전체 테두리(5~59행)
  fullBorder(ws, 5, 59, 1, 10);
}

/** 도장 이미지 배치(H7 근처) */
async function placeStamp(workbook, ws) {
  try {
    const base64 = await fetchAsBase64Pure(STAMP_URL);
    const imgId = workbook.addImage({ base64, extension: 'png' });
    // 적당히 보이도록 H7:I9 영역에 배치
    ws.addImage(imgId, {
      tl: { col: 9.5, row: 6.4 }, // J7 박이삭 이름 옆 (0-index 기준)
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
    documentNumber: rawData?.documentNumber || '',
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
  styleRange(ws, 5, 1, ws.rowCount, 10, { alignment: alignCenter });
  
  // 도장 이미지
  await placeStamp(workbook, ws);

  // 파일 쓰기 & 다운로드
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = generateFileName(
    type === 'delivery' ? 'delivery' : type === 'purchase' ? 'purchase' : 'estimate',
    rawData?.documentNumber || ''
  );
  saveAs(blob, fileName);
}

/**
 * ✅ 견적서 출력 시 재고 감소 연동
 */
export const exportEstimateWithInventory = async (formData, cartData, fileName) => {
  try {
    await exportToExcel(formData, 'estimate');
    console.log('✅ 견적서 Excel 출력 완료');
    return { success: true, message: '견적서 출력 완료' };
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
    await exportToExcel(formData, 'purchase');
    console.log('✅ 청구서 Excel 출력 완료');
    return { success: true, message: '청구서 출력 완료' };
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
    await exportToExcel(formData, 'delivery');
    console.log('✅ 거래명세서 Excel 출력 완료');
    return { success: true, message: '거래명세서 출력 완료' };
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
      await exportToExcel(formData, documentType);
      return { success: true, message: '문서 출력 완료' };
  }
};

// 호환용 default export 묶음 (원하면 import default로도 쓸 수 있게)
export default { exportToExcel, generateFileName };
