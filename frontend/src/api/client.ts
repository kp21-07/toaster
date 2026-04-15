import axios from 'axios';
import type { AnalysisResponse } from '../types';

// Create Axios Client
// We point to /api so Vite proxies it to localhost:8000
const apiClient = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

export const analyzeImage = async (file: File): Promise<AnalysisResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<AnalysisResponse>('/analyze-image', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });

    return response.data;
};
