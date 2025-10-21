import { extractSubtotal } from './subtotalPolicy';

function extractLast4Digits(contactStr) {
  if (!contactStr) return '';
  const nums = String(contactStr).replace(/\D/g, '');
  return nums.slice(-4) || '';
}

function random4digits() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// 견적서 데이터 포맷팅
export const formatEstimateData = (formData, cart, cartTotal) => {
  const currentDate = new Date().toISOString().split('T')[0];
  const last4 = extractLast4Digits(formData?.contactInfo);
  const estimateNumber = `EST-${currentDate.replace(/-/g, '')}-${last4 || random4digits()}`;

  const items = (cart || []).map(cartItem => {
    const { type, options, quantity, price } = cartItem;

    let productName = type || '';
    if (options?.version) productName += ` (${options.version})`;
    if (options?.color) productName += ` (${options.color})`;

    let specification = '';
    if (options?.size) specification += options.size;
    if (options?.height) specification += ` × ${options.height}`;
    if (options?.level) specification += ` × ${options.level}`;

    const qty = quantity ?? 1;
    const unitPrice = qty > 0 ? Math.floor(price / qty) : 0;

    return {
      name: productName,
      specification,
      unit: 'set',
      quantity: qty,
      unitPrice,
      totalPrice: price,
      note: ''
    };
  });

  // 견적서는 현재 별도의 BOM(materials) 구조를 받지 않으므로 itemSum만.
  const itemSum = items.reduce((s, it) => s + (Number(it.totalPrice) || 0), 0);
  let subtotal = extractSubtotal({
    itemSum,
    matSum: 0,
    materialCount: 0,
    policy: 'BOM_ONLY_WITH_ITEM_FALLBACK'
  });
  // cartTotal fallback (혹시 외부 전달값이 더 신뢰도 있을 경우)
  if (!subtotal && cartTotal) subtotal = Number(cartTotal) || 0;

  const tax = Math.floor(subtotal * 0.1);
  const totalAmount = subtotal + tax;

  return {
    date: formData?.date || currentDate,
    estimateNumber,
    companyName: formData?.companyName || '',
    contactPerson: formData?.contactPerson || '',
    customerName: formData?.customerName || '',
    contactInfo: formData?.contactInfo || '',
    items,
    notes: formData?.notes || '',
    subtotal,
    tax,
    totalAmount
  };
};

// 청구서(발주/주문) 데이터 포맷팅
export const formatPurchaseOrderData = (formData, cart, materials, cartTotal) => {
  const currentDate = new Date().toISOString().split('T')[0];
  const last4 = extractLast4Digits(formData?.contactInfo);
  const orderNumber = formData?.orderNumber || `PO-${currentDate.replace(/-/g, '')}-${last4 || random4digits()}`;

  const items = (cart || []).map(cartItem => {
    const { type, options, quantity, price } = cartItem;

    let productName = type || '';
    if (options?.version) productName += ` (${options.version})`;
    if (options?.color) productName += ` (${options.color})`;

    let specification = '';
    if (options?.size) specification += options.size;
    if (options?.height) specification += ` × ${options.height}`;
    if (options?.level) specification += ` × ${options.level}`;

    const qty = quantity ?? 1;
    const unitPrice = qty > 0 ? Math.floor(price / qty) : 0;

    return {
      name: productName,
      specification,
      unit: 'set',
      quantity: qty,
      unitPrice,
      totalPrice: price,
      note: ''
    };
  });

  const materialItems = (materials || []).map(material => {
    let specification = material.specification || '';
    if (!specification && typeof material.name === 'string') {
      const match = material.name.match(/\(([^)]+)\)/);
      if (match && /[\d]/.test(match[1])) {
        specification = match[1];
      }
    }
    return {
      name: material.name || '',
      specification,
      unit: material.unit || 'ea',
      quantity: material.quantity || 0,
      unitPrice: material.unitPrice || 0,
      totalPrice: (material.unitPrice || 0) * (material.quantity || 0),
      note: material.note || ''
    };
  });

  const itemSum = items.reduce((s, it) => s + (Number(it.totalPrice) || 0), 0);
  const matSum = materialItems.reduce((s, it) => s + (Number(it.totalPrice) || 0), 0);

  const subtotal = extractSubtotal({
    itemSum,
    matSum,
    materialCount: materialItems.length,
    policy: 'BOM_ONLY_WITH_ITEM_FALLBACK'
  });

  const tax = Math.floor(subtotal * 0.1);
  const totalAmount = subtotal + tax;

  return {
    date: formData?.date || currentDate,
    orderNumber,
    companyName: formData?.companyName || '',
    contactPerson: formData?.contactPerson || '',
    customerName: formData?.customerName || '',
    contactInfo: formData?.contactInfo || '',
    items,
    materials: materialItems,
    notes: formData?.notes || '',
    subtotal,
    tax,
    totalAmount
  };
};

// 프린트 페이지로 이동
export const navigateToPrintPage = (type, data, navigate) => {
  try {
    const encodedData = encodeURIComponent(JSON.stringify(data));
    const printUrl = `/print?type=${type}&data=${encodedData}`;
    const openInNewWindow = false;
    if (openInNewWindow) {
      const printWindow = window.open(printUrl, '_blank', 'width=800,height=600');
      if (!printWindow) navigate(printUrl);
    } else {
      navigate(printUrl);
    }
  } catch (error) {
    console.error('프린트 페이지 이동 오류:', error);
    alert('프린트 페이지로 이동하는 중 오류가 발생했습니다.');
  }
};

export const checkPrintSupport = () => {
  return typeof window !== 'undefined' && 'print' in window;
};

export const optimizePrintSettings = () => {
  if (typeof window !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        * {
          -webkit-print-color-adjust: exact !important;
          color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
};
