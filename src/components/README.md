# BOM Display Component

## Overview
The BOMDisplay component calculates and displays the Bill of Materials (BOM) for rack products based on their type and selected options. It uses the BOMCalculator utility to determine the required components and displays them in a tabular format.

## Features
- Dynamic calculation of components based on product selection
- Tabular display with component type, description, quantity, and unit
- Support for different rack types (스텐랙, 하이랙)
- Compact mode for space-constrained contexts
- Optional title display
- Print-friendly styles
- Responsive error handling

## Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `productType` | string | - | The type of rack ('스텐랙' or '하이랙') |
| `selectedOptions` | object | - | Selected product options (size, height, level, color) |
| `quantity` | number | 1 | Number of racks to calculate for |
| `showTitle` | boolean | true | Whether to show the component title |
| `compact` | boolean | false | Whether to use compact display mode |

## Usage Examples

### Basic Usage
```jsx
import BOMDisplay from './components/BOMDisplay';

// Inside your component
const MyComponent = () => {
  const productType = '스텐랙';
  const selectedOptions = {
    size: '50x75',
    height: '180',
    level: '3단'
  };
  
  return (
    <BOMDisplay
      productType={productType}
      selectedOptions={selectedOptions}
      quantity={1}
    />
  );
};
```

### Compact Mode
```jsx
<BOMDisplay
  productType={productType}
  selectedOptions={selectedOptions}
  quantity={quantity}
  compact={true}
/>
```

### Without Title
```jsx
<BOMDisplay
  productType={productType}
  selectedOptions={selectedOptions}
  quantity={quantity}
  showTitle={false}
/>
```

### High Rack Example
```jsx
<BOMDisplay
  productType="하이랙"
  selectedOptions={{
    size: "75x100",
    height: "210",
    level: "4단",
    color: "700kg 블루"
  }}
  quantity={2}
/>
```

## Integration with Forms

### Estimate Form
The BOMDisplay component can be integrated into the estimate form to provide detailed component information:

```jsx
// Inside EstimateForm component
return (
  <div className="estimate-form">
    {/* Other form fields */}
    
    <div className="product-summary">
      <h3>제품 정보</h3>
      {/* Product details */}
    </div>
    
    {productType && (
      <BOMDisplay
        productType={productType}
        selectedOptions={selectedOptions}
        quantity={quantity}
      />
    )}
    
    <div className="form-actions">
      <button onClick={saveEstimate}>견적서 저장</button>
      <button onClick={createPurchaseOrder}>주문서 생성</button>
      <button onClick={handlePrint}>인쇄</button>
    </div>
  </div>
);
```

### Purchase Order Form
```jsx
// Inside PurchaseOrderForm component
return (
  <div className="purchase-order-form">
    {/* Other form fields */}
    
    <div className="product-summary">
      <h3>제품 정보</h3>
      {/* Product details */}
    </div>
    
    {productType && (
      <BOMDisplay
        productType={productType}
        selectedOptions={selectedOptions}
        quantity={quantity}
      />
    )}
    
    <div className="form-actions">
      <button onClick={saveOrder}>주문서 저장</button>
      <button onClick={handlePrint}>인쇄</button>
    </div>
  </div>
);
```

## Print Integration
When printing, the BOMDisplay component will automatically use print-specific styles for better formatting. You can also pass the BOM data to a PrintService:

```jsx
import PrintService from '../utils/PrintService';

const handlePrint = () => {
  const components = BOMCalculator.calculateBOM(productType, selectedOptions, quantity);
  
  PrintService.printEstimate({
    // Other estimate data
    estimateNumber,
    date,
    customerName,
    contactInfo,
    productType,
    selectedOptions,
    quantity,
    unitPrice,
    totalPrice,
    components
  });
};
```

## Implementation Details

### Component Structure
The BOMDisplay component has the following internal structure:
1. Calculate components using BOMCalculator utility
2. Display components in a tabular format
3. Add explanatory notes

### CSS Classes
The component uses the following CSS classes:
- `.bom-display`: Main container
- `.bom-display.compact`: Compact version
- `.bom-table`: Table of components
- `.bom-notes`: Notes section

### Print Media Query
The component includes print-specific styling for proper formatting when printed:
```css
@media print {
  .bom-display {
    border: none;
    background-color: white;
    padding: 0;
    margin: 10px 0;
  }
  
  .bom-table {
    width: 100%;
  }
  
  .bom-table th,
  .bom-table td {
    border: 1px solid #000;
  }
  
  .bom-table th {
    background-color: #eee !important;
  }
}
```