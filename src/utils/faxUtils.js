// src/utils/faxUtils.js
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * DOM 요소를 PDF로 변환하고 Base64 문자열 반환
 * @param {HTMLElement} element - 변환할 DOM 요소
 * @returns {Promise<string>} PDF Base64 문자열
 */
export const convertDOMToPDFBase64 = async (element) => {
  if (!element) {
    throw new Error('DOM 요소를 찾을 수 없습니다.');
  }

  // ✅ 1단계: 인쇄 시 숨겨야 할 요소들 선택
  const hiddenElements = element.querySelectorAll('.no-print');
  const originalDisplayValues = [];

  // ✅ 프린트 미디어 쿼리를 적용하기 위한 임시 스타일
  const printStyleElement = document.createElement('style');
  printStyleElement.textContent = `
    /* ✅ 프린트 스타일을 화면에 강제 적용 */
    @media screen {
      /* no-print 요소 숨김 */
      .no-print {
        display: none !important;
      }
      
      /* 프린트 스타일을 화면에 적용 */
      .purchase-order-form-container {
        transform: scale(0.90) !important;
        transform-origin: top left !important;
        max-width: 100% !important;
        width: 100% !important;
        padding: 8mm 8mm 6mm !important;
        margin: 0 !important;
        background: #fff !important;
        min-height: auto !important;
        box-sizing: border-box;
        font-size: 12px !important;
        line-height: 1.25 !important;
      }
      
      .form-header h1 { 
        font-size: 20px !important; 
        margin-bottom: 6px !important; 
      }
      
      .form-table {
        font-size: 11px !important;
        margin-bottom: 10px !important;
      }
      
      .form-table th,
      .form-table td {
        padding: 8px 4px !important;  /* 4px → 8px */
        line-height: 1.7 !important;  /* 1.2 → 1.7 */
        vertical-align: middle !important;  /* 추가 */
      }

      /* ✅ info-table (상단 회사정보) 특별 처리 */
      .info-table input,
      .info-table textarea {
        font-size: 13px !important;  /* 더 크게 */
        padding: 5px 4px !important;
        font-weight: 500 !important;
      }
  
      /* ✅ 거래번호 input 크기 증가 */
      .info-table input[type="text"] {
        min-height: 28px !important;
      }
      
      /* ✅ 메모 textarea 높이 증가 */
      .estimate-memo {
        min-height: 70px !important;
        padding: 8px 4px !important;
        font-size: 13px !important;
      }

      input, textarea {
        border: none !important;
        background: transparent !important;
        box-shadow: none !important;
        outline: none !important;
        font-size: 13px !important;  /* 11px → 13px */
        padding: 6px 4px !important;  /* 2px → 6px */
        line-height: 1.5 !important;  /* 추가 */
        height: auto !important;  /* 추가 */
        min-height: 25px !important;  /* 추가 */
      }
      
      .total-table {
        width: 240px !important;
        margin-bottom: 8px !important;
      }
      
      .form-company {
        margin-top: 20px !important;
        padding-top: 10px !important;
        font-size: 14px !important;
      }
      
      .order-table th:last-child,
      .order-table td:last-child,
      .bom-table th:last-child,
      .bom-table td:last-child { 
        display: none !important; 
      }
      
      /* 품목 목록 프린트 비율 */
      .order-table { 
        table-layout: fixed !important; 
        width: 100% !important; 
      }
      .order-table th:nth-child(1), .order-table td:nth-child(1) { width: 5% !important; }
      .order-table th:nth-child(2), .order-table td:nth-child(2) { width: 41.5% !important; }
      .order-table th:nth-child(3), .order-table td:nth-child(3) { width: 11% !important; }
      .order-table th:nth-child(4), .order-table td:nth-child(4) { width: 5.5% !important; min-width: 12px !important; white-space: nowrap !important; }
      .order-table th:nth-child(5), .order-table td:nth-child(5) { width: 12% !important; min-width: 70px !important; }
      .order-table th:nth-child(6), .order-table td:nth-child(6) { width: 11% !important; min-width: 60px !important; }
      .order-table th:nth-child(7), .order-table td:nth-child(7) { width: 11% !important; min-width: 60px !important; }
      .order-table th:nth-child(8), .order-table td:nth-child(8) { width: 3% !important; min-width: 28px !important; }
      
      .order-table th:nth-child(5),
      .order-table th:nth-child(6),
      .order-table th:nth-child(7),
      .order-table td:nth-child(5),
      .order-table td:nth-child(6),
      .order-table td:nth-child(7) {
        white-space: nowrap !important;
        font-feature-settings: 'tnum' 1;
        text-align: right !important;
        padding: 2px 6px !important;
        letter-spacing: 0 !important;
      }
      .order-table th:nth-child(5) { 
        text-align: center !important; 
      }
      
      /* BOM 프린트 비율 */
      .bom-table { 
        table-layout: fixed !important; 
        width: 100% !important; 
      }
      .bom-table th:nth-child(1), .bom-table td:nth-child(1) { width: 5% !important; }
      .bom-table th:nth-child(2), .bom-table td:nth-child(2) { width: 38% !important; }
      .bom-table th:nth-child(3), .bom-table td:nth-child(3) { width: 38% !important; }
      .bom-table th:nth-child(4), .bom-table td:nth-child(4) { width: 10% !important; min-width: 70px !important; }
      .bom-table th:nth-child(5), .bom-table td:nth-child(5) { width: 0% !important; display: none !important; }
      .bom-table th:nth-child(6), .bom-table td:nth-child(6) { width: 0% !important; display: none !important; }
      .bom-table th:nth-child(7), .bom-table td:nth-child(7) { width: 9% !important; min-width: 55px !important; }
      .bom-table th:nth-child(8), .bom-table td:nth-child(8) { width: 0% !important; }
      
      .bom-table th:nth-child(4),
      .bom-table th:nth-child(5),
      .bom-table th:nth-child(6),
      .bom-table th:nth-child(7),
      .bom-table td:nth-child(4),
      .bom-table td:nth-child(5),
      .bom-table td:nth-child(6),
      .bom-table td:nth-child(7) {
        white-space: nowrap !important;
        font-feature-settings: 'tnum' 1;
        text-align: right !important;
        padding: 2px 6px !important;
      }
      
      .order-table th, .order-table td,
      .bom-table th, .bom-table td {
        word-break: break-word !important;
      }
      
      /* 도장 이미지 */
      .rep-cell {
        position: relative !important;
        overflow: visible !important;
      }
      
      .stamp-inline {
        position: absolute !important;
        top: -15px !important;
        right: -30px !important;
        width: 80px !important;
        height: 80px !important;
        z-index: 999 !important;
        opacity: 0.8 !important;
      }
    }
  `;

  try {
    // ✅ 2단계: 모든 no-print 요소를 임시로 숨김
    hiddenElements.forEach((el, index) => {
      originalDisplayValues[index] = el.style.display;
      el.style.display = 'none';
    });

    // ✅ 3단계: 프린트 스타일 적용
    document.head.appendChild(printStyleElement);

    // ✅ 4단계: 스타일 적용을 위해 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 200));

    // ✅ 5단계: html2canvas로 DOM을 이미지로 변환
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1200,
      windowHeight: element.scrollHeight,
      ignoreElements: (element) => {
        return element.classList.contains('no-print');
      }
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    
    // ✅ 6단계: A4 크기로 PDF 생성
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const pdfBase64 = pdf.output('datauristring').split(',')[1];
    return pdfBase64;

  } catch (error) {
    console.error('❌ PDF 변환 오류:', error);
    throw new Error('PDF 변환에 실패했습니다.');
  } finally {
    // ✅ 7단계: 임시 스타일 제거
    if (printStyleElement.parentNode) {
      printStyleElement.parentNode.removeChild(printStyleElement);
    }

    // ✅ 8단계: 숨긴 요소들 복원
    hiddenElements.forEach((el, index) => {
      el.style.display = originalDisplayValues[index];
    });
  }
};

/**
 * PDF Base64를 Blob URL로 변환 (미리보기용)
 * @param {string} base64 - PDF Base64 문자열
 * @returns {string} Blob URL
 */
export const base64ToBlobURL = (base64) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};

/**
 * Vercel 팩스 서버로 팩스 전송
 * @param {string} pdfBase64 - PDF Base64 문자열
 * @param {string} faxNumber - 팩스 번호
 * @param {string} companyName - 상호명 (선택)
 * @param {string} receiverName - 수신자명 (선택)
 * @returns {Promise<Object>} 전송 결과
 */
export const sendFax = async (pdfBase64, faxNumber, companyName, receiverName) => {
  try {
    const response = await fetch('https://fax-server-git-main-knowgrams-projects.vercel.app/api/send-fax', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdfBase64: pdfBase64,
        faxNumber: faxNumber,
        companyName: companyName,
        receiverName: receiverName
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.message || '팩스 전송 실패');
    }

    return result;
  } catch (error) {
    console.error('❌ 팩스 전송 오류:', error);
    throw error;
  }
};

