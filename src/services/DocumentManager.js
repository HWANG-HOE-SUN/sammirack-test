import { EstimateDocument, PurchaseOrderDocument } from '../models/Document';
import { storageService } from './StorageService';

/**
 * Document Manager service for handling document operations
 */
export class DocumentManager {
  constructor() {
    this.storageKeyPrefix = {
      estimate: 'rack_estimate_',
      'purchase-order': 'rack_order_',
    };
  }

  /**
   * Create a new estimate document
   * @param {Object} data - Estimate data (must include priceSnapshot)
   * @returns {EstimateDocument} Created estimate document
   */
  createEstimate(data) {
    // data.components의 unitPrice는 이미 고정된 가격입니다.
    // data.priceSnapshot은 ProductContext에서 계산되어 넘어옵니다.
    const estimateDoc = new EstimateDocument(data);
    this.saveDocument(estimateDoc);
    return estimateDoc;
  }

  /**
   * Create a new purchase order document
   * @param {Object} data - Purchase order data
   * @returns {PurchaseOrderDocument} Created purchase order document
   */
  createPurchaseOrder(data) {
    const orderDoc = new PurchaseOrderDocument(data);
    this.saveDocument(orderDoc);
    return orderDoc;
  }

  /**
   * Convert an estimate to a purchase order
   * @param {String} estimateId - ID of the estimate to convert
   * @returns {PurchaseOrderDocument} Created purchase order document
   */
  convertEstimateToPurchaseOrder(estimateId) {
    const estimate = this.getDocumentById(estimateId);
    
    if (!estimate || estimate.type !== 'estimate') {
      throw new Error('Estimate not found');
    }

    // Create estimate document from raw data
    const estimateDoc = new EstimateDocument(estimate);
    const orderDoc = estimateDoc.convertToOrderDocument();
    
    // Save both the updated estimate and new order
    this.saveDocument(estimateDoc); // Update isConverted status
    this.saveDocument(orderDoc); // Save new purchase order
    
    return orderDoc;
  }

  /**
   * Get document history by type
   * @param {String} type - Document type (optional)
   * @returns {Array} Array of documents
   */
  getDocumentHistory(type = null) {
    let documents = [];
    
    if (type) {
      const prefix = this.storageKeyPrefix[type];
      if (!prefix) return [];
      
      const items = storageService.getAllByPrefix(prefix);
      documents = items.map(item => item.value);
    } else {
      // Get all document types
      Object.values(this.storageKeyPrefix).forEach(prefix => {
        const items = storageService.getAllByPrefix(prefix);
        documents = [...documents, ...items.map(item => item.value)];
      });
    }
    
    // Sort by creation date, newest first
    return documents.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  /**
   * Get a document by its ID
   * @param {String} id - Document ID
   * @returns {Object|null} Document or null if not found
   */
  getDocumentById(id) {
    // Check all document types
    for (const prefix of Object.values(this.storageKeyPrefix)) {
      const document = storageService.loadData(`${prefix}${id}`);
      if (document) return document;
    }
    return null;
  }

  /**
   * Save a document
   * @param {Document} document - Document to save
   * @returns {Boolean} True if successful
   */
  saveDocument(document) {
    try {
      const documentObj = document.toObject ? document.toObject() : document;
      const prefix = this.storageKeyPrefix[documentObj.type];
      
      if (!prefix) {
        throw new Error(`Unknown document type: ${documentObj.type}`);
      }
      
      storageService.saveData(`${prefix}${documentObj.id}`, documentObj);
      return true;
    } catch (error) {
      console.error('Error saving document:', error);
      return false;
    }
  }

  /**
   * Delete a document
   * @param {String} id - Document ID
   * @returns {Boolean} True if successful
   */
  deleteDocument(id) {
    try {
      const document = this.getDocumentById(id);
      
      if (!document) {
        return false; // Document not found
      }
      
      const prefix = this.storageKeyPrefix[document.type];
      storageService.removeData(`${prefix}${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      return false;
    }
  }
}

// Create and export a singleton instance
export const documentManager = new DocumentManager();
