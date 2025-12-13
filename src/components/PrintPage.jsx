import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import GyeonjukPrint from './GyeonjukPrint';
import BaljuPrint from './BaljuPrint';
// import { exportEstimateToExcel, exportPurchaseOrderToExcel } from '../utils/excelUtils';
import '../styles/PrintStyles.css';

const PrintPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [printData, setPrintData] = useState(null);
  const printExecutedRef = useRef(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    // URL 파라미터에서 데이터 추출
    const type = searchParams.get('type');
    const dataParam = searchParams.get("data");
    if (!type) {
      console.error("프린트 타입이 없습니다.");
      navigate(-1);
      return;
    }

    let decodedData;
    if (dataParam) {
      try {
        decodedData = JSON.parse(decodeURIComponent(dataParam));
      } catch (error) {
        console.error("URL 데이터 파싱 오류:", error);
        navigate(-1);
        return;
      }
    } else {
      // localStorage에서 데이터 로드 (이전 버전 호환성)
      const storedData = localStorage.getItem("printData");
      if (storedData) {
        try {
          decodedData = JSON.parse(storedData);
          localStorage.removeItem("printData"); // 사용 후 삭제
        } catch (error) {
          console.error("localStorage 데이터 파싱 오류:", error);
          navigate(-1);
          return;
        }
      } else {
        console.error("프린트할 데이터가 없습니다.");
        navigate(-1);
        return;
      }
    }
    setPrintData(decodedData);

    // CSS 로딩 완료 대기 및 DOM 렌더링 완료 보장
    const checkStylesAndRender = () => {
      // 스타일시트 로딩 확인
      const styleSheets = Array.from(document.styleSheets);
      const printStylesLoaded = styleSheets.some(sheet => {
        try {
          return sheet.href && (sheet.href.includes('PrintStyles') || sheet.href.includes('index'));
        } catch (e) {
          return false;
        }
      });

      // DOM 요소 렌더링 확인
      const printContainer = document.querySelector('.print-container');
      const hasContent = printContainer && printContainer.children.length > 0;

      if ((printStylesLoaded || styleSheets.length > 0) && hasContent) {
        setIsLoading(false);
        // 추가 지연으로 완전한 렌더링 보장
        timeoutRef.current = setTimeout(() => {
          executePrint();
        }, 1000); // 500ms에서 1000ms로 증가
      } else {
        // 재시도
        setTimeout(checkStylesAndRender, 200); // 100ms에서 200ms로 증가
      }
    };

    // 초기 지연 후 체크 시작
    setTimeout(checkStylesAndRender, 300);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [searchParams, navigate]);

  const executePrint = () => {
    if (printExecutedRef.current) return;
    printExecutedRef.current = true;

    // 프린트 전 스타일 강제 적용
    const printContainer = document.querySelector('.print-container');
    if (printContainer) {
      printContainer.style.visibility = 'visible';
      printContainer.style.display = 'block';
    }

    // 프린트 이벤트 리스너 등록
    const handleAfterPrint = () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      handlePrintComplete();
    };

    const handleBeforePrint = () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      // 프린트 시작 시 미리보기 메시지 숨기기
      const previewNotices = document.querySelectorAll('.print-preview-notice');
      previewNotices.forEach(notice => {
        notice.style.display = 'none';
      });
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    // 프린트 실행
    try {
      window.print();
    } catch (error) {
      console.error('프린트 실행 오류:', error);
      handlePrintComplete();
    }

    // 타임아웃으로 안전장치 설정 (30초)
    setTimeout(() => {
      if (printExecutedRef.current) {
        window.removeEventListener('afterprint', handleAfterPrint);
        window.removeEventListener('beforeprint', handleBeforePrint);
        handlePrintComplete();
      }
    }, 30000);
  };

  const handlePrintComplete = () => {
    // 브라우저 히스토리가 있으면 뒤로 가기, 없으면 창 닫기 시도
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      try {
        window.close();
      } catch (error) {
        // 창 닫기 실패 시 홈으로 이동
        navigate('/');
      }
    }
  };

  const handleManualPrint = () => {
    if (!printExecutedRef.current) {
      executePrint();
    }
  };

  const handleExcelExport = () => {
    const type = searchParams.get('type');
    if (type === 'gyeonjuk') {
      // exportEstimateToExcel(printData);
      console.log('견적서 엑셀 내보내기');
    } else if (type === 'balju') {
      // exportPurchaseOrderToExcel(printData);
      console.log('발주서 엑셀 내보내기');
    }
  };

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        fontFamily: '"Malgun Gothic", "Arial", sans-serif'
      }}>
        <div>프린트 준비 중...</div>
        <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
          잠시만 기다려주세요.
        </div>
      </div>
    );
  }

  const type = searchParams.get('type');

  return (
    <div>
      {/* 수동 프린트 버튼 (자동 프린트 실패 시 대비) */}
      <div className="no-print" style={{ 
        position: 'fixed', 
        top: '10px', 
        right: '10px', 
        zIndex: 1000,
        display: 'flex',
        gap: '10px'
      }}>
        <button 
          onClick={handleManualPrint}
          style={{
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: '"Malgun Gothic", "Arial", sans-serif'
          }}
        >
          프린트
        </button>
        <button 
          onClick={handleExcelExport}
          style={{
            padding: '8px 16px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: '"Malgun Gothic", "Arial", sans-serif'
          }}
        >
          엑셀 저장
        </button>
        <button 
          onClick={() => navigate(-1)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: '"Malgun Gothic", "Arial", sans-serif'
          }}
        >
          닫기
        </button>
      </div>

      {/* 프린트 컴포넌트 렌더링 */}
      {type === 'gyeonjuk' && <GyeonjukPrint data={printData} />}
      {type === 'balju' && <BaljuPrint data={printData} />}
    </div>
  );
};

export default PrintPage;
