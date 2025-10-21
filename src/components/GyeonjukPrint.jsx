import React from 'react';
const stampImage = `${import.meta.env.BASE_URL}images/도장.png`;

const GyeonjukPrint = ({ data }) => {
  return (
    <div className="print-container gyeonjuk-print print-only">
      <div className="print-preview-notice">
        프린트 미리보기 - 실제 인쇄 시 이 메시지는 표시되지 않습니다
      </div>

      {/* 제목 */}
      <h1>견&nbsp;&nbsp;&nbsp;&nbsp;적&nbsp;&nbsp;&nbsp;&nbsp;서</h1>

      {/* 상단 정보 - 좌우 2분할 */}
      <table className="print-table info-table">
        <tbody>
          <tr>
            <td className="label">거래일자</td>
            <td>{data?.date || ''}</td>
            <td className="label">사업자등록번호</td>
            <td>232-81-01750</td>
          </tr>
          <tr>
            <td className="label">상호명</td>
            <td>{data?.companyName || ''}</td>
            <td className="label">상호</td>
            <td>삼미앵글랙산업</td>
          </tr>
          <tr>
            <td colSpan={2} rowSpan={4} style={{
              textAlign: 'center',
              fontWeight: 'bold',
              verticalAlign: 'middle',
              padding: '2px 0',
              background: '#fff',
              border: '1px solid #ddd',
              fontSize: '10px',
              lineHeight: '1.1'
            }}>
              아래와 같이 견적합니다 (부가세, 운임비 별도)
            </td>
            <td className="label">대표자</td>
            <td>
              <span>박이삭</span>
              <img src={stampImage} alt="도장" style={{ width: '45px', height: '45px', marginLeft: '6px', verticalAlign: 'middle', opacity: 0.8 }} />
            </td>
          </tr>
          <tr>
            <td className="label">소재지</td>
            <td>경기도 광명시 원노온사로 39, 철제 스틸하우스 1</td>
          </tr>
          <tr>
            <td className="label">TEL</td>
            <td>010-9548-9578  010-4311-7733</td>
          </tr>
          <tr>
            <td className="label">FAX</td>
            <td>(02)2611-4595</td>
          </tr>
          <tr>
            <td className="label">홈페이지</td>
            <td>http://www.ssmake.com</td>
          </tr>
        </tbody>
      </table>

      {/* 구분 바 */}
      <div className="section-divider">견적명세</div>

      {/* 견적 명세 */}
      <table className="print-table quote-table">
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
          {data?.items?.map((item, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td className="left">{item.name || ''}</td>
              <td>{item.specification || ''}</td>
              <td>{item.unit || ''}</td>
              <td>{item.quantity || ''}</td>
              <td className="right">{item.unitPrice ? item.unitPrice.toLocaleString() : ''}</td>
              <td className="right">{item.totalPrice ? item.totalPrice.toLocaleString() : ''}</td>
              <td>{item.note || ''}</td>
            </tr>
          )) || []}

          {/* 빈 행들로 20행 채우기 */}
          {Array.from({ length: Math.max(0, 20 - (data?.items?.length || 0)) }, (_, index) => (
            <tr key={`empty-${index}`}>
              <td>{(data?.items?.length || 0) + index + 1}</td>
              <td className="left">&nbsp;</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 합계 */}
      <table className="print-table">
        <tbody>
          <tr>
            <td className="label">소계</td>
            <td className="right">{data?.subtotal ? data.subtotal.toLocaleString() : '0'}</td>
          </tr>
          <tr>
            <td className="label">부가세</td>
            <td className="right">{data?.tax ? data.tax.toLocaleString() : '0'}</td>
          </tr>
          <tr>
            <td className="label"><strong>합계</strong></td>
            <td className="right"><strong>{data?.totalAmount ? data.totalAmount.toLocaleString() : '0'}</strong></td>
          </tr>
        </tbody>
      </table>

      {/* 비고 */}
      <div className="print-notes">
        {data?.notes || ''}
      </div>

      {/* 하단 회사명 */}
      <div className="print-company">(주)삼미앵글랙산업</div>
    </div>
  );
};

export default GyeonjukPrint;
