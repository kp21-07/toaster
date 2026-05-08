import axios from 'axios';
import type { AnalysisResponse, VerificationResponse } from '../types';

// Create Axios Client
// We point to /api so Vite proxies it to localhost:8000
const apiClient = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

export const analyzeImage = async (file: File, calibrationPoints?: number[][], cropBox?: any): Promise<AnalysisResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    if (calibrationPoints) {
        formData.append('calibration_points', JSON.stringify(calibrationPoints));
    }
    if (cropBox) {
        formData.append('crop_box', JSON.stringify(cropBox));
    }

    const response = await apiClient.post<AnalysisResponse>('/analyze-image', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });

    return response.data;
};

export const detectCorners = async (file: File): Promise<{ corners: number[][] }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<{ corners: number[][] }>('/detect-corners', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};

export const preWarpImage = async (file: File, markers: number[][]): Promise<{ image: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('markers', JSON.stringify(markers));
    const response = await apiClient.post<{ image: string }>('/pre-warp', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};

export const solveCircuit = async (components: any[], wires: any[]): Promise<{ netlist: string }> => {
    const response = await apiClient.post<{ netlist: string }>('/solve-circuit', {
        components,
        wires,
        grounds: []
    });
    return response.data;
};

export const verifyCircuit = async (components: any[], wires: any[], grounds: string[], referenceSpice: string): Promise<VerificationResponse> => {
    const response = await apiClient.post<VerificationResponse>('/verify-circuit', {
        components,
        wires,
        grounds,
        reference_spice: referenceSpice
    });
    return response.data;
};
