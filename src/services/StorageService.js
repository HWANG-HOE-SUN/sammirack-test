/**
 * Service for persistent storage using localStorage
 */
export class StorageService {
  /**
   * Save data with a specific key
   * @param {String} key - Storage key
   * @param {Object} data - Data to store
   */
  saveData(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving data to localStorage:', error);
      throw new Error('Failed to save data. Storage may be full or unavailable.');
    }
  }

  /**
   * Load data for a specific key
   * @param {String} key - Storage key
   * @returns {Object|null} Retrieved data or null if not found
   */
  loadData(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error loading data from localStorage:', error);
      return null;
    }
  }

  /**
   * Remove data for a specific key
   * @param {String} key - Storage key
   */
  removeData(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Error removing data from localStorage:', error);
    }
  }

  /**
   * Get all data that matches a prefix
   * @param {String} prefix - Key prefix to match
   * @returns {Array} Array of objects with keys and values
   */
  getAllByPrefix(prefix) {
    const results = [];
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        
        if (key && key.startsWith(prefix)) {
          const value = this.loadData(key);
          if (value) {
            results.push({ key, value });
          }
        }
      }
    } catch (error) {
      console.error('Error retrieving data by prefix from localStorage:', error);
    }
    
    return results;
  }
}

// Create and export a singleton instance
export const storageService = new StorageService();