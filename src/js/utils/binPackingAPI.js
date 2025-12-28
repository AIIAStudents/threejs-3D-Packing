/**
 * @file API utilities for interacting with the bin packing backend service.
 */

// FIX: Centralize API configuration using environment variables with a fallback.
// This unifies the target URL and prevents inconsistencies.
const BASE_URL = import.meta.env?.VITE_PACK_API_BASE 
  || (typeof process !== 'undefined' ? process.env.PACK_API_BASE : null) 
  || "http://localhost:8888";

// FIX: Unify API endpoints to match the backend routing.
const PACK_ENDPOINT = "/api/pack_objects";
const JOB_STATUS_ENDPOINT = "/api/jobs/status";

/**
 * Creates a request payload for the packing API.
 * Note: This is a sample structure.
 */
export function createPackRequest(objects, containerSize, options = {}) {
    const packableObjects = objects.map(obj => ({
        uuid: obj.userData.id, // Send database ID
        name: obj.name || 'item',
        dimensions: {
            width: obj.geometry.parameters.width,
            height: obj.geometry.parameters.height,
            depth: obj.geometry.parameters.depth,
        }
    }));

    return {
        objects: packableObjects,
        container_size: containerSize,
        optimization_type: options.optimization_type || 'volume_utilization',
        algorithm: options.algorithm || 'blf_sa',
        async_mode: options.async_mode || false,
        timeout: options.timeout || 30
    };
}

/**
 * Sends a request to the bin packing backend API.
 */
export async function requestBinPacking(requestPayload) {
    const API_URL = `${BASE_URL}${PACK_ENDPOINT}`;
    console.log('📦 Sending packing request to API:', API_URL, requestPayload);

    // FIX: Implement enhanced error handling for better debugging.
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status} - ${text.slice(0, 200)}`);
        }

        const result = await response.json();
        console.log('📦 Bin Packing 請求結果:', result);
        return result;

    } catch (e) {
        console.error("❌ Error calling Bin Packing API:", e);
        throw new Error(`BinPacking API 無法連線：${API_URL}，請檢查後端是否啟動、CORS/HTTPS、路徑與埠號。原始錯誤：${e.message}`);
    }
}

/**
 * Polls the backend for the status of an asynchronous packing job until it's complete.
 */
export async function pollJobUntilComplete(jobId, onProgress) {
    const POLL_URL = `${BASE_URL}${JOB_STATUS_ENDPOINT}/${jobId}`;
    const MAX_POLLS = 120; // Max polls (e.g., 120 * 1s = 2 minutes timeout)
    const POLL_INTERVAL = 1000; // 1 second
    let pollCount = 0;

    return new Promise((resolve, reject) => {
        const poll = async () => {
            if (pollCount >= MAX_POLLS) {
                return reject(new Error(`Polling timed out for job ${jobId}.`));
            }
            pollCount++;

            try {
                const response = await fetch(POLL_URL);
                if (!response.ok) {
                    const errorText = await response.text();
                    return reject(new Error(`Polling failed for job ${jobId} with status ${response.status}: ${errorText}`));
                }

                const data = await response.json();
                console.log(`🔄 Polling job ${jobId}: Status = ${data.status}, Progress = ${data.progress}%`);

                if (typeof onProgress === 'function') {
                    onProgress({
                        status: data.status,
                        progress: data.progress,
                        text: data.text || `正在處理中... (${data.progress}%)`
                    });
                }

                if (data.status === 'completed') {
                    console.log(`✅ Job ${jobId} completed.`);
                    resolve(data.result); // Resolve with the final result
                } else if (data.status === 'failed') {
                    return reject(new Error(data.error || `Job ${jobId} failed.`));
                } else {
                    setTimeout(poll, POLL_INTERVAL);
                }
            } catch (e) {
                return reject(new Error(`An error occurred while polling job ${jobId}: ${e.message}`));
            }
        };
        poll();
    });
}