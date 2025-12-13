// src/components/FaxPreviewModal.jsx
import React, { useState, useEffect } from 'react';
import '../styles/FaxPreviewModal.css';

const FaxPreviewModal = ({ pdfBlobURL, onClose, onSendFax }) => {
  const [faxNumber, setFaxNumber] = useState('');
  const [isSending, setIsSending] = useState(false);

  // 모달 열릴 때 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleSend = async () => {
    if (!faxNumber.trim()) {
      alert('팩스 번호를 입력해주세요.');
      return;
    }

    // 팩스번호 유효성 검사 (숫자, 하이픈만 허용)
    const faxRegex = /^[0-9-]+$/;
    if (!faxRegex.test(faxNumber)) {
      alert('팩스 번호는 숫자와 하이픈(-)만 입력 가능합니다.\n예: 02-1234-5678');
      return;
    }

    setIsSending(true);
    
    try {
      await onSendFax(faxNumber);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fax-preview-modal-overlay" onClick={onClose}>
      <div className="fax-preview-modal-container" onClick={(e) => e.stopPropagation()}>
        
        {/* 헤더 */}
        <div className="fax-preview-header">
          <h2>📄 팩스 전송 미리보기</h2>
          <button className="fax-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* PDF 미리보기 영역 */}
        <div className="fax-preview-content">
          <iframe
            src={pdfBlobURL}
            title="PDF 미리보기"
            className="fax-preview-iframe"
          />
        </div>

        {/* 팩스번호 입력 및 전송 버튼 */}
        <div className="fax-input-area">
          <div className="fax-input-group">
            <label htmlFor="fax-number-input">📞 팩스 번호</label>
            <input
              id="fax-number-input"
              type="text"
              value={faxNumber}
              onChange={(e) => setFaxNumber(e.target.value)}
              placeholder="예: 02-1234-5678"
              disabled={isSending}
              className="fax-number-input"
            />
          </div>

          <div className="fax-action-buttons">
            <button
              className="fax-cancel-btn"
              onClick={onClose}
              disabled={isSending}
            >
              취소
            </button>
            <button
              className="fax-send-btn"
              onClick={handleSend}
              disabled={isSending}
            >
              {isSending ? '전송 중...' : '📤 팩스 전송'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FaxPreviewModal;
