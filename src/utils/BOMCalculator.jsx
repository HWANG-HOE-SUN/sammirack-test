import React, { useContext, useEffect, useState } from 'react';
import { useProduct } from './ProductContext';

const COMPONENT_NAME_MAP = {
  // 스탠랙 부품
  'upright_frame_st': '스텐드 수직프레임',
  'shelf_st': '스텐드 선반',
  'bolt_set_st': '스텐드 볼트세트',
  
  // 하이랙 부품
  'upright_frame_hr_270': '하이랙 수직프레임(270kg)',
  'upright_frame_hr_450': '하이랙 수직프레임(450kg)',
  'upright_frame_hr_500': '하이랙 수직프레임(500kg)',
  'shelf_hr_270': '하이랙 선반(270kg)',
  'shelf_hr_450': '하이랙 선반(450kg)',
  'load_beam_hr_500': '하이랙 로드빔(500kg)',
  'cross_beam_hr': '하이랙 크로스빔',
  'safety_pin_hr': '하이랙 안전핀'
};

export class BOMCalculatorCore {
  calculateBOM(productType, selections, quantity = 1) {
    if (!selections || !productType) return [];

    let bomItems = [];
    switch (productType) {
      case 'stand':
        bomItems = this.calculateStainlessRackBOM(selections);
        break;
      case 'high':
        bomItems = this.calculateHighRackBOM(selections);
        break;
      case 'light':
      case 'heavy':
      case 'pallet':
        return this.getPredefinedBOM(productType, selections, quantity);
      default:
        return [];
    }

    return bomItems.map(item => ({
      ...item,
      quantity: item.quantity * quantity,
      name: COMPONENT_NAME_MAP[item.code] || item.code
    }));
  }

  calculateStainlessRackBOM(selections) {
    const { size, height, level } = selections;
    if (!size || !height || !level) return [];

    const components = [];
    const levelCount = parseInt(level.replace('단', ''), 10) || 0;

    components.push({ 
      code: 'upright_frame_st',
      quantity: 4,
      options: { height },
      spec: `높이 ${height}`
    });

    components.push({ 
      code: 'shelf_st',
      quantity: levelCount,
      options: { size },
      spec: `크기 ${size}`
    });

    components.push({ 
      code: 'bolt_set_st',
      quantity: 1,
      options: {},
      spec: '표준'
    });

    return components.filter(item => item.quantity > 0);
  }

  calculateHighRackBOM(selections) {
    const { size, height, level, color } = selections;
    if (!size || !height || !level || !color) return [];

    const components = [];
    const levelCount = parseInt(level.replace('단', ''), 10) || 0;
    const is500kg = color.includes('500kg');
    const is450kg = color.includes('450kg');

    if (is500kg) {
      components.push({ 
        code: 'upright_frame_hr_500',
        quantity: 2,
        options: { height },
        spec: `높이 ${height}`
      });

      components.push({ 
        code: 'load_beam_hr_500',
        quantity: levelCount * 2,
        options: { size },
        spec: `크기 ${size}`
      });

      components.push({ 
        code: 'safety_pin_hr',
        quantity: levelCount * 4,
        options: {},
        spec: '표준'
      });
    } else {
      const poleCode = is450kg ? 'upright_frame_hr_450' : 'upright_frame_hr_270';
      const shelfCode = is450kg ? 'shelf_hr_450' : 'shelf_hr_270';
      
      components.push({ 
        code: poleCode,
        quantity: 4,
        options: { height },
        spec: `높이 ${height}`
      });

      components.push({ 
        code: shelfCode,
        quantity: levelCount,
        options: { size },
        spec: `크기 ${size}`
      });

      components.push({ 
        code: 'cross_beam_hr',
        quantity: levelCount * 2,
        options: { size },
        spec: `크기 ${size}`
      });

      components.push({ 
        code: 'safety_pin_hr',
        quantity: levelCount * 4,
        options: {},
        spec: '표준'
      });
    }

    return components.filter(item => item.quantity > 0);
  }

  getPredefinedBOM(productType, selections, quantity) {
    const { bomData } = window; // global bomData 접근

    if (!bomData || !bomData[productType]) return [];

    const { size, height, level, formType } = selections;
    const bomList = bomData[productType];

    const matchedBOM = bomList.find(item => 
      item.size === size &&
      item.height === height &&
      item.level === level &&
      item.formType === formType
    );

    if (!matchedBOM) return [];

    return matchedBOM.components.map(component => ({
      code: component.code,
      name: component.name, // bom_data.json에 정의된 한글 이름 사용
      quantity: component.quantity * quantity,
      spec: component.spec,
      unitPrice: component.unitPrice,
      totalPrice: component.unitPrice * component.quantity * quantity
    }));
  }
}

const BOMCalculator = () => {
  const { selectedType, selectedOptions, quantity } = useProduct();
  const [bomItems, setBomItems] = useState([]);
  const calculator = new BOMCalculatorCore();

  useEffect(() => {
    if (selectedType && selectedOptions && quantity) {
      const result = calculator.calculateBOM(selectedType, selectedOptions, quantity);
      setBomItems(result);
    } else {
      setBomItems([]);
    }
  }, [selectedType, selectedOptions, quantity]);

  if (!bomItems.length) return null;

  return (
    <div className="bom-calculator">
      <h3>원자재 명세서 (BOM)</h3>
      <table>
        <thead>
          <tr>
            <th>품명</th>
            <th>규격</th>
            <th>수량</th>
            <th>단위</th>
            <th>단가</th>
            <th>금액</th>
          </tr>
        </thead>
        <tbody>
          {bomItems.map((item, index) => (
            <tr key={index}>
              <td>{item.name || item.code}</td>
              <td>{item.spec || '-'}</td>
              <td>{item.quantity.toLocaleString()}</td>
              <td>개</td>
              <td>{item.unitPrice ? item.unitPrice.toLocaleString() + '원' : '-'}</td>
              <td>{item.totalPrice ? item.totalPrice.toLocaleString() + '원' : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default BOMCalculator;
