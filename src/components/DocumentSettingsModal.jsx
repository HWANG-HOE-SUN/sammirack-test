import React, { useState, useEffect } from 'react';
import '../styles/DocumentSettingsModal.css';
import { getDocumentSettings, saveDocumentSettings, resetDocumentSettings } from '../utils/documentSettings';

/**
 * 문서 양식 설정 모달
 * - 관리자만 접근 가능
 * - 사업자등록번호, 상호, 대표자, 소재지, TEL, FAX, 홈페이지 수정
 */
const DocumentSettingsModal = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState({
    bizNumber: '',
    companyName: '',
    ceo: '',
    address: '',
    tel: '',
    fax: '',
    website: ''
  });

  useEffect(() => {
    if (isOpen) {
      const currentSettings = getDocumentSettings();
      setSettings(currentSettings);
    }
  }, [isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = () => {
    const success = saveDocumentSettings(settings);
    if (success) {
      alert('문서 양식 설정이 저장되었습니다.\n새로 작성되는 문서부터 적용됩니다.');
      onClose();
    } else {
      alert('설정 저장에 실패했습니다.');
    }
  };

  const handleReset = () => {
    if (window.confirm('문서 양식 설정을 기본값으로 초기화하시겠습니까?')) {
      const success = resetDocumentSettings();
      if (success) {
        const defaultSettings = getDocumentSettings();
        setSettings(defaultSettings);
        alert('기본값으로 초기화되었습니다.');
      } else {
        alert('초기화에 실패했습니다.');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>📝 문서 양식 설정</h2>
          <button className="settings-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-modal-body">
          <p className="settings-info">
            ⚠️ 이 설정은 새로 작성되는 문서에만 적용됩니다.<br/>
            기존에 저장된 문서는 영향을 받지 않습니다.
          </p>

          <div className="settings-form">
            <div className="settings-field">
              <label>사업자등록번호</label>
              <input
                type="text"
                name="bizNumber"
                value={settings.bizNumber}
                onChange={handleChange}
                placeholder="예: 232-81-01750"
              />
            </div>

            <div className="settings-field">
              <label>상호</label>
              <input
                type="text"
                name="companyName"
                value={settings.companyName}
                onChange={handleChange}
                placeholder="예: 삼미앵글랙산업"
              />
            </div>

            <div className="settings-field">
              <label>대표자</label>
              <input
                type="text"
                name="ceo"
                value={settings.ceo}
                onChange={handleChange}
                placeholder="예: 박이삭"
              />
            </div>

            <div className="settings-field">
              <label>소재지</label>
              <input
                type="text"
                name="address"
                value={settings.address}
                onChange={handleChange}
                placeholder="예: 경기도 광명시 원노온사로 39, 철제 스틸하우스 1"
              />
            </div>

            <div className="settings-field">
              <label>TEL</label>
              <input
                type="text"
                name="tel"
                value={settings.tel}
                onChange={handleChange}
                placeholder="예: 010-9548-9578 010-4311-7733"
              />
            </div>

            <div className="settings-field">
              <label>FAX</label>
              <input
                type="text"
                name="fax"
                value={settings.fax}
                onChange={handleChange}
                placeholder="예: (02)2611-4595"
              />
            </div>

            <div className="settings-field">
              <label>홈페이지</label>
              <input
                type="text"
                name="website"
                value={settings.website}
                onChange={handleChange}
                placeholder="예: http://www.ssmake.com"
              />
            </div>
          </div>
        </div>

        <div className="settings-modal-footer">
          <button className="settings-btn-reset" onClick={handleReset}>
            🔄 기본값으로 초기화
          </button>
          <div className="settings-btn-group">
            <button className="settings-btn-cancel" onClick={onClose}>
              취소
            </button>
            <button className="settings-btn-save" onClick={handleSave}>
              💾 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentSettingsModal;
