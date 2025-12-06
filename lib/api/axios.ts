import axios from 'axios';

const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
api.interceptors.request.use(
    async (config) => {
        // We will inject the token here using a helper or context if needed.
        // However, since we are using Clerk, we often get the token in the component 
        // and pass it, or use a hook.
        // For now, let's allow passing 'Authorization' header manually if set.
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        // Handle specific error codes here (e.g., 401 logout)
        // const message = error.response?.data?.detail || error.message;
        // console.error('API Error:', message);
        return Promise.reject(error);
    }
);

export default api;
