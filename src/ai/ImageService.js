/**
 * ImageService - Handles image generation for Chapter Mood Art
 * Two-step pipeline: LLM generates prompt → Image API renders
 */

export class ImageService {
    constructor(app) {
        this.app = app;
    }

    /**
     * Check if image service is configured
     */
    isConfigured() {
        const settings = this.app.state.settings;
        // Use main API settings if image-specific ones aren't set
        const provider = settings.imageProvider || settings.aiProvider;
        const apiKey = settings.imageApiKey || settings.aiApiKey;
        const model = settings.imageModel;

        return provider && apiKey && model;
    }

    /**
     * Get effective settings (falls back to main API if not set)
     */
    getSettings() {
        const settings = this.app.state.settings;
        return {
            provider: settings.imageProvider || settings.aiProvider,
            apiKey: settings.imageApiKey || settings.aiApiKey,
            model: settings.imageModel || 'z-image-turbo',
            stylePrefix: settings.imageStylePrefix || ''
        };
    }

    /**
     * Generate chapter mood art using two-step pipeline
     * Step 1: LLM analyzes chapter → generates image prompt
     * Step 2: Image API generates image from styled prompt
     */
    async generateChapterArt(chapterContent, chapterTitle) {
        if (!this.isConfigured()) {
            throw new Error('Image API not configured. Please add settings in API Configuration.');
        }

        // Step 1: Generate image prompt using LLM
        const imagePrompt = await this.generateImagePrompt(chapterContent, chapterTitle);

        // Step 2: Apply style prefix and generate image
        const settings = this.getSettings();
        const styledPrompt = settings.stylePrefix
            ? `${settings.stylePrefix}. ${imagePrompt}`
            : imagePrompt;

        // Step 3: Call image API
        const imageData = await this.generateImage(styledPrompt);

        return {
            imageData,
            prompt: imagePrompt,
            styledPrompt,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Add generated image to global gallery
     * Now saves to filesystem and stores only filename
     */
    async addToGallery(imageData, prompt, meta = {}) {
        const gallery = this.getGallery();
        const id = Date.now().toString();

        // Try to save to filesystem
        let filename = null;
        try {
            if (this.app.fileStorage?.isSupported()) {
                filename = await this.app.fileStorage.saveImage(imageData, `gallery-${id}`);
            }
        } catch (err) {
            console.error('[ImageService] Failed to save to filesystem:', err);
        }

        const newItem = {
            id,
            // Store filename if saved to file, otherwise fall back to base64 (legacy)
            filename: filename || null,
            imageData: filename ? null : imageData, // Only store base64 if no file
            prompt,
            meta,
            timestamp: new Date().toISOString()
        };

        gallery.unshift(newItem);

        // Limit history to 50 images
        if (gallery.length > 50) {
            const removed = gallery.pop();
            // Delete old file if it exists
            if (removed?.filename && this.app.fileStorage) {
                this.app.fileStorage.deleteImage(removed.filename).catch(() => { });
            }
        }

        this.app.state.imageGallery = gallery;
        this.app.save();
        return newItem;
    }

    /**
     * Get image gallery
     */
    getGallery() {
        if (!this.app.state.imageGallery) {
            this.app.state.imageGallery = [];
        }
        return this.app.state.imageGallery;
    }

    /**
     * Load image data for a gallery item
     * Handles both file-based and legacy base64 storage
     */
    async loadGalleryImage(item) {
        if (item.imageData) {
            // Legacy base64 format
            return item.imageData;
        }
        if (item.filename && this.app.fileStorage) {
            // Load from file
            return await this.app.fileStorage.loadImage(item.filename);
        }
        return null;
    }

    /**
     * Remove image from gallery
     */
    async removeFromGallery(id) {
        const gallery = this.getGallery();
        const index = gallery.findIndex(item => item.id === id);
        if (index !== -1) {
            const removed = gallery[index];

            // Delete file if exists
            if (removed.filename && this.app.fileStorage) {
                await this.app.fileStorage.deleteImage(removed.filename);
            }

            gallery.splice(index, 1);
            this.app.state.imageGallery = gallery;
            this.app.save();
            return true;
        }
        return false;
    }

    /**
     * Use LLM to analyze chapter and generate an image prompt
     */
    async generateImagePrompt(chapterContent, chapterTitle) {
        const systemPrompt = `You generate image prompts for AI image generators. Output ONLY comma-separated visual keywords, NO prose or sentences.

FORMAT: [main subject], [setting/location], [time of day], [lighting], [weather/atmosphere], [key objects], [color palette]

RULES:
- Use concrete nouns and adjectives only
- NO flowery language, NO metaphors, NO emotions
- NO character names or story details
- Keep under 30 words
- Think like a photographer describing a shot

GOOD: "dark forest clearing, night, moonlight through trees, fog, ancient stone altar, blue and silver tones"
BAD: "A mysterious atmosphere of tension and foreboding fills the ancient woods"`;

        const userPrompt = `Analyze this chapter and output image prompt keywords.

Chapter: "${chapterTitle}"

Text excerpt:
${chapterContent.substring(0, 2000)}

Image prompt keywords:`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        // Use main AI service for prompt generation
        let response = '';
        await this.app.aiService.sendMessageStream(
            messages,
            (chunk, accumulated) => { response = accumulated; }
        );

        return response.trim();
    }

    /**
     * Call image generation API
     * Supports NanoGPT's /api/generate-image endpoint
     */
    async generateImage(prompt) {
        const settings = this.getSettings();

        // Build endpoint URL for NanoGPT
        let baseUrl = settings.provider;
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        // Remove /v1 suffix if present (NanoGPT uses different path)
        baseUrl = baseUrl.replace(/\/v1$/, '');
        const endpoint = `${baseUrl}/api/generate-image`;

        const requestBody = {
            model: settings.model,
            prompt: prompt,
            n: 1,
            size: '512x512'
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`,
                'x-api-key': settings.apiKey  // NanoGPT may use this header
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Image generation failed: ${response.status} - ${error}`);
        }

        const data = await response.json();

        // Handle NanoGPT response format
        // NanoGPT may return { url: "..." } or { data: [...] }
        if (data.url) {
            return await this.urlToBase64(data.url);
        } else if (data.data && data.data[0]) {
            if (data.data[0].b64_json) {
                return `data:image/png;base64,${data.data[0].b64_json}`;
            } else if (data.data[0].url) {
                return await this.urlToBase64(data.data[0].url);
            }
        } else if (data.image) {
            // Some APIs return { image: "base64..." }
            return `data:image/png;base64,${data.image}`;
        }

        console.error('Unexpected response:', data);
        throw new Error('Unexpected image API response format');
    }

    /**
     * Convert image URL to base64 data URL
     */
    async urlToBase64(url) {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}
