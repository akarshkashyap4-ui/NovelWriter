/**
 * FileStorage - External file storage for images using File System Access API
 * Saves images to local filesystem instead of localStorage to avoid quota limits
 */

export class FileStorage {
    constructor(app) {
        this.app = app;
        this.directoryHandle = null;
        this.imagesFolder = null;
    }

    /**
     * Check if File System Access API is supported
     */
    isSupported() {
        return 'showDirectoryPicker' in window;
    }

    /**
     * Initialize/get the images folder
     * Will prompt user to select folder if not already granted
     */
    async getImagesFolder() {
        // Already have access
        if (this.imagesFolder) {
            return this.imagesFolder;
        }

        // Try to restore from IndexedDB (persistent handle)
        const savedHandle = await this.restoreHandle();
        if (savedHandle) {
            // Verify we still have permission
            const permission = await savedHandle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                this.imagesFolder = savedHandle;
                return this.imagesFolder;
            }
            // Request permission again
            const newPermission = await savedHandle.requestPermission({ mode: 'readwrite' });
            if (newPermission === 'granted') {
                this.imagesFolder = savedHandle;
                return this.imagesFolder;
            }
        }

        // No saved handle or permission denied - ask user to pick folder
        return await this.pickFolder();
    }

    /**
     * Prompt user to select the images folder
     */
    async pickFolder() {
        try {
            const handle = await window.showDirectoryPicker({
                id: 'novelwriter-images',
                mode: 'readwrite',
                startIn: 'documents'
            });

            this.imagesFolder = handle;

            // Save handle for persistence across sessions
            await this.saveHandle(handle);

            return handle;
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('User cancelled folder selection');
                return null;
            }
            throw err;
        }
    }

    /**
     * Save directory handle to IndexedDB for persistence
     */
    async saveHandle(handle) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('NovelWriterFS', 1);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('handles')) {
                    db.createObjectStore('handles');
                }
            };

            request.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction('handles', 'readwrite');
                const store = tx.objectStore('handles');
                store.put(handle, 'imagesFolder');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Restore directory handle from IndexedDB
     */
    async restoreHandle() {
        return new Promise((resolve) => {
            const request = indexedDB.open('NovelWriterFS', 1);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('handles')) {
                    db.createObjectStore('handles');
                }
            };

            request.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction('handles', 'readonly');
                const store = tx.objectStore('handles');
                const getRequest = store.get('imagesFolder');
                getRequest.onsuccess = () => resolve(getRequest.result || null);
                getRequest.onerror = () => resolve(null);
            };

            request.onerror = () => resolve(null);
        });
    }

    /**
     * Save image to filesystem
     * @param {string} base64Data - Base64 data URL (data:image/png;base64,...)
     * @param {string} filename - Filename without extension
     * @returns {string} - The filename that was saved
     */
    async saveImage(base64Data, filename) {
        const folder = await this.getImagesFolder();
        if (!folder) {
            throw new Error('No images folder selected. Please select a folder first.');
        }

        // Parse base64 data
        const [header, data] = base64Data.split(',');
        const mimeMatch = header.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const extension = mimeType.split('/')[1] || 'png';

        // Convert base64 to blob
        const byteString = atob(data);
        const arrayBuffer = new ArrayBuffer(byteString.length);
        const uint8Array = new Uint8Array(arrayBuffer);
        for (let i = 0; i < byteString.length; i++) {
            uint8Array[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([uint8Array], { type: mimeType });

        // Create file
        const fullFilename = `${filename}.${extension}`;
        const fileHandle = await folder.getFileHandle(fullFilename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();

        console.log(`[FileStorage] Saved image: ${fullFilename}`);
        return fullFilename;
    }

    /**
     * Load image from filesystem
     * @param {string} filename - Filename to load
     * @returns {string} - Base64 data URL
     */
    async loadImage(filename) {
        const folder = await this.getImagesFolder();
        if (!folder) {
            throw new Error('No images folder access');
        }

        try {
            const fileHandle = await folder.getFileHandle(filename);
            const file = await fileHandle.getFile();

            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        } catch (err) {
            console.error(`[FileStorage] Failed to load image: ${filename}`, err);
            return null;
        }
    }

    /**
     * Delete image from filesystem
     * @param {string} filename - Filename to delete
     */
    async deleteImage(filename) {
        const folder = await this.getImagesFolder();
        if (!folder) return false;

        try {
            await folder.removeEntry(filename);
            console.log(`[FileStorage] Deleted image: ${filename}`);
            return true;
        } catch (err) {
            console.error(`[FileStorage] Failed to delete image: ${filename}`, err);
            return false;
        }
    }

    /**
     * Check if we have an images folder selected
     */
    async hasFolder() {
        if (this.imagesFolder) return true;
        const saved = await this.restoreHandle();
        return saved !== null;
    }
}
