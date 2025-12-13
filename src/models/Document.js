import { v4 as uuidv4 } from 'uuid';

/**
 * Base Document class representing a document in the system
 */
export class Document {
  /**
   * Create a document
   * @param {Object} data - Document initialization data
   */
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.type = data.type || 'document';
    this.createdAt = data.createdAt || new Date();
    this.customerInfo = data.customerInfo || {
      name: '',
      contact: '',
      email: '',
      address: '',
    };
    this.products = data.products || [];
    this.components = data.components || [];
    this.notes = data.notes || '';
  }

  /**
   * Calculate the total price of all components
   * @returns {Number} Total price
   */
  calculateTotal() {
    return this.components.reduce((sum, component) => sum + component.totalPrice, 0);
  }

  /**
   * Create a copy of this document as a different document type
   * @param {String} newType - Type of document to create
   * @returns {Document} New document instance
   */
  createCopy(newType) {
    const copy = { ...this };
    delete copy.id; // New ID will be generated
    copy.type = newType;
    copy.createdAt = new Date();
    
    if (newType === 'purchase-order') {
      return new PurchaseOrderDocument({
        ...copy,
        sourceEstimateId: this.id,
      });
    } else {
      return new Document(copy);
    }
  }

  /**
   * Convert to object for serialization
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      id: this.id,
      type: this.type,
      createdAt: this.createdAt.toISOString(),
      customerInfo: this.customerInfo,
      products: this.products,
      components: this.components,
      notes: this.notes,
    };
  }
}

/**
 * Estimate Document class
 */
export class EstimateDocument extends Document {
  /**
   * Create an estimate document
   * @param {Object} data - Document initialization data
   */
  constructor(data = {}) {
    super({ ...data, type: 'estimate' });
    this.estimateNumber = data.estimateNumber || `EST-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    this.validUntil = data.validUntil || new Date(new Date().setDate(new Date().getDate() + 30)); // Default valid for 30 days
    this.isConverted = data.isConverted || false;
    this.terms = data.terms || '본 견적서의 유효기간은 발행일로부터 30일입니다.\n견적 금액은 부가세 별도입니다.';
  }

  /**
   * Convert estimate to purchase order
   * @returns {PurchaseOrderDocument} New purchase order document
   */
  convertToOrderDocument() {
    const orderDocument = new PurchaseOrderDocument({
      customerInfo: this.customerInfo,
      products: this.products,
      components: this.components,
      notes: this.notes,
      sourceEstimateId: this.id,
      estimateNumber: this.estimateNumber,
    });
    
    this.isConverted = true;
    return orderDocument;
  }

  /**
   * Convert to object for serialization
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      ...super.toObject(),
      estimateNumber: this.estimateNumber,
      validUntil: this.validUntil.toISOString(),
      isConverted: this.isConverted,
      terms: this.terms,
    };
  }
}

/**
 * Purchase Order Document class
 */
export class PurchaseOrderDocument extends Document {
  /**
   * Create a purchase order document
   * @param {Object} data - Document initialization data
   */
  constructor(data = {}) {
    super({ ...data, type: 'purchase-order' });
    this.orderNumber = data.orderNumber || `PO-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    this.deliveryDate = data.deliveryDate || new Date(new Date().setDate(new Date().getDate() + 14)); // Default delivery in 2 weeks
    this.paymentTerms = data.paymentTerms || '계좌이체 (선입금 50%, 납품 후 잔금 50%)';
    this.sourceEstimateId = data.sourceEstimateId || null;
    this.estimateNumber = data.estimateNumber || null;
    this.status = data.status || 'pending'; // pending, processing, shipped, delivered, cancelled
  }

  /**
   * Convert to object for serialization
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      ...super.toObject(),
      orderNumber: this.orderNumber,
      deliveryDate: this.deliveryDate.toISOString(),
      paymentTerms: this.paymentTerms,
      sourceEstimateId: this.sourceEstimateId,
      estimateNumber: this.estimateNumber,
      status: this.status,
    };
  }
}